import { ToolResponse, AskApproval } from "../../shared/tools"
import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"

export async function startNextChildTaskTool(
	cline: Task,
	askApproval: AskApproval,
	handleError: (action: string, error: Error) => Promise<void>,
	pushToolResult: (content: ToolResponse) => void,
) {
	const toolMessage = JSON.stringify({
		tool: "start_next_child_task",
	})

	const result = await askApproval("tool", toolMessage)
	if (result.response !== "yesButtonClicked") {
		return
	}

	try {
		await cline.startNextChildTaskTool()
		pushToolResult(formatResponse.toolResult("Started next child task."))
	} catch (error) {
		await handleError("starting next child task", error as Error)
	}
}
