import path from "path"

import { Task } from "../task/Task"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { getReadablePath } from "../../utils/path"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { regexSearchFiles } from "../../services/ripgrep"

export async function searchFilesTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relDirPath: string | undefined = block.params.path
	const regex: string | undefined = block.params.regex
	const filePattern: string | undefined = block.params.file_pattern

	const absolutePath = relDirPath ? path.resolve(cline.workspacePath, relDirPath) : cline.workspacePath
	const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)

	const sharedMessageProps: ClineSayTool = {
		tool: "searchFiles",
		path: getReadablePath(cline.workspacePath, removeClosingTag("path", relDirPath)),
		regex: removeClosingTag("regex", regex),
		filePattern: removeClosingTag("file_pattern", filePattern),
		isOutsideWorkspace,
	}

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({ ...sharedMessageProps, content: "" } satisfies ClineSayTool)
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		} else {
			if (!relDirPath) {
				cline.state.consecutiveMistakeCount++
				cline.recordToolError("search_files")
				pushToolResult(await cline.sayAndCreateMissingParamError("search_files", "path"))
				return
			}

			if (!regex) {
				cline.state.consecutiveMistakeCount++
				cline.recordToolError("search_files")
				pushToolResult(await cline.sayAndCreateMissingParamError("search_files", "regex"))
				return
			}

			cline.state.consecutiveMistakeCount = 0

			const results = await regexSearchFiles(
				cline.workspacePath,
				absolutePath,
				regex,
				filePattern,
				cline.rooIgnoreController,
			)

			const completeMessage = JSON.stringify({ ...sharedMessageProps, content: results } satisfies ClineSayTool)
			const result = await askApproval("tool", completeMessage)

			if (result.response !== "yesButtonClicked") {
				return
			}

			pushToolResult(results)

			return
		}
	} catch (error) {
		await handleError("searching files", error)
		return
	}
}
