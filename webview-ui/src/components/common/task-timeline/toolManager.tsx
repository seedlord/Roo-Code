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
	color: string
	icon?: string // icon name, e.g. "question"
	getDescription: (tool: ClineSayTool | null, message: ClineMessage) => React.ReactNode
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
		color: COLOR.YELLOW,
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
		color: COLOR.YELLOW,
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
		color: COLOR.YELLOW,
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
		color: COLOR.YELLOW,
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
		color: COLOR.YELLOW,
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
		color: COLOR.YELLOW,
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
		color: COLOR.BLUE,
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
		color: COLOR.BLUE,
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
		color: COLOR.BLUE,
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
		color: COLOR.BLUE,
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
		color: COLOR.BLUE,
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
		color: COLOR.LIGHT_GREEN,
		icon: "tasklist",
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
		color: COLOR.LIGHT_GREEN,
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
		color: COLOR.LIGHT_GREEN,
		icon: "symbol-enum",
		getDescription: (tool) => (
			<Trans i18nKey="chat:modes.wantsToSwitch" components={{ code: <code /> }} values={{ mode: tool?.mode }} />
		),
	},
	[TOOL_NAMES.ATTEMPT_COMPLETION]: {
		group: "flow",
		color: COLOR.GREEN,
		getDescription: () => t("chat:completion.wantsToComplete"),
	},

	// Ask Messages
	followup: {
		group: "ask",
		color: COLOR.GRAY,
		icon: "question",
		getDescription: () => t("chat:questions.hasQuestion"),
	},
	tool: {
		group: "ask",
		color: COLOR.YELLOW,
		getDescription: (tool) => `Tool Approval: ${tool?.tool || ""}`,
	},
	command: {
		group: "command",
		color: COLOR.PURPLE,
		getDescription: () => t("chat:runCommand.title"),
	},
	browser_action_launch: {
		group: "command",
		color: COLOR.PURPLE,
		getDescription: () => t("chat:browser.approval"),
	},
	use_mcp_server: {
		group: "command",
		color: COLOR.PURPLE,
		getDescription: (_tool, message) => {
			const mcpInfo = safeJsonParse<{ serverName: string; toolName?: string }>(message.text)
			return t("chat:mcp.wantsToUseTool", { serverName: mcpInfo?.serverName })
		},
	},
	mistake_limit_reached: {
		group: "error",
		color: COLOR.RED,
		getDescription: () => t("chat:troubleMessage"),
	},
	api_req_failed: {
		group: "error",
		color: COLOR.RED,
		getDescription: () => t("chat:apiRequest.failed"),
	},
	auto_approval_max_req_reached: {
		group: "error",
		color: COLOR.RED,
		getDescription: () => t("chat:autoApproval.limitReached"),
	},

	// Say Messages
	user_feedback: {
		group: "info",
		color: COLOR.WHITE,
		getDescription: () => t("chat:userFeedback.title"),
	},
	user_feedback_diff: {
		group: "edit",
		color: COLOR.BLUE,
		getDescription: () => t("chat:userFeedback.diffTitle"),
	},
	text: {
		group: "info",
		color: COLOR.GRAY,
		getDescription: () => t("chat:response"),
	},
	reasoning: {
		group: "info",
		color: COLOR.GRAY,
		getDescription: () => t("chat:reasoning.thinking"),
	},
	subtask_result: {
		group: "flow",
		color: COLOR.LIGHT_GREEN,
		getDescription: () => t("chat:subtasks.resultContent"),
	},
	command_output: {
		group: "command",
		color: COLOR.RED,
		getDescription: () => t("chat:runCommand.outputTitle"),
	},
	browser_action: {
		group: "command",
		color: COLOR.PURPLE,
		getDescription: () => t("chat:browser.action"),
	},
	browser_action_result: {
		group: "command",
		color: COLOR.PURPLE,
		getDescription: () => t("chat:browser.result"),
	},
	completion_result: {
		group: "flow",
		color: COLOR.GREEN,
		getDescription: () => t("chat:taskCompleted"),
	},
	api_req_started: {
		group: "error",
		color: COLOR.RED,
		icon: "error",
		getDescription: () => t("chat:apiRequest.streamingFailed"),
	},
	checkpoint_saved: {
		group: "checkpoint",
		color: COLOR.BLUE,
		icon: "git-commit",
		getDescription: () => t("chat:checkpoint.saved"),
	},
	condense_context: {
		group: "flow",
		color: COLOR.LIGHT_GREEN,
		getDescription: () => t("chat:context.condensing"),
	},
	codebase_search_result: {
		group: "read",
		color: COLOR.YELLOW,
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
	error: { group: "error", color: COLOR.RED, getDescription: () => t("chat:error") },
	rooignore_error: { group: "error", color: COLOR.RED, getDescription: () => t("chat:error") },
	diff_error: { group: "error", color: COLOR.RED, getDescription: () => t("chat:error") },
	condense_context_error: { group: "error", color: COLOR.RED, getDescription: () => t("chat:error") },
	shell_integration_warning: { group: "error", color: COLOR.RED, getDescription: () => t("chat:error") },
	api_req_deleted: {
		group: "error",
		color: COLOR.RED,
		getDescription: () => t("chat:apiRequest.cancelled"),
	},
}

export function getMessageMetadata(message: ClineMessage): MessageMetadata | null {
	const tool = safeJsonParse<ClineSayTool>(message.text) ?? null
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
				color: COLOR.RED,
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
	return metadata?.color ?? COLOR.DARK_GRAY
}

export const getMessageIcon = (message: ClineMessage): string | undefined => {
	const metadata = getMessageMetadata(message)
	return metadata?.icon
}
