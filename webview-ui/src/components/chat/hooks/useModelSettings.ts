import { useCallback, useEffect, useState } from "react"
import { useEvent } from "react-use"
import { ProviderName, ProviderSettings, ModelSpecificSettings } from "@roo-code/types"
import {
	DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
	getModelMaxOutputTokens,
	isRouterName,
	RouterName,
} from "@roo/api"
import { vscode } from "@/utils/vscode"
import { useExtensionState } from "../../../context/ExtensionStateContext"
import { useSelectedModel } from "../../ui/hooks/useSelectedModel"

import {
	ModelInfo,
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

export const useModelSettings = (isSettingsPopupOpen: boolean, onHasChangesChange?: (value: boolean) => void) => {
	const { apiConfiguration, currentApiConfigName, setIsAwaitingConfigurationUpdate, routerModels } =
		useExtensionState()
	const {
		id: selectedModelId,
		info: selectedModelInfo,
		provider: selectedProvider,
	} = useSelectedModel(apiConfiguration)

	const [localApiConfiguration, setLocalApiConfiguration] = useState<ProviderSettings | undefined>(apiConfiguration)
	const [hasChanges, _setHasChanges] = useState(false)
	const setHasChanges = useCallback(
		(value: boolean) => {
			_setHasChanges(value)
			onHasChangesChange?.(value)
		},
		[onHasChangesChange],
	)
	const [ollamaModels, setOllamaModels] = useState<string[]>([])

	const localApiProvider = localApiConfiguration?.apiProvider
	const localSelectedModelId = localApiProvider && localApiConfiguration?.providerModelSelections?.[localApiProvider]
	const localMaxOutputTokens = localApiConfiguration?.modelMaxTokens
	const localThinkingBudget = localApiConfiguration?.modelMaxThinkingTokens
	const localEnableReasoning = localApiConfiguration?.enableReasoningEffort
	const localModelTemperature = localApiConfiguration?.modelTemperature
	const localEnableModelTemperature = localApiConfiguration?.enableModelTemperature

	const setLocalApiConfigurationField = useCallback(
		<K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => {
			setLocalApiConfiguration((prevState) => {
				if (!prevState || prevState[field] === value) return prevState
				setHasChanges(true)
				return { ...prevState, [field]: value }
			})
		},
		[setHasChanges],
	)

	useEffect(() => {
		if (isSettingsPopupOpen && apiConfiguration) {
			const modelSpecificSettings =
				selectedModelId && selectedProvider
					? apiConfiguration.modelSettings?.[getModelSettingsKey(selectedProvider, selectedModelId)]
					: undefined

			const initialLocalConfig = {
				...apiConfiguration,
				modelMaxTokens:
					modelSpecificSettings?.modelMaxTokens ??
					(selectedModelId && selectedModelInfo
						? getModelMaxOutputTokens({
								modelId: selectedModelId,
								model: selectedModelInfo,
								settings: apiConfiguration,
							})
						: undefined),
				modelMaxThinkingTokens:
					modelSpecificSettings?.modelMaxThinkingTokens ?? DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
				enableReasoningEffort:
					modelSpecificSettings?.enableReasoningEffort ??
					(selectedModelInfo
						? !!(selectedModelInfo.supportsReasoningBudget || selectedModelInfo.requiredReasoningBudget)
						: false),
				modelTemperature: modelSpecificSettings?.modelTemperature ?? 1,
				enableModelTemperature: modelSpecificSettings?.enableModelTemperature ?? false,
			}
			setLocalApiConfiguration(initialLocalConfig)
			setHasChanges(false)
		}
	}, [isSettingsPopupOpen, apiConfiguration, selectedModelId, selectedModelInfo, selectedProvider, setHasChanges])

	useEffect(() => {
		if (localApiProvider === "ollama") {
			vscode.postMessage({ type: "requestOllamaModels" })
		}
	}, [localApiProvider])

	useEvent(
		"message",
		useCallback((event: MessageEvent) => {
			const message = event.data
			if (message.type === "ollamaModels") {
				setOllamaModels(message.ollamaModels ?? [])
			}
		}, []),
	)

	const handleSaveSettings = useCallback(() => {
		if (!localSelectedModelId || !localApiProvider) return

		const modelSettingsKey = getModelSettingsKey(localApiProvider, localSelectedModelId)
		const newModelSettings: ModelSpecificSettings = {
			...(localApiConfiguration?.modelSettings?.[modelSettingsKey] ?? {}),
			modelMaxTokens: localMaxOutputTokens,
			modelMaxThinkingTokens: localThinkingBudget,
			enableReasoningEffort: localEnableReasoning,
			modelTemperature: localModelTemperature,
			enableModelTemperature: localEnableModelTemperature,
		}

		const configToSave: ProviderSettings = {
			...(localApiConfiguration as ProviderSettings),
			providerModelSelections: {
				...apiConfiguration?.providerModelSelections,
				[localApiProvider]: localSelectedModelId,
			},
			modelSettings: {
				...localApiConfiguration?.modelSettings,
				[modelSettingsKey]: newModelSettings,
			},
		}
		delete (configToSave as Partial<ProviderSettings>).modelMaxTokens
		delete (configToSave as Partial<ProviderSettings>).modelMaxThinkingTokens
		delete (configToSave as Partial<ProviderSettings>).enableReasoningEffort
		delete (configToSave as Partial<ProviderSettings>).modelTemperature
		delete (configToSave as Partial<ProviderSettings>).enableModelTemperature

		setIsAwaitingConfigurationUpdate(true)
		vscode.postMessage({
			type: "upsertApiConfiguration",
			text: currentApiConfigName,
			apiConfiguration: configToSave,
		})
		setHasChanges(false)
	}, [
		localApiConfiguration,
		localApiProvider,
		localSelectedModelId,
		localMaxOutputTokens,
		localThinkingBudget,
		localEnableReasoning,
		localModelTemperature,
		localEnableModelTemperature,
		currentApiConfigName,
		setIsAwaitingConfigurationUpdate,
		apiConfiguration,
		setHasChanges,
	])

	const handleModelChange = useCallback(
		(newModelId: string) => {
			if (!localApiProvider) return

			const modelSource = isRouterName(localApiProvider)
				? routerModels?.[localApiProvider]
				: modelSources[localApiProvider as ProviderName]
			const modelInfo =
				modelSource && newModelId in modelSource
					? (modelSource as Record<string, ModelInfo>)[newModelId]
					: undefined

			let newMaxOutputTokens = localMaxOutputTokens
			let newThinkingBudget = localThinkingBudget
			let newEnableReasoning = localEnableReasoning

			if (modelInfo) {
				const modelSettingsKey = getModelSettingsKey(localApiProvider, newModelId)
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
			}

			setLocalApiConfiguration((prevState) => {
				if (!prevState) return undefined
				const modelSettingsKey = getModelSettingsKey(localApiProvider, newModelId)
				const savedModelSettings = apiConfiguration?.modelSettings?.[modelSettingsKey]
				const newModelTemperature = savedModelSettings?.modelTemperature ?? 1
				const newEnableModelTemperature = savedModelSettings?.enableModelTemperature ?? false
				return {
					...prevState,
					apiModelId: newModelId,
					providerModelSelections: {
						...prevState.providerModelSelections,
						[localApiProvider]: newModelId,
					},
					modelMaxTokens: newMaxOutputTokens,
					modelMaxThinkingTokens: newThinkingBudget,
					enableReasoningEffort: newEnableReasoning,
					modelTemperature: newModelTemperature,
					enableModelTemperature: newEnableModelTemperature,
				}
			})
			setHasChanges(true)
		},
		[
			localApiProvider,
			routerModels,
			apiConfiguration,
			localMaxOutputTokens,
			localThinkingBudget,
			localEnableReasoning,
			setHasChanges,
		],
	)

	const handleProviderChange = useCallback(
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

			let newMaxOutputTokens = localMaxOutputTokens
			let newThinkingBudget = localThinkingBudget
			let newEnableReasoning = localEnableReasoning
			let newModelTemperature = localModelTemperature
			let newEnableModelTemperature = localEnableModelTemperature

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

			setLocalApiConfiguration((prevState) => {
				if (!prevState) return undefined
				return {
					...prevState,
					apiProvider: newProvider,
					apiModelId: newModelId,
					providerModelSelections: {
						...prevState.providerModelSelections,
						[newProvider]: newModelId,
					},
					modelMaxTokens: newMaxOutputTokens,
					modelMaxThinkingTokens: newThinkingBudget,
					enableReasoningEffort: newEnableReasoning,
					modelTemperature: newModelTemperature,
					enableModelTemperature: newEnableModelTemperature,
				}
			})
			setHasChanges(true)
		},
		[
			routerModels,
			apiConfiguration,
			localMaxOutputTokens,
			localThinkingBudget,
			localEnableReasoning,
			localModelTemperature,
			localEnableModelTemperature,
			setHasChanges,
		],
	)

	useEffect(() => {
		if (!isSettingsPopupOpen) {
			setHasChanges(false)
		}
	}, [isSettingsPopupOpen, apiConfiguration, setHasChanges])

	const resetState = useCallback(() => {
		setLocalApiConfiguration(apiConfiguration)
		setHasChanges(false)
	}, [apiConfiguration, setHasChanges])

	const handleTemperatureChange = useCallback(
		(value: number | undefined | null) => {
			setLocalApiConfiguration((prevState) => {
				if (!prevState || prevState.modelTemperature === value) return prevState
				setHasChanges(true)
				return { ...prevState, modelTemperature: value }
			})
		},
		[setHasChanges],
	)

	const handleCustomTemperatureChange = useCallback(
		(enabled: boolean) => {
			setLocalApiConfiguration((prevState) => {
				if (!prevState || prevState.enableModelTemperature === enabled) return prevState
				setHasChanges(true)
				return { ...prevState, enableModelTemperature: enabled }
			})
		},
		[setHasChanges],
	)

	return {
		localApiConfiguration,
		setLocalApiConfiguration,
		localApiProvider,
		localSelectedModelId,
		localMaxOutputTokens,
		localThinkingBudget,
		localEnableReasoning,
		localModelTemperature,
		localEnableModelTemperature,
		hasChanges,
		setHasChanges,
		ollamaModels,
		routerModels,
		handleSaveSettings,
		resetState,
		setLocalApiConfigurationField,
		handleProviderChange,
		handleModelChange,
		handleTemperatureChange,
		handleCustomTemperatureChange,
	}
}
