import delay from "delay"

import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag, ToolParamName } from "../../shared/tools"
import { Task } from "../task/Task"
import { defaultModeSlug, getModeBySlug } from "../../shared/modes"
import { formatResponse } from "../prompts/responses"
import { t } from "../../i18n"

interface ChildTaskInfo {
	prompt: string
	files?: string[]
	mode?: string
}

export async function newChildTaskTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: (action: string, error: Error) => Promise<void>,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	// Prioritize the 'tasks' parameter for orchestrator-style usage
	if (block.params.tasks) {
		const tasksStr = removeClosingTag("tasks", block.params.tasks)
		const executeImmediatelyStr = removeClosingTag("execute_immediately", block.params.execute_immediately)
		const executeImmediately = executeImmediatelyStr?.trim().toLowerCase() === "true"

		let tasks: ChildTaskInfo[] = []
		try {
			tasks = tasksStr ? JSON.parse(tasksStr) : []
			if (
				!Array.isArray(tasks) ||
				tasks.some((t) => typeof t.prompt !== "string" || (t.mode !== undefined && typeof t.mode !== "string"))
			) {
				throw new Error(
					"Invalid tasks format. Expected an array of objects with 'prompt' and 'mode' properties.",
				)
			}
		} catch (error) {
			await handleError("parsing child tasks", error as Error)
			return
		}

		const toolMessage = JSON.stringify({
			tool: "new_child_task",
			tasks: tasks.map((t) => ({
				prompt: t.prompt,
				files: t.files ?? [],
				mode: t.mode ?? cline.mode,
			})),
			execute_immediately: executeImmediately,
		})

		const { alwaysAllowSubtasks } = await cline.providerRef.deref()!.getState()
		let approvalResult: {
			response: "yesButtonClicked" | "noButtonClicked" | "messageResponse" | "objectResponse"
			params?: Record<string, any>
		}

		if (alwaysAllowSubtasks) {
			approvalResult = { response: "yesButtonClicked" }
		} else {
			const askResult = await askApproval("tool", toolMessage)
			approvalResult = {
				response: askResult.response,
				params: askResult.params,
			}
		}

		if (approvalResult.response !== "yesButtonClicked") {
			return
		}

		try {
			const finalExecuteImmediately = approvalResult.params?.execute_immediately ?? executeImmediately

			await cline.executeNewChildTaskTool(tasks, finalExecuteImmediately)

			const taskCount = tasks.length
			const plural = taskCount > 1 ? "s" : ""
			const message = finalExecuteImmediately
				? `Created and started ${taskCount} new child task${plural}.`
				: `Created ${taskCount} new child task${plural}. You will be asked to start it.`
			pushToolResult(formatResponse.toolResult(message))
		} catch (error) {
			await handleError("creating new child task(s)", error as Error)
		}
	} else {
		// Fallback to legacy 'mode' and 'message' parameters (logic from newTaskTool)
		const mode: string | undefined = block.params.mode
		const message: string | undefined = block.params.message

		try {
			if (block.partial) {
				const partialMessage = JSON.stringify({
					tool: "new_child_task", // Changed from newTask
					mode: removeClosingTag("mode", mode),
					message: removeClosingTag("message", message),
				})

				await cline.ask("tool", partialMessage, block.partial).catch(() => {})
				return
			} else {
				if (!mode) {
					cline.state.consecutiveMistakeCount++
					cline.recordToolError("new_child_task")
					pushToolResult(await cline.sayAndCreateMissingParamError("new_child_task", "mode"))
					return
				}

				if (!message) {
					cline.state.consecutiveMistakeCount++
					cline.recordToolError("new_child_task")
					pushToolResult(await cline.sayAndCreateMissingParamError("new_child_task", "message"))
					return
				}

				cline.state.consecutiveMistakeCount = 0
				const unescapedMessage = message.replace(/\\\\@/g, "\\@")

				const targetMode = getModeBySlug(mode, (await cline.providerRef.deref()?.getState())?.customModes)

				if (!targetMode) {
					pushToolResult(formatResponse.toolError(`Invalid mode: ${mode}`))
					return
				}

				const toolMessage = JSON.stringify({
					tool: "new_child_task", // Changed from newTask
					mode: targetMode.name,
					content: message,
				})

				const result = await askApproval("tool", toolMessage)

				if (result.response !== "yesButtonClicked") {
					return
				}

				const provider = cline.providerRef.deref()

				if (!provider) {
					return
				}

				if (cline.enableCheckpoints) {
					cline.checkpointSave(true)
				}

				cline.state.pausedModeSlug = (await provider.getState()).mode ?? defaultModeSlug
				await provider.handleModeSwitch(mode)
				await delay(500)

				const newCline = await provider.initClineWithTask(unescapedMessage, undefined, undefined, cline)
				if (!newCline) {
					pushToolResult(t("tools:newTask.errors.policy_restriction"))
					return
				}
				cline.emit("taskSpawned", newCline.taskId)

				pushToolResult(
					`Successfully created new task in ${targetMode.name} mode with message: ${unescapedMessage}`,
				)

				cline.state.isPaused = true
				cline.emit("taskPaused")

				return
			}
		} catch (error) {
			await handleError("creating new task", error)
			return
		}
	}
}
