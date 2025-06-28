import React, { memo, useCallback, useEffect, useMemo, useState } from "react"
import { convertHeadersToObject } from "./utils/headers"
import { useDebounce } from "react-use"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"

import {
	type ProviderName,
	type ProviderSettings,
	type ModelSpecificSettings,
	openRouterDefaultModelId,
	requestyDefaultModelId,
	glamaDefaultModelId,
	unboundDefaultModelId,
	litellmDefaultModelId,
	openAiNativeDefaultModelId,
	anthropicDefaultModelId,
	claudeCodeDefaultModelId,
	geminiDefaultModelId,
	geminiCliDefaultModelId,
	deepSeekDefaultModelId,
	mistralDefaultModelId,
	xaiDefaultModelId,
	groqDefaultModelId,
	chutesDefaultModelId,
	bedrockDefaultModelId,
	vertexDefaultModelId,
} from "@roo-code/types"
import { DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS, DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS } from "@roo/api"

import { vscode } from "@src/utils/vscode"
import { validateApiConfigurationExcludingModelErrors, getModelValidationError } from "@src/utils/validate"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useRouterModels } from "@src/components/ui/hooks/useRouterModels"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { filterProviders, filterModels } from "./utils/organizationFilters"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"

import {
	Anthropic,
	Bedrock,
	Chutes,
	ClaudeCode,
	DeepSeek,
	Gemini,
	GeminiCli,
	Glama,
	Groq,
	LMStudio,
	LiteLLM,
	Mistral,
	Ollama,
	OpenAI,
	OpenAICompatible,
	OpenRouter,
	Requesty,
	Unbound,
	Vertex,
	VSCodeLM,
	XAI,
} from "./providers"

import { MODELS_BY_PROVIDER, PROVIDERS } from "./constants"
import { inputEventTransform, noTransform } from "./transforms"
import { ModelInfoView } from "./ModelInfoView"
import { ApiErrorMessage } from "./ApiErrorMessage"
import { ThinkingBudget } from "./ThinkingBudget"
import { DiffSettingsControl } from "./DiffSettingsControl"
import { TemperatureControl } from "./TemperatureControl"
import { RateLimitSecondsControl } from "./RateLimitSecondsControl"
import { BedrockCustomArn } from "./providers/BedrockCustomArn"
import { buildDocLink } from "@src/utils/docLinks"
import { getModelSettingsKey } from "@src/utils/settings"

export interface ApiOptionsProps {
	uriScheme: string | undefined
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => void
	setApiConfiguration: (config: ProviderSettings) => void
	initializeApiConfigurationField?: <K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => void
	fromWelcomeView?: boolean
	errorMessage: string | undefined
	setErrorMessage: React.Dispatch<React.SetStateAction<string | undefined>>
}

