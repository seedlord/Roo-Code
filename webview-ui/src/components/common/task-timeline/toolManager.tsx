import React from "react"
import { t } from "i18next"
import { Trans } from "react-i18next"
import { ClineMessage } from "@roo-code/types"
import { ClineSayTool } from "@roo/ExtensionMessage"
import * as COLOR from "./colors"
import { TOOL_NAMES } from "../../../../../src/shared/constants"
import { safeJsonParse } from "@roo/safeJsonParse"
import { MessageGroup } from "./TimelineFilterContext"

interface MessageMetadata {
	group: MessageGroup
	icon?: string
	getDescription: (tool: ClineSayTool | null, message: ClineMessage) => React.ReactNode
}

const groupSettings: Record<MessageGroup, { color: string; icon?: string }> = {
	read: { color: COLOR.YELLOW, icon: "book" },
	edit: { color: COLOR.BLUE, icon: "edit" },
	command: { color: COLOR.PURPLE, icon: "terminal" },
	flow: { color: COLOR.LIGHT_GREEN, icon: "arrow-right" },
	ask: { color: COLOR.GRAY, icon: "question" },
	info: { color: COLOR.WHITE, icon: "info" },
	reasoning: { color: COLOR.GRAY, icon: "history" },
	error: { color: COLOR.RED, icon: "error" },
	checkpoint: { color: COLOR.BLUE, icon: "git-commit" },
	task_completion: { color: COLOR.GREEN, icon: "check" },
}

const getFileOpTitle = (
	tool: ClineSayTool,
	keys: {
		normal: string
		outside?: string
		protected?: string
	},
	values?: { [key: string]: any },
): string => {
	let key = keys.normal
	if (tool.isProtected && keys.protected) {
		key = keys.protected
	} else if (tool.isOutsideWorkspace && keys.outside) {
		key = keys.outside
	}
	return t(key, values)
}

