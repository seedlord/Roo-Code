import { ToolResponse, NewChildTaskToolUse, AskApproval } from "../../shared/tools"
import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"

interface ChildTaskInfo {
	prompt: string
	files?: string[]
	mode?: string
}

export async function newChildTaskTool(
	cline: Task,
	toolUse: NewChildTaskToolUse,
	askApproval: AskApproval,
	handleError: (action: string, error: Error) => Promise<void>,
	pushToolResult: (content: ToolResponse) => void,
	removeClosingTag: (tag: "tasks" | "execute_immediately", text?: string) => string,
) {
	const tasksStr = removeClosingTag("tasks", toolUse.params.tasks)
	const executeImmediatelyStr = removeClosingTag("execute_immediately", toolUse.params.execute_immediately)
	const executeImmediately = executeImmediatelyStr?.trim().toLowerCase() === "true"

	let tasks: ChildTaskInfo[] = []
	try {
		tasks = tasksStr ? JSON.parse(tasksStr) : []
		if (!Array.isArray(tasks) || tasks.some((t) => typeof t.prompt !== "string" || typeof t.mode !== "string")) {
			throw new Error("Invalid tasks format. Expected an array of objects with 'prompt' and 'mode' properties.")
		}
	} catch (error) {
		await handleError("parsing child tasks", error as Error)
		return
	}

	const toolMessage = JSON.stringify({
		tool: "new_child_task",
		tasks: tasks.map((t) => ({ prompt: t.prompt, files: t.files ?? [], mode: t.mode })),
		execute_immediately: executeImmediately,
	})

	const approvalResult = await askApproval("tool", toolMessage)

	if (approvalResult.response !== "yesButtonClicked") {
		return
	}

	try {
		const finalExecuteImmediately = approvalResult.params?.execute_immediately ?? executeImmediately

		for (const taskInfo of tasks) {
			await cline.executeNewChildTaskTool(
				taskInfo.prompt,
				taskInfo.files ?? [],
				finalExecuteImmediately,
				taskInfo.mode,
			)
		}

		const taskCount = tasks.length
		const plural = taskCount > 1 ? "s" : ""
		const message = finalExecuteImmediately
			? `Created and started ${taskCount} new child task${plural}.`
			: `Queued ${taskCount} new child task${plural}. Awaiting user's instruction to start.`
		pushToolResult(formatResponse.toolResult(message))
	} catch (error) {
		await handleError("creating new child task(s)", error as Error)
	}
}
