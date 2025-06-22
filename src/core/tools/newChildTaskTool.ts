import { ToolResponse, NewChildTaskToolUse } from "../../shared/tools"
import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"

import { ClineAsk, ToolProgressStatus } from "@roo-code/types"

export async function newChildTaskTool(
	cline: Task,
	toolUse: NewChildTaskToolUse,
	askApproval: (
		type: ClineAsk,
		text?: string,
		partial?: boolean,
		progressStatus?: ToolProgressStatus,
		isProtected?: boolean,
	) => Promise<boolean>,
	handleError: (action: string, error: Error) => Promise<void>,
	pushToolResult: (content: ToolResponse) => void,
	removeClosingTag: (tag: "child_task_prompt" | "child_task_files" | "execute_immediately", text?: string) => string,
) {
	const prompt = removeClosingTag("child_task_prompt", toolUse.params.child_task_prompt)
	const filesStr = removeClosingTag("child_task_files", toolUse.params.child_task_files)
	const executeImmediatelyStr = removeClosingTag("execute_immediately", toolUse.params.execute_immediately)

	const toolMessage = JSON.stringify({
		tool: "new_child_task",
		prompt,
		files: filesStr,
		execute_immediately: executeImmediatelyStr,
	})

	if (!(await askApproval("tool", toolMessage))) {
		return
	}

	try {
		const provider = cline.providerRef.deref()
		if (!provider) {
			throw new Error("Provider not available")
		}

		const files = filesStr ? JSON.parse(filesStr) : []
		const executeImmediately = executeImmediatelyStr?.toLowerCase() === "true"

		const newTaskId = await provider.handleNewChildTask(cline.taskId, prompt, files, executeImmediately)
		pushToolResult(formatResponse.toolResult(`Created new child task with ID: ${newTaskId}`))
	} catch (error) {
		await handleError("creating new child task", error as Error)
	}
}
