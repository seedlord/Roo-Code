import React from "react"
import { ClineMessage } from "@roo-code/types"
import * as COLOR from "../colors"
import { readTools, editTools, commandTools, flowTools, askTools } from "./toolCategories"
import { Trans } from "react-i18next"
import { safeJsonParse } from "@roo/safeJsonParse"
import { ClineSayTool } from "@roo/ExtensionMessage"
import { t } from "i18next"

// Color mapping for different message types

interface TaskTimelineTooltipProps {
	message: ClineMessage
}

const TaskTimelineTooltip: React.FC<TaskTimelineTooltipProps> = ({ message }) => {
	const getMessageDescription = (message: ClineMessage): React.ReactNode => {
		if (message.progressStatus?.text) {
			return message.progressStatus.text
		}

		const tool = message.ask === "tool" ? safeJsonParse<ClineSayTool>(message.text) : null
		if (tool) {
			switch (tool.tool) {
				case "codebaseSearch":
					return tool.path ? (
						<Trans
							i18nKey="chat:codebaseSearch.wantsToSearchWithPath"
							components={{ code: <code /> }}
							values={{ query: tool.query, path: tool.path }}
						/>
					) : (
						<Trans
							i18nKey="chat:codebaseSearch.wantsToSearch"
							components={{ code: <code /> }}
							values={{ query: tool.query }}
						/>
					)
				case "readFile": {
					const title =
						tool.batchFiles && Array.isArray(tool.batchFiles)
							? `${t("chat:fileOperations.wantsToReadMultiple")} ${tool.batchFiles.map((f: any) => f.path).join(", ")}`
							: tool.isOutsideWorkspace
								? t("chat:fileOperations.wantsToReadOutsideWorkspace")
								: tool.additionalFileCount && tool.additionalFileCount > 0
									? t("chat:fileOperations.wantsToReadAndXMore", { count: tool.additionalFileCount })
									: t("chat:fileOperations.wantsToRead")
					return tool.path ? `${title} ${tool.path}` : title
				}
				case "listFilesTopLevel": {
					const title = tool.isOutsideWorkspace
						? t("chat:directoryOperations.wantsToViewTopLevelOutsideWorkspace")
						: t("chat:directoryOperations.wantsToViewTopLevel")
					return tool.path ? `${title} ${tool.path}` : title
				}
				case "listCodeDefinitionNames": {
					const title = tool.isOutsideWorkspace
						? t("chat:directoryOperations.wantsToViewDefinitionsOutsideWorkspace")
						: t("chat:directoryOperations.wantsToViewDefinitions")
					return tool.path ? `${title} ${tool.path}` : title
				}
				case "newTask":
					return (
						<Trans
							i18nKey="chat:subtasks.wantsToCreate"
							components={{ code: <code /> }}
							values={{ mode: tool.mode }}
						/>
					)
				case "editedExistingFile":
				case "appliedDiff": {
					const title = tool.isProtected
						? t("chat:fileOperations.wantsToEditProtected")
						: tool.isOutsideWorkspace
							? t("chat:fileOperations.wantsToEditOutsideWorkspace")
							: t("chat:fileOperations.wantsToEdit")
					return tool.path ? `${title} ${tool.path}` : title
				}
				case "insertContent": {
					const title = tool.isProtected
						? t("chat:fileOperations.wantsToEditProtected")
						: tool.isOutsideWorkspace
							? t("chat:fileOperations.wantsToEditOutsideWorkspace")
							: tool.lineNumber === 0
								? t("chat:fileOperations.wantsToInsertAtEnd")
								: t("chat:fileOperations.wantsToInsertWithLineNumber", {
										lineNumber: tool.lineNumber,
									})
					return tool.path ? `${title} ${tool.path}` : title
				}
				case "searchAndReplace": {
					const title = tool.isProtected
						? t("chat:fileOperations.wantsToEditProtected")
						: t("chat:fileOperations.wantsToSearchReplace")
					return tool.path ? `${title} ${tool.path}` : title
				}
				case "newFileCreated": {
					const title = tool.isProtected
						? t("chat:fileOperations.wantsToEditProtected")
						: t("chat:fileOperations.wantsToCreate")
					return tool.path ? `${title} ${tool.path}` : title
				}
				case "searchFiles":
					return (
						<Trans
							i18nKey={
								tool.isOutsideWorkspace
									? "chat:directoryOperations.wantsToSearchOutsideWorkspace"
									: "chat:directoryOperations.wantsToSearch"
							}
							components={{ code: <code>{tool.regex}</code> }}
							values={{ regex: tool.regex }}
						/>
					)
				default:
					// Fallback for other tools
					break
			}
		}

		if (tool?.tool === "searchFiles") {
			return (
				<Trans
					i18nKey={
						tool.isOutsideWorkspace
							? "chat:directoryOperations.wantsToSearchOutsideWorkspace"
							: "chat:directoryOperations.wantsToSearch"
					}
					components={{ code: <code>{tool.regex}</code> }}
					values={{ regex: tool.regex }}
				/>
			)
		}

		// Fallback for non-tool messages or unhandled tools
		if (message.type === "say") {
			switch (message.say) {
				case "user_feedback":
					return "User Message"
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
					return "User Message"
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
				const data = JSON.parse(message.text)
				// Handle API streaming failure message
				if (message.say === "api_req_started" && data.streamingFailedMessage) {
					return data.streamingFailedMessage
				}
				// Handle tool calls
				if (data.tool) {
					if (data.tool === "newTask") {
						return data.content || ""
					}
					if (editTools.includes(data.tool) || readTools.includes(data.tool)) {
						return JSON.stringify(data, null, 2)
					}
					return JSON.stringify(data, null, 2)
				}
			} catch (_e) {
				// Not a JSON string, fall through to default text handling
			}
		}
		// Default text handling
		if (message.text && message.text.length > 200) {
			return message.text.substring(0, 200) + "..."
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

	// Get color for the indicator based on message type
	const getMessageColor = (message: ClineMessage): string => {
		const getColorFromTool = (toolName: string): string => {
			if (readTools.includes(toolName)) return COLOR.YELLOW
			if (editTools.includes(toolName)) return COLOR.BLUE
			if (commandTools.includes(toolName)) return COLOR.PURPLE
			if (flowTools.includes(toolName)) return COLOR.LIGHTGREEN
			if (askTools.includes(toolName)) return COLOR.GRAY

			return COLOR.DARK_GRAY // Default for uncategorized tools
		}

		// First, try to determine color based on the tool being used
		if (message.text) {
			try {
				const toolData = JSON.parse(message.text)
				if (toolData.tool) {
					return getColorFromTool(toolData.tool)
				}
			} catch (_e) {
				// Not a tool call, continue to the logic below
			}
		}

		// Fallback logic for non-tool messages
		if (message.type === "say") {
			switch (message.say) {
				case "user_feedback":
					return COLOR.WHITE
				case "text":
					return COLOR.GRAY // Regular assistant text
				case "api_req_started":
					if (message.text) {
						try {
							const info = JSON.parse(message.text)
							if (info.streamingFailedMessage) {
								return COLOR.RED
							}
						} catch (_e) {
							// ignore
						}
					}
					return COLOR.DARK_GRAY // Should be filtered out
				case "command_output":
					return COLOR.RED
				case "browser_action":
				case "browser_action_result":
					return COLOR.PURPLE // Purple for command/browser results
				case "subtask_result":
					return COLOR.LIGHTGREEN // Subtask results
				case "completion_result":
					return COLOR.GREEN
				case "error":
				case "rooignore_error":
				case "diff_error":
				case "condense_context_error":
				case "api_req_deleted":
					return COLOR.RED // Red for all error types
				default:
					return COLOR.DARK_GRAY
			}
		} else if (message.type === "ask") {
			switch (message.ask) {
				case "followup":
					return COLOR.GRAY // User message asking for input
				case "command":
				case "browser_action_launch":
					return COLOR.PURPLE // Approval for command/browser
				case "tool":
					// This case is hit when a tool approval is asked, but the tool name can't be parsed.
					// Default to a neutral color.
					return COLOR.YELLOW
				case "mistake_limit_reached":
				case "api_req_failed":
					return COLOR.RED // Red for error-related asks
				default:
					return COLOR.DARK_GRAY
			}
		}

		return COLOR.WHITE // Default color for any other case
	}

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
				{getTimestamp(message) && (
					<span style={{ fontWeight: "normal", fontSize: "10px", marginLeft: "8px" }}>
						{getTimestamp(message)}
					</span>
				)}
			</div>
			{getMessageContent(message) && (
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
					{getMessageContent(message)}
				</div>
			)}
		</div>
	)
}

export default TaskTimelineTooltip
