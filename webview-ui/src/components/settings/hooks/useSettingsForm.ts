import { useCallback, useEffect, useState } from "react"
import {
	ModelInfo,
	ProviderName,
	ProviderSettings,
	anthropicModels,
	bedrockModels,
	chutesModels,
	claudeCodeModels,
	deepSeekModels,
	geminiModels,
	groqModels,
	mistralModels,
	ollamaModels,
	openAiNativeModels,
	vertexModels,
	vscodeLlmModels,
	xaiModels,
} from "@roo-code/types"
import {
	DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
	getModelMaxOutputTokens,
	isRouterName,
	RouterName,
} from "@roo/api"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useSelectedModel } from "../../ui/hooks/useSelectedModel"
import { useRouterModels } from "../../ui/hooks/useRouterModels"
import { vscode } from "../../../utils/vscode"

export const getModelSettingsKey = (provider: ProviderName | RouterName, modelId: string) => `${provider}:${modelId}`

export const modelSources: Partial<Record<ProviderName, Record<string, ModelInfo> | ModelInfo>> = {
	anthropic: anthropicModels,
	"claude-code": claudeCodeModels,
	glama: undefined,
	openrouter: undefined,
	bedrock: bedrockModels,
	vertex: vertexModels,
	openai: undefined,
	ollama: ollamaModels,
	"vscode-lm": vscodeLlmModels,
	lmstudio: undefined,
	gemini: geminiModels,
	"gemini-cli": geminiModels,
	"openai-native": openAiNativeModels,
	mistral: mistralModels,
	deepseek: deepSeekModels,
	unbound: undefined,
	requesty: undefined,
	"human-relay": undefined,
	xai: xaiModels,
	groq: groqModels,
	chutes: chutesModels,
}

export const useSettingsForm = (
	draftApiConfiguration: ProviderSettings,
	setApiConfigurationField: <K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => void,
) => {
	const { apiConfiguration: pristineApiConfiguration } = useExtensionState()
	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

	const {
		provider: selectedProvider,
		id: selectedModelId,
		info: selectedModelInfo,
	} = useSelectedModel(draftApiConfiguration)

	const { data: routerModels, refetch: refetchRouterModels } = useRouterModels()

	useEffect(() => {
		vscode.postMessage({ type: "requestRouterModels" })
	}, [])

	const handleModelChange = useCallback(
		(newModelId: string) => {
			if (!selectedProvider) return

			const modelSource = isRouterName(selectedProvider)
				? routerModels?.[selectedProvider]
				: modelSources[selectedProvider as ProviderName]
			const modelInfo =
				modelSource && newModelId in modelSource
					? (modelSource as Record<string, ModelInfo>)[newModelId]
					: undefined

			let newMaxOutputTokens = undefined
			let newThinkingBudget = undefined
			let newEnableReasoning = undefined
			let newModelTemperature = undefined
			let newEnableModelTemperature = undefined

			if (modelInfo) {
				const modelSettingsKey = getModelSettingsKey(selectedProvider, newModelId)
				const savedModelSettings = pristineApiConfiguration?.modelSettings?.[modelSettingsKey]
				newMaxOutputTokens =
					savedModelSettings?.modelMaxTokens ??
					getModelMaxOutputTokens({
						modelId: newModelId,
						model: modelInfo,
						settings: { ...pristineApiConfiguration, modelMaxTokens: undefined } as ProviderSettings,
					})
				newThinkingBudget =
					savedModelSettings?.modelMaxThinkingTokens ?? DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS
				newEnableReasoning = savedModelSettings?.enableReasoningEffort ?? !!modelInfo.supportsReasoningBudget
				newModelTemperature = savedModelSettings?.modelTemperature ?? 1
				newEnableModelTemperature = savedModelSettings?.enableModelTemperature ?? false
			}

			setApiConfigurationField("apiModelId", newModelId)
			setApiConfigurationField("modelMaxTokens", newMaxOutputTokens)
			setApiConfigurationField("modelMaxThinkingTokens", newThinkingBudget)
			setApiConfigurationField("enableReasoningEffort", newEnableReasoning)
			setApiConfigurationField("modelTemperature", newModelTemperature)
			setApiConfigurationField("enableModelTemperature", newEnableModelTemperature)
		},
		[selectedProvider, routerModels, pristineApiConfiguration, setApiConfigurationField],
	)

	const onProviderChange = useCallback(
		(newProvider: ProviderName | RouterName) => {
			const newProviderModels = isRouterName(newProvider)
				? routerModels?.[newProvider]
				: modelSources[newProvider as ProviderName]
			const lastUsedModelId = pristineApiConfiguration?.providerModelSelections?.[newProvider]
			let newModelId: string | undefined

			if (
				typeof lastUsedModelId === "string" &&
				newProviderModels &&
				Object.prototype.hasOwnProperty.call(newProviderModels, lastUsedModelId)
			) {
				newModelId = lastUsedModelId
			} else if (newProviderModels && typeof newProviderModels === "object") {
				const modelEntries = Object.entries(newProviderModels)
				if (modelEntries.length > 0) newModelId = modelEntries[0][0]
			}
			setApiConfigurationField("apiProvider", newProvider)
			if (newModelId) {
				handleModelChange(newModelId)
			} else {
				// Reset model specific fields if no model is selected for the new provider
				setApiConfigurationField("apiModelId", undefined)
				setApiConfigurationField("modelMaxTokens", undefined)
				setApiConfigurationField("modelMaxThinkingTokens", undefined)
				setApiConfigurationField("enableReasoningEffort", undefined)
				setApiConfigurationField("modelTemperature", undefined)
				setApiConfigurationField("enableModelTemperature", undefined)
			}
		},
		[pristineApiConfiguration, routerModels, setApiConfigurationField, handleModelChange],
	)

	return {
		isDescriptionExpanded,
		setIsDescriptionExpanded,
		selectedProvider,
		selectedModelId,
		selectedModelInfo,
		routerModels,
		refetchRouterModels,
		onProviderChange,
		handleModelChange,
	}
}