const messageMetadata: Record<string, MessageMetadata> = {
	// Tools
	[TOOL_NAMES.CODEBASE_SEARCH]: {
		group: "read",
		icon: "search",
		getDescription: (tool) =>
			tool?.path ? (
				<Trans
					i18nKey="chat:codebaseSearch.wantsToSearchWithPath"
					components={{ code: <code /> }}
					values={{ query: tool.query, path: tool.path }}
				/>
			) : (
				<Trans
					i18nKey="chat:codebaseSearch.wantsToSearch"
					components={{ code: <code /> }}
					values={{ query: tool?.query }}
				/>
			),
	},
	[TOOL_NAMES.READ_FILE]: {
		group: "read",
		icon: "file-code",
		getDescription: (tool) => {
			const title =
				tool?.batchFiles && Array.isArray(tool.batchFiles)
					? `${t("chat:fileOperations.wantsToReadMultiple")} ${tool.batchFiles.map((f: any) => f.path).join(", ")}`
					: tool?.isOutsideWorkspace
						? t("chat:fileOperations.wantsToReadOutsideWorkspace")
						: tool?.additionalFileCount && tool.additionalFileCount > 0
							? t("chat:fileOperations.wantsToReadAndXMore", { count: tool.additionalFileCount })
							: t("chat:fileOperations.wantsToRead")
			return tool?.path ? `${title} ${tool.path}` : title
		},
	},
	[TOOL_NAMES.LIST_FILES_TOP_LEVEL]: {
		group: "read",
		icon: "folder-opened",
		getDescription: (tool) => {
			const title = getFileOpTitle(tool!, {
				normal: "chat:directoryOperations.wantsToViewTopLevel",
				outside: "chat:directoryOperations.wantsToViewTopLevelOutsideWorkspace",
			})
			return tool?.path ? `${title} ${tool.path}` : title
		},
	},
	[TOOL_NAMES.LIST_FILES_RECURSIVE]: {
		group: "read",
		icon: "folder-opened",
		getDescription: (tool) => {
			const title = getFileOpTitle(tool!, {
				normal: "chat:directoryOperations.wantsToViewRecursive",
				outside: "chat:directoryOperations.wantsToViewRecursiveOutsideWorkspace",
			})
			return tool?.path ? `${title} ${tool.path}` : title
		},
	},
	[TOOL_NAMES.LIST_CODE_DEFINITION_NAMES]: {
		group: "read",
		getDescription: (tool) => {
			const title = getFileOpTitle(tool!, {
				normal: "chat:directoryOperations.wantsToViewDefinitions",
				outside: "chat:directoryOperations.wantsToViewDefinitionsOutsideWorkspace",
			})
			return tool?.path ? `${title} ${tool.path}` : title
		},
	},
	[TOOL_NAMES.SEARCH_FILES]: {
		group: "read",
		icon: "search",
		getDescription: (tool) => (
			<Trans
				i18nKey={
					tool?.isOutsideWorkspace
						? "chat:directoryOperations.wantsToSearchOutsideWorkspace"
						: "chat:directoryOperations.wantsToSearch"
				}
				components={{ code: <code>{tool?.regex}</code> }}
				values={{ regex: tool?.regex }}
			/>
		),
	},
	[TOOL_NAMES.APPLIED_DIFF]: {
		group: "edit",
		icon: "diff",
		getDescription: (tool) => {
			if (tool?.batchDiffs && Array.isArray(tool.batchDiffs)) {
				return t("chat:fileOperations.wantsToApplyBatchChanges")
			}
			const title = getFileOpTitle(tool!, {
				normal: "chat:fileOperations.wantsToEdit",
				outside: "chat:fileOperations.wantsToEditOutsideWorkspace",
				protected: "chat:fileOperations.wantsToEditProtected",
			})
			return tool?.path ? `${title} ${tool.path}` : title
		},
	},
	[TOOL_NAMES.EDITED_EXISTING_FILE]: {
		group: "edit",
		icon: "diff",
		getDescription: (tool) => {
			const title = getFileOpTitle(tool!, {
				normal: "chat:fileOperations.wantsToEdit",
				outside: "chat:fileOperations.wantsToEditOutsideWorkspace",
				protected: "chat:fileOperations.wantsToEditProtected",
			})
			return tool?.path ? `${title} ${tool.path}` : title
		},
	},
	[TOOL_NAMES.INSERT_CONTENT]: {
		group: "edit",
		icon: "insert",
		getDescription: (tool) => {
			const normalKey =
				tool?.lineNumber === 0
					? "chat:fileOperations.wantsToInsertAtEnd"
					: "chat:fileOperations.wantsToInsertWithLineNumber"

			const title = getFileOpTitle(
				tool!,
				{
					normal: normalKey,
					outside: "chat:fileOperations.wantsToEditOutsideWorkspace",
					protected: "chat:fileOperations.wantsToEditProtected",
				},
				{ lineNumber: tool?.lineNumber },
			)
			return tool?.path ? `${title} ${tool.path}` : title
		},
	},
	[TOOL_NAMES.SEARCH_AND_REPLACE]: {
		group: "edit",
		getDescription: (tool) => {
			const title = getFileOpTitle(tool!, {
				normal: "chat:fileOperations.wantsToSearchReplace",
				protected: "chat:fileOperations.wantsToEditProtected",
			})
			return tool?.path ? `${title} ${tool.path}` : title
		},
	},
	[TOOL_NAMES.NEW_FILE_CREATED]: {
		group: "edit",
		icon: "file-add",
		getDescription: (tool) => {
			const title = getFileOpTitle(tool!, {
				normal: "chat:fileOperations.wantsToCreate",
				protected: "chat:fileOperations.wantsToEditProtected",
			})
			return tool?.path ? `${title} ${tool.path}` : title
		},
	},
	[TOOL_NAMES.NEW_TASK]: {
		group: "flow",
		icon: "arrow-right", // or "tasklist"
		getDescription: (tool) => (
			<Trans
				i18nKey="chat:subtasks.wantsToCreate"
				components={{ code: <code /> }}
				values={{ mode: tool?.mode }}
			/>
		),
	},
	[TOOL_NAMES.FINISH_TASK]: {
		group: "flow",
		icon: "arrow-left",
		getDescription: (tool) => (
			<Trans
				i18nKey="chat:subtasks.wantsToFinish"
				components={{ code: <code /> }}
				values={{ mode: tool?.mode }}
			/>
		),
	},
	[TOOL_NAMES.SWITCH_MODE]: {
		group: "flow",
		icon: "symbol-enum",
		getDescription: (tool) => (
			<Trans i18nKey="chat:modes.wantsToSwitch" components={{ code: <code /> }} values={{ mode: tool?.mode }} />
		),
	},
	[TOOL_NAMES.ATTEMPT_COMPLETION]: {
		group: "flow",
		getDescription: () => t("chat:completion.wantsToComplete"),
	},

	// Ask Messages
	followup: {
		group: "ask",
		icon: "question",
		getDescription: () => t("chat:questions.hasQuestion"),
	},
	tool: {
		group: "ask",
		getDescription: (tool) => `Tool Approval: ${tool?.tool || ""}`,
	},
	command: {
		group: "command",
		icon: "terminal",
		getDescription: () => t("chat:runCommand.title"),
	},
	browser_action_launch: {
		group: "command",
		getDescription: () => t("chat:browser.approval"),
	},
	use_mcp_server: {
		group: "command",
		getDescription: (_tool, message) => {
			const mcpInfo = safeJsonParse<{ serverName: string; toolName?: string }>(message.text)
			return t("chat:mcp.wantsToUseTool", { serverName: mcpInfo?.serverName })
		},
	},
	mistake_limit_reached: {
		group: "error",
		icon: "error",
		getDescription: () => t("chat:troubleMessage"),
	},
	api_req_failed: {
		group: "error",
		icon: "error",
		getDescription: () => t("chat:apiRequest.failed"),
	},
	auto_approval_max_req_reached: {
		group: "error",
		icon: "error",
		getDescription: () => t("chat:autoApproval.limitReached"),
	},

	// Say Messages
	user_feedback: {
		group: "info",
		icon: "comment",
		getDescription: () => t("chat:userFeedback.title"),
	},
	user_feedback_diff: {
		group: "edit",
		icon: "feedback",
		getDescription: () => t("chat:userFeedback.diffTitle"),
	},
	text: {
		group: "info",
		icon: "roo",
		getDescription: () => t("chat:response"),
	},
	reasoning: {
		group: "reasoning",
		icon: "history",
		getDescription: () => t("chat:reasoning.thinking"),
	},
	subtask_result: {
		group: "flow",
		icon: "arrow-left",
		getDescription: () => t("chat:subtasks.resultContent"),
	},
	command_output: {
		group: "command",
		getDescription: () => t("chat:runCommand.outputTitle"),
	},
	browser_action: {
		group: "command",
		getDescription: () => t("chat:browser.action"),
	},
	browser_action_result: {
		group: "command",
		getDescription: () => t("chat:browser.result"),
	},
	completion_result: {
		group: "task_completion",
		icon: "check",
		getDescription: () => t("chat:taskCompleted"),
	},
	api_req_started: {
		group: "error",
		icon: "error",
		getDescription: () => t("chat:apiRequest.streamingFailed"),
	},
	checkpoint_saved: {
		group: "checkpoint",
		icon: "git-commit",
		getDescription: () => t("chat:checkpoint.saved"),
	},
	condense_context: {
		group: "flow",
		getDescription: () => t("chat:context.condensing"),
	},
	codebase_search_result: {
		group: "read",
		getDescription: (_tool, message) => {
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
		},
	},
	error: { group: "error", icon: "error", getDescription: () => t("chat:error") },
	rooignore_error: { group: "error", icon: "error", getDescription: () => t("chat:error") },
	diff_error: { group: "error", icon: "error", getDescription: () => t("chat:error") },
	condense_context_error: { group: "error", icon: "error", getDescription: () => t("chat:error") },
	shell_integration_warning: {
		group: "error",
		icon: "error",
		getDescription: () => t("chat:error"),
	},
	api_req_deleted: {
		group: "error",
		icon: "error",
		getDescription: () => t("chat:apiRequest.cancelled"),
	},
}

