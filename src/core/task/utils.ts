// src/core/task/utils.ts
import * as vscode from "vscode"
import { Anthropic } from "@anthropic-ai/sdk"

import { getApiMetrics } from "../../shared/getApiMetrics"
import { ClineMessage, ProviderSettings } from "@roo-code/types"

export function formatErrorWithStatusCode(error: any): string {
	let errorMessage = "An unknown error occurred."
	if (error instanceof Error) {
		errorMessage = error.message
	} else if (typeof error === "string") {
		errorMessage = error
	}

	if (error && typeof error === "object" && "status" in error) {
		return `Error (status code: ${error.status}): ${errorMessage}`
	}
	return `Error: ${errorMessage}`
}

export function showNotificationForApprovalIfAutoApprovalEnabled(
	message: string,
	autoApprovalEnabled: boolean,
	notificationsEnabled: boolean,
) {
	if (autoApprovalEnabled && notificationsEnabled) {
		vscode.window.showInformationMessage(message, "View").then((selection) => {
			if (selection === "View") {
				vscode.commands.executeCommand("workbench.view.extension.roo-code-sidebar-view")
			}
		})
	}
}

export function updateApiReqMsg(
	clineMessages: ClineMessage[],
	apiConfiguration: ProviderSettings,
	systemPrompt: string,
	autoApprovalEnabled: boolean,
): string {
	const { totalTokensIn, totalTokensOut } = getApiMetrics(clineMessages)
	const apiReqInfo: any = {
		model: apiConfiguration.apiModelId,
		maxTokens: apiConfiguration.modelMaxTokens,
		temperature: apiConfiguration.modelTemperature,
		autoApprovalEnabled: autoApprovalEnabled,
		systemPromptLength: systemPrompt.length,
		totalInputTokens: totalTokensIn,
		totalOutputTokens: totalTokensOut,
	}
	return JSON.stringify(apiReqInfo)
}
