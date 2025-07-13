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
	apiConfiguration: ProviderSettings,
	setApiConfigurationField: <K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => void,
) => {
	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
	const {
		provider: selectedProvider,
		id: selectedModelId,
		info: selectedModelInfo,
	} = useSelectedModel(apiConfiguration)

	const { data: routerModels, refetch: refetchRouterModels } = useRouterModels()

	useEffect(() => {
		vscode.postMessage({ type: "requestRouterModels" })
	}, [])

	useEffect(() => {
		if (selectedModelId) {
			setApiConfigurationField("apiModelId", selectedModelId)
		}
	}, [selectedModelId, setApiConfigurationField])

	const onProviderChange = useCallback(
		(newProvider: ProviderName | RouterName) => {
			const newProviderModels = isRouterName(newProvider)
				? routerModels?.[newProvider]
				: modelSources[newProvider as ProviderName]
			const lastUsedModelId = apiConfiguration?.providerModelSelections?.[newProvider]
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

			const modelInfo =
				newProviderModels && newModelId && newModelId in newProviderModels
					? (newProviderModels as Record<string, ModelInfo>)[newModelId]
					: undefined

			let newMaxOutputTokens = undefined
			let newThinkingBudget = undefined
			let newEnableReasoning = undefined
			let newModelTemperature = undefined
			let newEnableModelTemperature = undefined

			if (modelInfo && newModelId) {
				const modelSettingsKey = getModelSettingsKey(newProvider, newModelId)
				const savedModelSettings = apiConfiguration?.modelSettings?.[modelSettingsKey]
				newMaxOutputTokens =
					savedModelSettings?.modelMaxTokens ??
					getModelMaxOutputTokens({
						modelId: newModelId,
						model: modelInfo,
						settings: { ...apiConfiguration, modelMaxTokens: undefined } as ProviderSettings,
					})
				newThinkingBudget =
					savedModelSettings?.modelMaxThinkingTokens ?? DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS
				newEnableReasoning = savedModelSettings?.enableReasoningEffort ?? !!modelInfo.supportsReasoningBudget
				newModelTemperature = savedModelSettings?.modelTemperature ?? 1
				newEnableModelTemperature = savedModelSettings?.enableModelTemperature ?? false
			}
			setApiConfigurationField("apiProvider", newProvider)
			setApiConfigurationField("apiModelId", newModelId)
			setApiConfigurationField("modelMaxTokens", newMaxOutputTokens)
			setApiConfigurationField("modelMaxThinkingTokens", newThinkingBudget)
			setApiConfigurationField("enableReasoningEffort", newEnableReasoning)
			setApiConfigurationField("modelTemperature", newModelTemperature)
			setApiConfigurationField("enableModelTemperature", newEnableModelTemperature)
		},
		[apiConfiguration, routerModels, setApiConfigurationField],
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
	}
}
