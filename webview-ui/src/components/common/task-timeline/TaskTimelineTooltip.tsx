import React from "react"
import { Trans } from "react-i18next"
import { ClineMessage } from "@roo-code/types"
import { safeJsonParse } from "@roo/safeJsonParse"
import { ClineSayTool } from "@roo/ExtensionMessage"
import { getMessageMetadata } from "./toolManager"
import { getMessageColor } from "./toolManager"

export interface SearchResult {
	filePath: string
	startLine: number
	endLine: number
}

interface TaskTimelineTooltipProps {
	message: ClineMessage
	searchResults?: SearchResult[]
}

export const TaskTimelineTooltip: React.FC<TaskTimelineTooltipProps> = ({ message, searchResults }) => {
	const getMessageDescription = (message: ClineMessage): React.ReactNode => {
		const metadata = getMessageMetadata(message)
		const tool = safeJsonParse<ClineSayTool>(message.text) ?? null
		const description = metadata?.getDescription(tool, message)

		const isStatusProgress = message.progressStatus?.text && /\d/.test(message.progressStatus.text)

		if (description && isStatusProgress) {
			return (
				<>
					{description} ({message.progressStatus?.text})
				</>
			)
		}

		if (message.progressStatus?.text) {
			return message.progressStatus.text
		}

		if (description) {
			return description
		}

		return message.say || message.ask || "Unknown Message Type"
	}

	const getMessageContent = (message: ClineMessage): React.ReactNode => {
		const tool = safeJsonParse<{ tool?: string; query?: string }>(message.text)
		if (tool?.tool === "codebaseSearch" && searchResults) {
			const title = (
				<Trans
					i18nKey="chat:codebaseSearch.didSearch"
					components={{ code: <code /> }}
					values={{ query: tool.query, count: searchResults.length }}
				/>
			)
			if (searchResults.length > 0) {
				const resultsText = searchResults.map((r) => `${r.filePath}:${r.startLine}-${r.endLine}`).join("\n")
				return (
					<>
						{title}
						{"\n"}
						{resultsText}
					</>
				)
			}
			return title
		}

		// Handle specific `say` types first to avoid being overridden by tool parsing
		if (message.say === "codebase_search_result") {
			// This message type is now handled by the logic above and filtered out
			// in TaskTimeline.tsx, but we keep this as a fallback.
			return ""
		}

		if (message.text) {
			const parsedJson = safeJsonParse<any>(message.text, undefined, false)
			if (message.say === "api_req_started" && parsedJson?.streamingFailedMessage) {
				return parsedJson.streamingFailedMessage
			}
			if (parsedJson?.tool) {
				return getToolContent(parsedJson as ClineSayTool)
			}
		}

		if (message.say === "checkpoint_saved") {
			return `Commit: ${message.text}`
		}

		if (message.say === "user_feedback") {
			return message.text || ""
		}

		if (message.type === "ask" && message.ask === "followup") {
			const parsed = safeJsonParse<{ question: string; suggest: (string | { answer: string })[] }>(
				message.text,
				undefined,
				false,
			)
			if (parsed?.question) {
				const suggestions =
					parsed.suggest
						?.map((s) => (typeof s === "string" ? s : typeof s === "object" && s.answer ? s.answer : null))
						.filter(Boolean)
						.join("\n") || ""
				return `${parsed.question}\n${suggestions}`
			}
			return message.text || ""
		}
		return message.text || ""
	}

	const getTimestamp = (message: ClineMessage): string => {
		if (!message.ts) return ""
		const messageDate = new Date(message.ts)
		const today = new Date()
		const isToday = messageDate.toDateString() === today.toDateString()
		const isSameYear = messageDate.getFullYear() === today.getFullYear()

		const time = messageDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
		const monthName = messageDate.toLocaleString("default", { month: "short" })

		if (isToday) return time
		if (isSameYear) return `${monthName} ${messageDate.getDate()} ${time}`
		return `${monthName} ${messageDate.getDate()}, ${messageDate.getFullYear()} ${time}`
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
				width: "100%",
				boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
				fontSize: "12px",
			}}>
			<div style={{ fontWeight: "bold", marginBottom: "4px", display: "flex", alignItems: "center" }}>
				<div
					style={{
						width: "10px",
						height: "10px",
						minWidth: "10px",
						minHeight: "10px",
						borderRadius: "50%",
						backgroundColor: getMessageColor(message),
						marginRight: "8px",
						display: "inline-block",
						flexShrink: 0,
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

const getToolContent = (toolData: ClineSayTool): string => {
	switch (toolData.tool) {
		case "switchMode":
			return toolData.reason || ""
		case "newTask":
		case "newFileCreated":
		case "insertContent":
			return toolData.content || ""
		case "appliedDiff":
			if (toolData.batchDiffs?.length) {
				return toolData.batchDiffs.map((d: any) => d.path).join("\n")
			}
			return toolData.diff || ""
		case "editedExistingFile":
		case "searchAndReplace":
			return toolData.diff || ""
		case "readFile":
		case "listFilesTopLevel":
		case "listFilesRecursive":
		case "listCodeDefinitionNames":
		case "searchFiles":
			return toolData.content || ""
		case "codebaseSearch":
			return "" // This is the tool *call*, the result is handled in `codebase_search_result`
		default:
			return JSON.stringify(toolData, null, 2)
	}
}
