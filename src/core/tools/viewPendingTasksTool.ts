import { ToolResponse } from "../../shared/tools"
import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"

import { ClineAsk, ToolProgressStatus } from "@roo-code/types"

export async function viewPendingTasksTool(
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
		tool: "view_pending_tasks",
	})

	if (!(await askApproval("tool", toolMessage))) {
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
