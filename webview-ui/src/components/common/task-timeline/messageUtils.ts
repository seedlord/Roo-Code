import { ClineMessage } from "@roo-code/types"
import * as COLOR from "./colors"
import { getToolColor } from "./toolManager"
export const getMessageColor = (message: ClineMessage): string => {
	// First, try to determine color based on the tool being used
	if (message.text) {
		try {
			const toolData = JSON.parse(message.text)
			if (toolData.tool) {
				return getToolColor(toolData.tool)
			}
		} catch (_e) {
			// Not a tool call, continue to the logic below
		}
	}

	// Fallback logic for non-tool messages
	if (message.type === "say") {
		switch (message.say) {
			case "user_feedback":
				return COLOR.WHITE
			case "reasoning":
			case "text":
				return COLOR.GRAY // Regular assistant text and reasoning
			case "api_req_started":
				if (message.text) {
					try {
						const info = JSON.parse(message.text)
						if (info.streamingFailedMessage) {
							return COLOR.RED
						}
					} catch (_e) {
						// ignore
					}
				}
				return COLOR.DARK_GRAY // Should be filtered out
			case "command_output":
				return COLOR.RED
			case "browser_action":
			case "browser_action_result":
				return COLOR.PURPLE // Purple for command/browser results
			case "subtask_result":
			case "condense_context":
			case "checkpoint_saved":
				return COLOR.LIGHTGREEN
			case "completion_result":
				return COLOR.GREEN
			case "error":
			case "rooignore_error":
			case "diff_error":
			case "condense_context_error":
			case "shell_integration_warning":
			case "api_req_deleted":
				return COLOR.RED // Red for all error types
			default:
				return COLOR.DARK_GRAY
		}
	} else if (message.type === "ask") {
		switch (message.ask) {
			case "followup":
				return COLOR.GRAY // User message asking for input
			case "command":
			case "browser_action_launch":
			case "use_mcp_server":
				return COLOR.PURPLE // Approval for command/browser/mcp
			case "tool":
				// This case is hit when a tool approval is asked, but the tool name can't be parsed.
				// Default to a neutral color.
				return COLOR.YELLOW
			case "mistake_limit_reached":
			case "api_req_failed":
			case "auto_approval_max_req_reached":
				return COLOR.RED // Red for error-related asks
			default:
				return COLOR.DARK_GRAY
		}
	}

	return COLOR.WHITE // Default color for any other case
}