export function getMessageMetadata(message: ClineMessage): MessageMetadata | null {
	const tool = safeJsonParse<ClineSayTool>(message.text) ?? null

	// Handle specific `say` types first to avoid being overridden by tool parsing
	if (message.say === "codebase_search_result") {
		const metadata = messageMetadata.codebase_search_result
		return {
			...metadata,
			getDescription: () => metadata.getDescription(tool, message),
		}
	}

	if (message.say === "user_feedback_diff") {
		const metadata = messageMetadata.user_feedback_diff
		return {
			...metadata,
			getDescription: () => metadata.getDescription(tool, message),
		}
	}

	const key = tool?.tool || message.ask || message.say
	if (!key) return null

	// Special handling for api_req_started
	if (key === "api_req_started") {
		const info = safeJsonParse<{ streamingFailedMessage?: string }>(message.text)
		if (info?.streamingFailedMessage) {
			return messageMetadata[key] // Return the default error metadata
		}
		if (message.text?.includes("[ERROR]")) {
			return {
				group: "error",
				icon: "error",
				getDescription: () => t("chat:apiRequest.modelError"),
			}
		}
		// If it's a regular, non-error api_req_started, return null to hide it from the timeline
		return null
	}

	const metadata = messageMetadata[key]
	if (metadata) {
		// Pass both tool and message to getDescription
		return {
			...metadata,
			getDescription: () => metadata.getDescription(tool, message),
		}
	}
	return null
}

export const getMessageColor = (message: ClineMessage): string => {
	const metadata = getMessageMetadata(message)
	if (!metadata) return COLOR.DARK_GRAY
	return groupSettings[metadata.group]?.color ?? COLOR.DARK_GRAY
}

export const getMessageIcon = (message: ClineMessage): string | undefined => {
	const metadata = getMessageMetadata(message)
	if (!metadata) return undefined
	const groupSettingIcon = groupSettings[metadata.group]?.icon
	return metadata.icon ?? groupSettingIcon
}
