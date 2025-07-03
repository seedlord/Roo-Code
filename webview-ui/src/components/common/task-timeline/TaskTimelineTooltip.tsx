import React from "react"
import { ClineMessage } from "@roo-code/types"
import { Trans } from "react-i18next"
import { safeJsonParse } from "@roo/safeJsonParse"
import { ClineSayTool } from "@roo/ExtensionMessage"
import { t } from "i18next"
import { getToolMetadata } from "./toolManager"
import { getMessageColor } from "./messageUtils"

const MAX_CONTENT_LENGTH = 200

interface TaskTimelineTooltipProps {
	message: ClineMessage
}

const TaskTimelineTooltip: React.FC<TaskTimelineTooltipProps> = ({ message }) => {
	const getMessageDescription = (message: ClineMessage): React.ReactNode => {
		const tool = message.ask === "tool" ? safeJsonParse<ClineSayTool>(message.text) : null
		let description: React.ReactNode = null

		if (tool) {
			const metadata = getToolMetadata(tool.tool)
			if (metadata) {
				description = metadata.getDescription(tool)
			}
		}

		// A progress text is considered a "status" if it contains any digit.
		const isStatusProgress = message.progressStatus?.text && /\d/.test(message.progressStatus.text)

		// If we have a base description and a status-like progress, combine them.
		if (description && isStatusProgress) {
			return (
				<>
					{description} ({message.progressStatus?.text})
				</>
			)
		}

		// If there's any other progress text (likely a full sentence), show it with priority.
		if (message.progressStatus?.text) {
			return message.progressStatus.text
		}

		// Otherwise, fall back to the base description if it exists.
		if (description) {
			return description
		}

		// Fallback for non-tool messages or unhandled tools
		if (message.type === "say") {
			switch (message.say) {
				case "user_feedback":
					return "User Message"
				case "user_feedback_diff":
					return "User Edits"
				case "text":
					return "Assistant Response"
				case "subtask_result":
					return t("chat:subtasks.resultContent")
				case "command_output":
					return "Terminal Output"
				case "browser_action":
					return "Browser Action"
				case "browser_action_result":
					return "Browser Result"
				case "completion_result":
					return "Task Completed"
				case "api_req_started":
					return "API Streaming Failed"
				case "codebase_search_result": {
					const parsed = safeJsonParse<{ content: { query: string; results: unknown[] } }>(message.text)
					const query = parsed?.content?.query || ""
					const count = parsed?.content?.results?.length || 0
					return (
						<Trans
							i18nKey="chat:codebaseSearch.didSearch"
							components={{ code: <code /> }}
							values={{ query, count }}
						/>
					)
				}
				case "error":
				case "rooignore_error":
				case "diff_error":
				case "condense_context_error":
					return "Error"
				case "api_req_deleted":
					return "API Request Aborted"
				default:
					return message.say || "Unknown"
			}
		} else if (message.type === "ask") {
			switch (message.ask) {
				case "followup":
					return t("chat:questions.hasQuestion")
				case "tool":
					return `Tool Approval: ${tool?.tool || ""}`
				case "command":
					return "Terminal Command"
				case "browser_action_launch":
					return "Browser Action Approval"
				case "mistake_limit_reached":
					return "Error Limit Reached"
				case "api_req_failed":
					return "API Request Failed"
				default:
					return message.ask || "Unknown"
			}
		}
		return "Unknown Message Type"
	}

	const getMessageContent = (message: ClineMessage): string => {
		if (message.text) {
			try {
				const parsedJson = safeJsonParse<any>(message.text, undefined, false)

				// Handle API streaming failure message
				if (message.say === "api_req_started" && parsedJson?.streamingFailedMessage) {
					return parsedJson.streamingFailedMessage
				}

				// Handle tool calls
				if (parsedJson?.tool) {
					const toolData = parsedJson as ClineSayTool
					switch (toolData.tool) {
						case "switchMode":
							return toolData.reason || ""
						case "newTask":
							return toolData.content || ""
						case "newFileCreated":
						case "insertContent":
							return toolData.content || ""
						case "appliedDiff":
						case "editedExistingFile":
						case "searchAndReplace":
							return toolData.diff || ""
						// For read-only tools, we don't need to show a content body
						case "readFile":
						case "listFilesTopLevel":
						case "listCodeDefinitionNames":
						case "searchFiles":
						case "codebaseSearch":
							return ""
						// Default to showing the JSON for unhandled tools
						default:
							return JSON.stringify(toolData, null, 2)
					}
				}
			} catch (_e) {
				// Not a JSON string, fall through to default text handling
			}
		}

		if (message.type === "ask" && message.ask === "followup") {
			const parsed = safeJsonParse<{ question: string; suggest: { answer: string }[] }>(
				message.text,
				undefined,
				false,
			)
			if (parsed) {
				const suggestions = parsed.suggest?.map((s) => `- ${s.answer}`).join("\n")
				return `${parsed.question}\n${suggestions}`
			}
			return message.text || ""
		}

		// Default text handling
		if (message.text && message.text.length > MAX_CONTENT_LENGTH) {
			return message.text.substring(0, MAX_CONTENT_LENGTH) + "..."
		}
		return message.text || ""
	}

	const getTimestamp = (message: ClineMessage): string => {
		if (message.ts) {
			const messageDate = new Date(message.ts)
			const today = new Date()

			const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
			const messageDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate())

			const time = messageDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })

			const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
			const monthName = monthNames[messageDate.getMonth()]

			if (messageDateOnly.getTime() === todayDate.getTime()) {
				return `${time}`
			} else if (messageDate.getFullYear() === today.getFullYear()) {
				return `${monthName} ${messageDate.getDate()} ${time}`
			} else {
				return `${monthName} ${messageDate.getDate()}, ${messageDate.getFullYear()} ${time}`
			}
		}
		return ""
	}

	const messageContent = getMessageContent(message)
	const timestamp = getTimestamp(message)

	return (
		<div
			style={{
				backgroundColor: "var(--vscode-editor-background)",
				color: "var(--vscode-editor-foreground)",
				border: "1px solid var(--vscode-widget-border)",
				borderRadius: "3px",
				padding: "8px",
				width: "100%", // Fill the container width
				boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
				fontSize: "12px",
			}}>
			<div style={{ fontWeight: "bold", marginBottom: "4px", display: "flex", alignItems: "center" }}>
				<div
					style={{
						width: "10px",
						height: "10px",
						minWidth: "10px", // Ensure fixed width
						minHeight: "10px", // Ensure fixed height
						borderRadius: "50%",
						backgroundColor: getMessageColor(message),
						marginRight: "8px",
						display: "inline-block",
						flexShrink: 0, // Prevent shrinking when space is limited
					}}
				/>
				{getMessageDescription(message)}
				{timestamp && (
					<span style={{ fontWeight: "normal", fontSize: "10px", marginLeft: "8px" }}>{timestamp}</span>
				)}
			</div>
			{messageContent && (
				<div
					style={{
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
						maxHeight: "150px",
						overflowY: "auto",
						fontSize: "11px",
						fontFamily: "var(--vscode-editor-font-family)",
						backgroundColor: "var(--vscode-textBlockQuote-background)",
						padding: "4px",
						borderRadius: "2px",
					}}>
					{messageContent}
				</div>
			)}
		</div>
	)
}

export default TaskTimelineTooltip
