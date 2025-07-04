import { ClineMessage } from "@roo-code/types"
import { combineApiRequests } from "@roo/combineApiRequests"
import { combineCommandSequences } from "@roo/combineCommandSequences"
import { ClineSayBrowserAction } from "@roo/ExtensionMessage"

export type ProcessedMessage = ClineMessage | ClineMessage[]

function isBrowserSessionMessage(message: ClineMessage): boolean {
	if (message.type === "ask") {
		return ["browser_action_launch"].includes(message.ask!)
	}

	if (message.type === "say") {
		return ["api_req_started", "text", "browser_action", "browser_action_result"].includes(message.say!)
	}

	return false
}

export function processChatHistory(
	messages: ClineMessage[],
	isCondensing: boolean,
	everVisibleMessagesTsRef: React.MutableRefObject<any>,
): ProcessedMessage[] {
	if (messages.length === 0) return []

	const baseMessages = messages.slice(1)
	const combined = combineApiRequests(combineCommandSequences(baseMessages))

	const visibleMessages = combined.filter((message) => {
		if (everVisibleMessagesTsRef.current.has(message.ts)) {
			// If it was ever visible, and it's not one of the types that should always be hidden once processed, keep it.
			// This helps prevent flickering for messages like 'api_req_retry_delayed' if they are no longer the absolute last.
			const alwaysHiddenOnceProcessedAsk = ["api_req_failed", "resume_task", "resume_completed_task"]
			const alwaysHiddenOnceProcessedSay = [
				"api_req_finished",
				"api_req_retried",
				"api_req_deleted",
				"mcp_server_request_started",
			]
			if (message.ask && alwaysHiddenOnceProcessedAsk.includes(message.ask)) return false
			if (message.say && alwaysHiddenOnceProcessedSay.includes(message.say)) return false
			// Also, re-evaluate empty text messages if they were previously visible but now empty (e.g. partial stream ended)
			if (message.say === "text" && (message.text ?? "") === "" && (message.images?.length ?? 0) === 0) {
				return false
			}
			return true
		}

		// Original filter logic
		switch (message.ask) {
			case "completion_result":
				if (message.text === "") return false
				break
			case "api_req_failed":
			case "resume_task":
			case "resume_completed_task":
				return false
		}
		switch (message.say) {
			case "api_req_finished":
			case "api_req_retried":
			case "api_req_deleted":
				return false
			case "api_req_retry_delayed": {
				const last1 = combined.at(-1)
				const last2 = combined.at(-2)
				if (last1?.ask === "resume_task" && last2 === message) {
					// This specific sequence should be visible
				} else if (message !== last1) {
					// If not the specific sequence above, and not the last message, hide it.
					return false
				}
				break
			}
			case "text":
				if ((message.text ?? "") === "" && (message.images?.length ?? 0) === 0) return false
				break
			case "mcp_server_request_started":
				return false
		}
		return true
	})

	// Update the set of ever-visible messages (LRUCache automatically handles cleanup)
	visibleMessages.forEach((msg) => everVisibleMessagesTsRef.current.set(msg.ts, true))

	const result: ProcessedMessage[] = []
	let currentGroup: ClineMessage[] = []
	let isInBrowserSession = false

	const endBrowserSession = () => {
		if (currentGroup.length > 0) {
			result.push([...currentGroup])
			currentGroup = []
			isInBrowserSession = false
		}
	}

	visibleMessages.forEach((message) => {
		if (message.ask === "browser_action_launch") {
			endBrowserSession()
			isInBrowserSession = true
			currentGroup.push(message)
		} else if (isInBrowserSession) {
			if (message.say === "api_req_started") {
				const lastApiReqStarted = [...currentGroup].reverse().find((m) => m.say === "api_req_started")
				if (lastApiReqStarted?.text) {
					const info = JSON.parse(lastApiReqStarted.text)
					if (info.cancelReason) {
						endBrowserSession()
						result.push(message)
						return
					}
				}
			}

			if (isBrowserSessionMessage(message)) {
				currentGroup.push(message)
				if (message.say === "browser_action") {
					const browserAction = JSON.parse(message.text || "{}") as ClineSayBrowserAction
					if (browserAction.action === "close") {
						endBrowserSession()
					}
				}
			} else {
				endBrowserSession()
				result.push(message)
			}
		} else {
			result.push(message)
		}
	})

	if (currentGroup.length > 0) {
		result.push([...currentGroup])
	}

	if (isCondensing) {
		result.push({
			type: "say",
			say: "condense_context",
			ts: Date.now(),
			partial: true,
		})
	}

	return result
}
