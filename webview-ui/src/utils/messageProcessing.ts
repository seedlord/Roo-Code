import { ClineMessage } from "@roo-code/types"
import { combineApiRequests } from "@roo/combineApiRequests"
import { combineCommandSequences } from "@roo/combineCommandSequences"
import { ClineSayBrowserAction } from "@roo/ExtensionMessage"
import { safeJsonParse } from "../../../src/shared/safeJsonParse"

export type ProcessedMessage = ClineMessage | ClineMessage[]

/**
 * Represents the parsed information from an 'api_req_started' message text.
 */
interface ApiReqStartedInfo {
	cancelReason?: string
}

function isBrowserSessionMessage(message: ClineMessage): boolean {
	if (message.type === "ask") {
		return ["browser_action_launch"].includes(message.ask!)
	}

	if (message.type === "say") {
		return ["api_req_started", "text", "browser_action", "browser_action_result"].includes(message.say!)
	}

	return false
}

/**
 * Processes a list of ClineMessages to prepare them for display in the chat history.
 * This function performs several key transformations:
 *
 * 1.  **Initial Message Removal:** It discards the first message, which is typically a
 *     non-displayable initialization message.
 *
 * 2.  **Sequence Combination:** It combines consecutive `api_request` and `command_sequence`
 *     messages into single, more readable entries.
 *
 * 3.  **Visibility Filtering:** It filters out messages that are not intended for display,
 *     such as internal state messages (`api_req_finished`, `resume_task`). It also
 *     includes logic to prevent UI "flickering" by remembering messages that were
 *     once visible.
 *
 * 4.  **Browser Session Grouping:** It groups related messages that occur within a
 *     "browser session" (initiated by `browser_action_launch` and terminated by a
 *     `close` action or an unrelated message) into a single collapsible array.
 *
 * 5.  **Condensation Indicator:** If the `isCondensing` flag is true, it appends a
 *     special `condense_context` message to indicate that the history has been
 *     condensed.
 *
 * @param messages The original array of `ClineMessage` objects from the task.
 * @param isCondensing A boolean flag indicating if the context is currently being condensed.
 * @param everVisibleMessagesTsRef A React ref object holding an LRUCache instance. This cache
 *        is used to track the timestamps (`ts`) of messages that have been visible at least
 *        once, preventing them from disappearing on re-renders if their visibility
 *        conditions change.
 * @returns An array of `ProcessedMessage` objects, where each element is either a single
 *          `ClineMessage` or an array of `ClineMessage`s representing a grouped session.
 */
export function processChatHistory(
	messages: ClineMessage[],
	isCondensing: boolean,
	everVisibleMessagesTsRef: React.MutableRefObject<any>,
): ProcessedMessage[] {
	// Edge case: If no messages are present, return an empty array
	if (messages.length === 0) return []

	// Remove the first message, as it's often an initialization message not meant for display
	const baseMessages = messages.slice(1)
	// Combine consecutive API requests and command sequences for simplified display
	const combined = combineApiRequests(combineCommandSequences(baseMessages))

	// Filters messages to obtain only the visible ones
	const visibleMessages = combined.filter((message) => {
		// Check if the message has been visible before
		if (everVisibleMessagesTsRef.current.has(message.ts)) {
			// If it was ever visible, and it's not one of the types that should always be hidden once processed, keep it
			// This helps prevent flickering for messages like 'api_req_retry_delayed' if they are no longer the absolute last
			const alwaysHiddenOnceProcessedAsk = ["api_req_failed", "resume_task", "resume_completed_task"]
			const alwaysHiddenOnceProcessedSay = [
				"api_req_finished",
				"api_req_retried",
				"api_req_deleted",
				"mcp_server_request_started",
			]
			if (message.ask && alwaysHiddenOnceProcessedAsk.includes(message.ask)) return false
			if (message.say && alwaysHiddenOnceProcessedSay.includes(message.say)) return false
			// Re-evaluate empty text messages: If they were previously visible but now empty (e.g. partial stream ended), hide them
			if (message.say === "text" && (message.text ?? "") === "" && (message.images?.length ?? 0) === 0) {
				return false
			}
			return true
		}

		// Original filter logic for messages that haven't been visible yet
		switch (message.ask) {
			case "completion_result":
				// Edge case: Hide empty completion_result messages
				if (message.text === "") return false
				break
			case "api_req_failed":
			case "resume_task":
			case "resume_completed_task":
				// These messages are always hidden
				return false
		}
		switch (message.say) {
			case "api_req_finished":
			case "api_req_retried":
			case "api_req_deleted":
				// These messages are always hidden
				return false
			case "api_req_retry_delayed": {
				// Special handling for 'api_req_retry_delayed':
				// Only visible if it's part of a specific sequence (resume_task followed by this message)
				// or if it's the absolute last message
				const last1 = combined.at(-1)
				const last2 = combined.at(-2)
				if (last1?.ask === "resume_task" && last2 === message) {
					// This specific sequence should be visible
				} else if (message !== last1) {
					// If not the specific sequence above, and not the last message, hide it
					return false
				}
				break
			}
			case "text":
				// Edge case: Hide empty text messages
				if ((message.text ?? "") === "" && (message.images?.length ?? 0) === 0) return false
				break
			case "mcp_server_request_started":
				// This message is always hidden
				return false
		}
		return true
	})

	// Update the set of ever-visible messages (LRUCache automatically handles cleanup)
	visibleMessages.forEach((msg) => everVisibleMessagesTsRef.current.set(msg.ts, true))

	const result: ProcessedMessage[] = []
	let currentGroup: ClineMessage[] = []
	let isInBrowserSession = false

	/**
	 * Ends the current browser session, if active,
	 * and adds the collected messages to the result list
	 */
	const endBrowserSession = () => {
		if (currentGroup.length > 0) {
			result.push([...currentGroup]) // Add the group as an array
			currentGroup = [] // Reset the current group
			isInBrowserSession = false // End browser session mode
		}
	}

	// Iterate over visible messages to group browser sessions
	visibleMessages.forEach((message) => {
		if (message.ask === "browser_action_launch") {
			// If a new browser session is launched, end the previous one and start a new one
			endBrowserSession()
			isInBrowserSession = true
			currentGroup.push(message)
		} else if (isInBrowserSession) {
			// If we are within a browser session:
			if (message.say === "api_req_started") {
				// Check if a previous api_req_started message had a cancel reason
				const lastApiReqStarted = [...currentGroup].reverse().find((m) => m.say === "api_req_started")
				if (lastApiReqStarted?.text) {
					const info = safeJsonParse<ApiReqStartedInfo>(lastApiReqStarted.text)
					if (info?.cancelReason) {
						// If a cancel reason exists, end the current session and add the message individually
						endBrowserSession()
						result.push(message)
						return // Skip the rest of the loop for this message
					}
				}
			}

			// If the message is part of the browser session, add it to the current group
			if (isBrowserSessionMessage(message)) {
				currentGroup.push(message)
				// If it's a "close" action, end the browser session
				if (message.say === "browser_action") {
					const browserAction = safeJsonParse<ClineSayBrowserAction>(message.text)
					if (browserAction?.action === "close") {
						endBrowserSession()
					}
				}
			} else {
				// If the message is not part of the browser session, end the current session
				// and add the message individually to the result list
				endBrowserSession()
				result.push(message)
			}
		} else {
			// If we are not in a browser session, add the message individually
			result.push(message)
		}
	})

	// Add the last remaining group, if any
	if (currentGroup.length > 0) {
		result.push([...currentGroup])
	}

	// If the context is condensing, add a special "condense_context" message
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
