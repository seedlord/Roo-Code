import { ToolResponse } from "../../shared/tools"
import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"

import { ClineAsk, ToolProgressStatus } from "@roo-code/types"

export async function startNextChildTaskTool(
	cline: Task,
	askApproval: (
		type: ClineAsk,
		text?: string,
		partial?: boolean,
		progressStatus?: ToolProgressStatus,
		isProtected?: boolean,
	) => Promise<boolean>,
	handleError: (action: string, error: Error) => Promise<void>,
	pushToolResult: (content: ToolResponse) => void,
) {
	const toolMessage = JSON.stringify({
		tool: "start_next_child_task",
	})

	if (!(await askApproval("tool", toolMessage))) {
		return
	}

	try {
		const provider = cline.providerRef.deref()
		if (!provider) {
			throw new Error("Provider not available")
		}

		await provider.handleStartNextChildTask(cline.taskId)
		pushToolResult(formatResponse.toolResult("Started next child task."))
	} catch (error) {
		await handleError("starting next child task", error as Error)
	}
}
