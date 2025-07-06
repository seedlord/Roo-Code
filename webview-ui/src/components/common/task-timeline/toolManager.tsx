import React from "react"
import { t } from "i18next"
import { Trans } from "react-i18next"
import { ClineSayTool } from "@roo/ExtensionMessage"
import * as COLOR from "./colors"

type ToolGroup = "read" | "edit" | "command" | "flow" | "ask"

interface ToolMetadata {
	group: ToolGroup
	getDescription: (tool: ClineSayTool) => React.ReactNode
}

const toolMetadata: Record<string, ToolMetadata> = {
	codebaseSearch: {
		group: "read",
		getDescription: (tool) =>
			tool.path ? (
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
			),
	},
	readFile: {
		group: "read",
		getDescription: (tool) => {
			const title =
				tool.batchFiles && Array.isArray(tool.batchFiles)
					? `${t("chat:fileOperations.wantsToReadMultiple")} ${tool.batchFiles.map((f: any) => f.path).join(", ")}`
					: tool.isOutsideWorkspace
						? t("chat:fileOperations.wantsToReadOutsideWorkspace")
						: tool.additionalFileCount && tool.additionalFileCount > 0
							? t("chat:fileOperations.wantsToReadAndXMore", { count: tool.additionalFileCount })
							: t("chat:fileOperations.wantsToRead")
			return tool.path ? `${title} ${tool.path}` : title
		},
	},
	listFilesTopLevel: {
		group: "read",
		getDescription: (tool) => {
			const title = tool.isOutsideWorkspace
				? t("chat:directoryOperations.wantsToViewTopLevelOutsideWorkspace")
				: t("chat:directoryOperations.wantsToViewTopLevel")
			return tool.path ? `${title} ${tool.path}` : title
		},
	},
	listCodeDefinitionNames: {
		group: "read",
		getDescription: (tool) => {
			const title = tool.isOutsideWorkspace
				? t("chat:directoryOperations.wantsToViewDefinitionsOutsideWorkspace")
				: t("chat:directoryOperations.wantsToViewDefinitions")
			return tool.path ? `${title} ${tool.path}` : title
		},
	},
	searchFiles: {
		group: "read",
		getDescription: (tool) => (
			<Trans
				i18nKey={
					tool.isOutsideWorkspace
						? "chat:directoryOperations.wantsToSearchOutsideWorkspace"
						: "chat:directoryOperations.wantsToSearch"
				}
				components={{ code: <code>{tool.regex}</code> }}
				values={{ regex: tool.regex }}
			/>
		),
	},
	// Edit Tools
	appliedDiff: {
		group: "edit",
		getDescription: (tool) => {
			const title = tool.isProtected
				? t("chat:fileOperations.wantsToEditProtected")
				: tool.isOutsideWorkspace
					? t("chat:fileOperations.wantsToEditOutsideWorkspace")
					: t("chat:fileOperations.wantsToEdit")
			return tool.path ? `${title} ${tool.path}` : title
		},
	},
	editedExistingFile: {
		group: "edit",
		getDescription: (tool) => {
			const title = tool.isProtected
				? t("chat:fileOperations.wantsToEditProtected")
				: tool.isOutsideWorkspace
					? t("chat:fileOperations.wantsToEditOutsideWorkspace")
					: t("chat:fileOperations.wantsToEdit")
			return tool.path ? `${title} ${tool.path}` : title
		},
	},
	insertContent: {
		group: "edit",
		getDescription: (tool) => {
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
		},
	},
	searchAndReplace: {
		group: "edit",
		getDescription: (tool) => {
			// This is the fix for the bug. We explicitly ignore progressStatus.text for this tool.
			const title = tool.isProtected
				? t("chat:fileOperations.wantsToEditProtected")
				: t("chat:fileOperations.wantsToSearchReplace")
			return tool.path ? `${title} ${tool.path}` : title
		},
	},
	newFileCreated: {
		group: "edit",
		getDescription: (tool) => {
			const title = tool.isProtected
				? t("chat:fileOperations.wantsToEditProtected")
				: t("chat:fileOperations.wantsToCreate")
			return tool.path ? `${title} ${tool.path}` : title
		},
	},
	// Flow Tools
	newTask: {
		group: "flow",
		getDescription: (tool) => (
			<Trans i18nKey="chat:subtasks.wantsToCreate" components={{ code: <code /> }} values={{ mode: tool.mode }} />
		),
	},
	switchMode: {
		group: "flow",
		getDescription: (tool) => (
			<Trans i18nKey="chat:modes.wantsToSwitch" components={{ code: <code /> }} values={{ mode: tool.mode }} />
		),
	},
	attempt_completion: {
		group: "flow",
		getDescription: () => t("chat:completion.wantsToComplete"),
	},
}

export function getToolMetadata(toolName: string): ToolMetadata | null {
	return toolMetadata[toolName] || null
}

export function getToolColor(toolName: string): string {
	const metadata = getToolMetadata(toolName)
	if (!metadata) return COLOR.DARK_GRAY

	switch (metadata.group) {
		case "read":
			return COLOR.YELLOW
		case "edit":
			return COLOR.BLUE
		case "command":
			return COLOR.PURPLE
		case "flow":
			return COLOR.LIGHTGREEN
		case "ask":
			return COLOR.GRAY
		default:
			return COLOR.DARK_GRAY
	}
}