const ApiOptions = ({
	uriScheme,
	apiConfiguration,
	setApiConfigurationField,
	setApiConfiguration,
	fromWelcomeView,
	errorMessage,
	setErrorMessage,
	initializeApiConfigurationField,
}: ApiOptionsProps) => {
	const { t } = useAppTranslation()
	const { organizationAllowList } = useExtensionState()

	const [customHeaders, setCustomHeaders] = useState<[string, string][]>(() => {
		const headers = apiConfiguration?.openAiHeaders || {}
		return Object.entries(headers)
	})

	useEffect(() => {
		const propHeaders = apiConfiguration?.openAiHeaders || {}

		if (JSON.stringify(customHeaders) !== JSON.stringify(Object.entries(propHeaders))) {
			setCustomHeaders(Object.entries(propHeaders))
		}
	}, [apiConfiguration?.openAiHeaders, customHeaders])

	// Helper to convert array of tuples to object (filtering out empty keys).

	// Debounced effect to update the main configuration when local
	// customHeaders state stabilizes.
	useDebounce(
		() => {
			const currentConfigHeaders = apiConfiguration?.openAiHeaders || {}
			const newHeadersObject = convertHeadersToObject(customHeaders)

			// Only update if the processed object is different from the current config.
			if (JSON.stringify(currentConfigHeaders) !== JSON.stringify(newHeadersObject)) {
				setApiConfigurationField("openAiHeaders", newHeadersObject)
			}
		},
		300,
		[customHeaders, apiConfiguration?.openAiHeaders, setApiConfigurationField],
	)

	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const {
		provider: selectedProvider,
		id: selectedModelId,
		info: selectedModelInfo,
	} = useSelectedModel(apiConfiguration)

	const { data: routerModels, refetch: refetchRouterModels } = useRouterModels()

	// Update `apiModelId` whenever `selectedModelId` changes.
	useEffect(() => {
		if (selectedModelId) {
			setApiConfigurationField("apiModelId", selectedModelId)
		}
	}, [selectedModelId, setApiConfigurationField])

	// Debounced refresh model updates, only executed 250ms after the user
	// stops typing.
	useDebounce(
		() => {
			if (selectedProvider === "openai") {
				// Use our custom headers state to build the headers object.
				const headerObject = convertHeadersToObject(customHeaders)

				vscode.postMessage({
					type: "requestOpenAiModels",
					values: {
						baseUrl: apiConfiguration?.openAiBaseUrl,
						apiKey: apiConfiguration?.openAiApiKey,
						customHeaders: {}, // Reserved for any additional headers
						openAiHeaders: headerObject,
					},
				})
			} else if (selectedProvider === "ollama") {
				vscode.postMessage({ type: "requestOllamaModels" })
			} else if (selectedProvider === "lmstudio") {
				vscode.postMessage({ type: "requestLmStudioModels" })
			} else if (selectedProvider === "vscode-lm") {
				vscode.postMessage({ type: "requestVsCodeLmModels" })
			} else if (selectedProvider === "litellm") {
				vscode.postMessage({ type: "requestRouterModels" })
			}
		},
		250,
		[
			selectedProvider,
			apiConfiguration?.requestyApiKey,
			apiConfiguration?.openAiBaseUrl,
			apiConfiguration?.openAiApiKey,
			apiConfiguration?.ollamaBaseUrl,
			apiConfiguration?.lmStudioBaseUrl,
			apiConfiguration?.litellmBaseUrl,
			apiConfiguration?.litellmApiKey,
			customHeaders,
		],
	)

	useEffect(() => {
		const apiValidationResult = validateApiConfigurationExcludingModelErrors(
			apiConfiguration,
			routerModels,
			organizationAllowList,
		)
		setErrorMessage(apiValidationResult)
	}, [apiConfiguration, routerModels, organizationAllowList, setErrorMessage])

	const selectedProviderModels = useMemo(() => {
		const models = MODELS_BY_PROVIDER[selectedProvider]
		if (!models) return []

		const filteredModels = filterModels(models, selectedProvider, organizationAllowList)

		const modelOptions = filteredModels
			? Object.keys(filteredModels).map((modelId) => ({
					value: modelId,
					label: modelId,
				}))
			: []

		return modelOptions
	}, [selectedProvider, organizationAllowList])

	const onProviderChange = useCallback(
		(newProvider: ProviderName) => {
			const newConfig = { ...apiConfiguration, apiProvider: newProvider }
			const PROVIDER_MODEL_CONFIG: Partial<
				Record<
					ProviderName,
					{
						field: keyof ProviderSettings
						default?: string
					}
				>
			> = {
				openrouter: { field: "openRouterModelId", default: openRouterDefaultModelId },
				glama: { field: "glamaModelId", default: glamaDefaultModelId },
				unbound: { field: "unboundModelId", default: unboundDefaultModelId },
				requesty: { field: "requestyModelId", default: requestyDefaultModelId },
				litellm: { field: "litellmModelId", default: litellmDefaultModelId },
				anthropic: { field: "apiModelId", default: anthropicDefaultModelId },
				"claude-code": { field: "apiModelId", default: claudeCodeDefaultModelId },
				"openai-native": { field: "apiModelId", default: openAiNativeDefaultModelId },
				gemini: { field: "apiModelId", default: geminiDefaultModelId },
				"gemini-cli": { field: "apiModelId", default: geminiCliDefaultModelId },
				deepseek: { field: "apiModelId", default: deepSeekDefaultModelId },
				mistral: { field: "apiModelId", default: mistralDefaultModelId },
				xai: { field: "apiModelId", default: xaiDefaultModelId },
				groq: { field: "apiModelId", default: groqDefaultModelId },
				chutes: { field: "apiModelId", default: chutesDefaultModelId },
				bedrock: { field: "apiModelId", default: bedrockDefaultModelId },
				vertex: { field: "apiModelId", default: vertexDefaultModelId },
				openai: { field: "openAiModelId" },
				ollama: { field: "ollamaModelId" },
				lmstudio: { field: "lmStudioModelId" },
			}
			const modelIdField = PROVIDER_MODEL_CONFIG[newProvider]?.field
			const defaultModelId = PROVIDER_MODEL_CONFIG[newProvider]?.default

			if (modelIdField && defaultModelId && !newConfig[modelIdField]) {
				;(newConfig as any)[modelIdField] = defaultModelId
			}

			setApiConfiguration(newConfig)
		},
		[apiConfiguration, setApiConfiguration],
	)

	const modelValidationError = useMemo(() => {
		return getModelValidationError(apiConfiguration, routerModels, organizationAllowList)
	}, [apiConfiguration, routerModels, organizationAllowList])

	const modelSettingsKey = useMemo(
		() => getModelSettingsKey(selectedProvider, selectedModelId),
		[selectedProvider, selectedModelId],
	)

	useEffect(() => {
		// Initialize model-specific settings if they don't exist for the selected model.
		if (!selectedModelId || !modelSettingsKey || !selectedModelInfo) return

		const modelSettings = apiConfiguration.modelSettings?.[modelSettingsKey]

		if (selectedModelInfo.supportsReasoningBudget) {
			const needsInit =
				modelSettings?.modelMaxTokens === undefined ||
				modelSettings?.modelMaxThinkingTokens === undefined ||
				modelSettings?.enableReasoningEffort === undefined

			if (needsInit) {
				const newModelSettings = {
					...(apiConfiguration.modelSettings ?? {}),
					[modelSettingsKey]: {
						...(modelSettings ?? {}),
						modelMaxTokens: modelSettings?.modelMaxTokens ?? DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS,
						modelMaxThinkingTokens:
							modelSettings?.modelMaxThinkingTokens ?? DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
						enableReasoningEffort: modelSettings?.enableReasoningEffort ?? true,
					},
				}
				const initFn = initializeApiConfigurationField ?? setApiConfigurationField
				initFn("modelSettings", newModelSettings)
			}
		}
	}, [
		selectedModelId,
		selectedModelInfo,
		apiConfiguration,
		modelSettingsKey,
		setApiConfigurationField,
		initializeApiConfigurationField,
	])

	const setModelSettingsFields = useCallback(
		(updates: Partial<ModelSpecificSettings>) => {
			if (!modelSettingsKey) return

			const newModelSettings = {
				...(apiConfiguration.modelSettings ?? {}),
				[modelSettingsKey]: {
					...(apiConfiguration.modelSettings?.[modelSettingsKey] ?? {}),
					...updates,
				},
			}
			setApiConfigurationField("modelSettings", newModelSettings)
		},
		[modelSettingsKey, apiConfiguration.modelSettings, setApiConfigurationField],
	)

	const docs = useMemo(() => {
		const provider = PROVIDERS.find(({ value }) => value === selectedProvider)
		const name = provider?.label

		if (!name) {
			return undefined
		}

		// Get the URL slug - use custom mapping if available, otherwise use the provider key.
		const slugs: Record<string, string> = {
			"openai-native": "openai",
			openai: "openai-compatible",
		}

		const slug = slugs[selectedProvider] || selectedProvider
		return {
			url: buildDocLink(`providers/${slug}`, "provider_docs"),
			name,
		}
	}, [selectedProvider])

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1 relative">
				<div className="flex justify-between items-center">
					<label className="block font-medium mb-1">{t("settings:providers.apiProvider")}</label>
					{docs && (
						<div className="text-xs text-vscode-descriptionForeground">
							<VSCodeLink href={docs.url} className="hover:text-vscode-foreground" target="_blank">
								{t("settings:providers.providerDocumentation", { provider: docs.name })}
							</VSCodeLink>
						</div>
					)}
				</div>
				<Select value={selectedProvider} onValueChange={(value) => onProviderChange(value as ProviderName)}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder={t("settings:common.select")} />
					</SelectTrigger>
					<SelectContent>
						{filterProviders(PROVIDERS, organizationAllowList).map(({ value, label }) => (
							<SelectItem key={value} value={value}>
								{label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{errorMessage && <ApiErrorMessage errorMessage={errorMessage} />}

			{selectedProvider === "openrouter" && (
				<OpenRouter
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					routerModels={routerModels}
					selectedModelId={selectedModelId}
					uriScheme={uriScheme}
					fromWelcomeView={fromWelcomeView}
					organizationAllowList={organizationAllowList}
					modelValidationError={modelValidationError}
				/>
			)}

			{selectedProvider === "requesty" && (
				<Requesty
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					routerModels={routerModels}
					refetchRouterModels={refetchRouterModels}
					organizationAllowList={organizationAllowList}
					modelValidationError={modelValidationError}
				/>
			)}

			{selectedProvider === "glama" && (
				<Glama
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					routerModels={routerModels}
					uriScheme={uriScheme}
					organizationAllowList={organizationAllowList}
					modelValidationError={modelValidationError}
				/>
			)}

			{selectedProvider === "unbound" && (
				<Unbound
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					routerModels={routerModels}
					organizationAllowList={organizationAllowList}
					modelValidationError={modelValidationError}
				/>
			)}

			{selectedProvider === "anthropic" && (
				<Anthropic apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "claude-code" && (
				<ClaudeCode apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "openai-native" && (
				<OpenAI apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "mistral" && (
				<Mistral apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "bedrock" && (
				<Bedrock
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					selectedModelInfo={selectedModelInfo}
				/>
			)}

			{selectedProvider === "vertex" && (
				<Vertex apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "gemini" && (
				<Gemini apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "gemini-cli" && (
				<GeminiCli apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "openai" && (
				<OpenAICompatible
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					organizationAllowList={organizationAllowList}
					modelValidationError={modelValidationError}
				/>
			)}

			{selectedProvider === "lmstudio" && (
				<LMStudio apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "deepseek" && (
				<DeepSeek apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "vscode-lm" && (
				<VSCodeLM apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "ollama" && (
				<Ollama apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "xai" && (
				<XAI apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "groq" && (
				<Groq apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "chutes" && (
				<Chutes apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "litellm" && (
				<LiteLLM
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					organizationAllowList={organizationAllowList}
					modelValidationError={modelValidationError}
				/>
			)}

			{selectedProvider === "human-relay" && (
				<>
					<div className="text-sm text-vscode-descriptionForeground">
						{t("settings:providers.humanRelay.description")}
					</div>
					<div className="text-sm text-vscode-descriptionForeground">
						{t("settings:providers.humanRelay.instructions")}
					</div>
				</>
			)}

			{selectedProviderModels.length > 0 && (
				<>
					<div>
						<label className="block font-medium mb-1">{t("settings:providers.model")}</label>
						<Select
							value={selectedModelId === "custom-arn" ? "custom-arn" : selectedModelId}
							onValueChange={(value) => {
								const newConfig = { ...apiConfiguration, apiModelId: value }

								// Clear custom ARN if not using custom ARN option.
								if (value !== "custom-arn" && selectedProvider === "bedrock") {
									newConfig.awsCustomArn = ""
								}

								const modelSettingsKey = getModelSettingsKey(selectedProvider, value)
								if (
									modelSettingsKey &&
									!newConfig.modelSettings?.[modelSettingsKey] &&
									selectedModelInfo
								) {
									const modelIsHybrid =
										!!selectedModelInfo.supportsReasoningBudget ||
										!!selectedModelInfo.requiredReasoningBudget

									const defaultMaxOutputTokens =
										selectedModelInfo.maxTokens ??
										(modelIsHybrid ? DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS : undefined)

									const defaultThinkingBudget = selectedModelInfo.supportsReasoningBudget
										? (selectedModelInfo.maxThinkingTokens ??
											DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS)
										: undefined

									const defaultEnableReasoning = !!selectedModelInfo.requiredReasoningBudget

									newConfig.modelSettings = {
										...(newConfig.modelSettings ?? {}),
										[modelSettingsKey]: {
											modelMaxTokens: defaultMaxOutputTokens,
											modelMaxThinkingTokens: defaultThinkingBudget,
											enableReasoningEffort: defaultEnableReasoning,
										},
									}
								}

								setApiConfiguration(newConfig)
							}}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder={t("settings:common.select")} />
							</SelectTrigger>
							<SelectContent>
								{selectedProviderModels.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
								{selectedProvider === "bedrock" && (
									<SelectItem value="custom-arn">{t("settings:labels.useCustomArn")}</SelectItem>
								)}
							</SelectContent>
						</Select>
					</div>

					{selectedProvider === "bedrock" && selectedModelId === "custom-arn" && (
						<BedrockCustomArn
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
						/>
					)}

					<ModelInfoView
						apiProvider={selectedProvider}
						selectedModelId={selectedModelId}
						modelInfo={selectedModelInfo}
						isDescriptionExpanded={isDescriptionExpanded}
						setIsDescriptionExpanded={setIsDescriptionExpanded}
					/>
				</>
			)}

			<ThinkingBudget
				key={modelSettingsKey}
				apiProvider={selectedProvider}
				apiModelId={selectedModelId}
				modelSettings={modelSettingsKey ? apiConfiguration.modelSettings?.[modelSettingsKey] : undefined}
				setModelSettingsFields={setModelSettingsFields}
				modelInfo={selectedModelInfo}
			/>

			{!fromWelcomeView && (
				<>
					<DiffSettingsControl
						diffEnabled={apiConfiguration.diffEnabled}
						fuzzyMatchThreshold={apiConfiguration.fuzzyMatchThreshold}
						onChange={(field, value) => setApiConfigurationField(field, value)}
					/>
					<TemperatureControl
						value={apiConfiguration.modelTemperature}
						onChange={handleInputChange("modelTemperature", noTransform)}
						maxValue={2}
					/>
					<RateLimitSecondsControl
						value={apiConfiguration.rateLimitSeconds || 0}
						onChange={(value) => setApiConfigurationField("rateLimitSeconds", value)}
					/>
				</>
			)}
		</div>
	)
}

export default memo(ApiOptions)
