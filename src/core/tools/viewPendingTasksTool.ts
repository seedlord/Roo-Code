import { ToolResponse, AskApproval } from "../../shared/tools"
import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"

export async function viewPendingTasksTool(
	cline: Task,
	askApproval: AskApproval,
	handleError: (action: string, error: Error) => Promise<void>,
	pushToolResult: (content: ToolResponse) => void,
) {
	const toolMessage = JSON.stringify({
		tool: "view_pending_tasks",
	})

	const result = await askApproval("tool", toolMessage)
	if (result.response !== "yesButtonClicked") {
		return
	}

	try {
		const provider = cline.providerRef.deref()
		if (!provider) {
			throw new Error("Provider not available")
		}

		const pendingTasks = await provider.handleViewPendingTasks(cline.taskId)
		pushToolResult(formatResponse.toolResult(JSON.stringify(pendingTasks, null, 2)))
	} catch (error) {
		await handleError("viewing pending tasks", error as Error)
	}
}
