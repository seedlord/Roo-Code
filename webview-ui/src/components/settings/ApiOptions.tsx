import React, { memo, useEffect, useMemo, useState } from "react"
import { convertHeadersToObject } from "./utils/headers"
import { useDebounce } from "react-use"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { ExternalLinkIcon } from "@radix-ui/react-icons"

import {
	type ProviderName,
	type ProviderSettings,
	DEFAULT_CONSECUTIVE_MISTAKE_LIMIT,
} from "@roo-code/types"

import { vscode } from "@src/utils/vscode"
import { validateApiConfigurationExcludingModelErrors, getModelValidationError } from "@src/utils/validate"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import {
	useOpenRouterModelProviders,
	OPENROUTER_DEFAULT_PROVIDER_NAME,
} from "@src/components/ui/hooks/useOpenRouterModelProviders"
import { filterProviders, filterModels } from "./utils/organizationFilters"
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
	SearchableSelect,
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from "@src/components/ui"

import {
	Anthropic,
	Bedrock,
	Chutes,
	ClaudeCode,
	DeepSeek,
	Gemini,
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
import { ModelInfoView } from "./ModelInfoView"
import { ApiErrorMessage } from "./ApiErrorMessage"
import { ThinkingBudget } from "./ThinkingBudget"
import { DiffSettingsControl } from "./DiffSettingsControl"
import { TemperatureControl } from "./TemperatureControl"
import { RateLimitSecondsControl } from "./RateLimitSecondsControl"
import { ConsecutiveMistakeLimitControl } from "./ConsecutiveMistakeLimitControl"
import { BedrockCustomArn } from "./providers/BedrockCustomArn"
import { buildDocLink } from "@src/utils/docLinks"
import { useSettingsForm } from "./hooks/useSettingsForm"

export interface ApiOptionsProps {
	uriScheme: string | undefined
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => void
	fromWelcomeView?: boolean
	errorMessage: string | undefined
	setErrorMessage: React.Dispatch<React.SetStateAction<string | undefined>>
}

const ApiOptions = ({
	uriScheme,
	apiConfiguration,
	setApiConfigurationField,
	fromWelcomeView,
	errorMessage,
	setErrorMessage,
}: ApiOptionsProps) => {
	const { t } = useAppTranslation()
	const { organizationAllowList } = useExtensionState()

	const {
		isDescriptionExpanded,
		setIsDescriptionExpanded,
		selectedProvider,
		selectedModelId,
		selectedModelInfo,
		routerModels,
		refetchRouterModels,
		onProviderChange,
		handleModelChange,
	} = useSettingsForm(apiConfiguration, setApiConfigurationField)

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

	useDebounce(
		() => {
			const currentConfigHeaders = apiConfiguration?.openAiHeaders || {}
			const newHeadersObject = convertHeadersToObject(customHeaders)

			if (JSON.stringify(currentConfigHeaders) !== JSON.stringify(newHeadersObject)) {
				setApiConfigurationField("openAiHeaders", newHeadersObject)
			}
		},
		300,
		[customHeaders, apiConfiguration?.openAiHeaders, setApiConfigurationField],
	)

	const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false)

	const { data: openRouterModelProviders } = useOpenRouterModelProviders(apiConfiguration?.openRouterModelId, {
		enabled:
			!!apiConfiguration?.openRouterModelId &&
			routerModels?.openrouter &&
			Object.keys(routerModels.openrouter).length > 1 &&
			apiConfiguration.openRouterModelId in routerModels.openrouter,
	})

	// Request router models when the component mounts
	useEffect(() => {
		vscode.postMessage({ type: "requestRouterModels" })
	}, [])

	// Update `apiModelId` whenever `selectedModelId` changes.
	useEffect(() => {
		if (selectedModelId && apiConfiguration.apiModelId !== selectedModelId) {
			setApiConfigurationField("apiModelId", selectedModelId)
		}
	}, [selectedModelId, setApiConfigurationField, apiConfiguration.apiModelId])

	// Debounced refresh model updates, only executed 250ms after the user
	// stops typing.
	useDebounce(
		() => {
			if (selectedProvider === "openai") {
				const headerObject = convertHeadersToObject(customHeaders)

				vscode.postMessage({
					type: "requestOpenAiModels",
					values: {
						baseUrl: apiConfiguration?.openAiBaseUrl,
						apiKey: apiConfiguration?.openAiApiKey,
						customHeaders: {},
						openAiHeaders: headerObject,
					},
				})
			} else if (selectedProvider === "ollama") {
				vscode.postMessage({ type: "requestOllamaModels" })
			} else if (selectedProvider === "lmstudio") {
				vscode.postMessage({ type: "requestLmStudioModels" })
			} else if (selectedProvider === "vscode-lm") {
				vscode.postMessage({ type: "requestVsCodeLmModels" })
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

	const modelValidationError = useMemo(() => {
		return getModelValidationError(apiConfiguration, routerModels, organizationAllowList)
	}, [apiConfiguration, routerModels, organizationAllowList])

	const docs = useMemo(() => {
		const provider = PROVIDERS.find(({ value }) => value === selectedProvider)
		const name = provider?.label

		if (!name) {
			return undefined
		}

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

	const providerOptions = useMemo(() => {
		return filterProviders(PROVIDERS, organizationAllowList).map(({ value, label }) => ({
			value,
			label,
		}))
	}, [organizationAllowList])

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
				<SearchableSelect
					value={selectedProvider}
					onValueChange={(value) => onProviderChange(value as ProviderName)}
					options={providerOptions}
					placeholder={t("settings:common.select")}
					searchPlaceholder={t("settings:providers.searchProviderPlaceholder")}
					emptyMessage={t("settings:providers.noProviderMatchFound")}
					className="w-full"
					data-testid="provider-select"
				/>
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
								handleModelChange(value)
								if (value !== "custom-arn" && selectedProvider === "bedrock") {
									setApiConfigurationField("awsCustomArn", "")
								}
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
				key={`${selectedProvider}-${selectedModelId}`}
				enableReasoningEffort={
					apiConfiguration.modelSettings?.[`${selectedProvider}:${selectedModelId}`]?.enableReasoningEffort
				}
				reasoningEffort={apiConfiguration.reasoningEffort}
				customMaxOutputTokens={
					apiConfiguration.modelSettings?.[`${selectedProvider}:${selectedModelId}`]?.modelMaxTokens ?? 0
				}
				customMaxThinkingTokens={
					apiConfiguration.modelSettings?.[`${selectedProvider}:${selectedModelId}`]
						?.modelMaxThinkingTokens ?? 0
				}
				modelMaxThinkingTokens={selectedModelInfo?.maxThinkingTokens ?? 0}
				isReasoningBudgetSupported={selectedModelInfo?.supportsReasoningBudget ?? false}
				isReasoningBudgetRequired={selectedModelInfo?.requiredReasoningBudget ?? false}
				isReasoningEffortSupported={selectedModelInfo?.supportsReasoningEffort ?? false}
				maxTokens={selectedModelInfo?.maxTokens ?? undefined}
				onReasoningEffortChange={(value) => setApiConfigurationField("enableReasoningEffort", value)}
				onReasoningEffortValueChange={(value) => setApiConfigurationField("reasoningEffort", value)}
				onMaxOutputTokensChange={(value) => setApiConfigurationField("modelMaxTokens", value)}
				onMaxThinkingTokensChange={(value) => setApiConfigurationField("modelMaxThinkingTokens", value)}
			/>

			{!fromWelcomeView && (
				<Collapsible open={isAdvancedSettingsOpen} onOpenChange={setIsAdvancedSettingsOpen}>
					<CollapsibleTrigger className="flex items-center gap-1 w-full cursor-pointer hover:opacity-80 mb-2">
						<span className={`codicon codicon-chevron-${isAdvancedSettingsOpen ? "down" : "right"}`}></span>
						<span className="font-medium">{t("settings:advancedSettings.title")}</span>
					</CollapsibleTrigger>
					<CollapsibleContent className="space-y-3">
						<DiffSettingsControl
							diffEnabled={apiConfiguration.diffEnabled}
							fuzzyMatchThreshold={apiConfiguration.fuzzyMatchThreshold}
							onChange={(field, value) => setApiConfigurationField(field, value)}
						/>
						<TemperatureControl
						value={
							apiConfiguration.modelSettings?.[`${selectedProvider}:${selectedModelId}`]
								?.modelTemperature ?? 1
						}
						isCustomEnabled={
							apiConfiguration.modelSettings?.[`${selectedProvider}:${selectedModelId}`]
								?.enableModelTemperature ?? false
						}
						onCustomEnabledChange={(enabled) => {
							if (selectedProvider && selectedModelId) {
								setApiConfigurationField("enableModelTemperature", enabled)
							}
						}}
						onChange={(value) => {
							if (selectedProvider && selectedModelId) {
								setApiConfigurationField("modelTemperature", value)
							}
						}}
						maxValue={2}
					/>
						<RateLimitSecondsControl
							value={apiConfiguration.rateLimitSeconds || 0}
							onChange={(value) => setApiConfigurationField("rateLimitSeconds", value)}
						/>
						<ConsecutiveMistakeLimitControl
							value={
								apiConfiguration.consecutiveMistakeLimit !== undefined
									? apiConfiguration.consecutiveMistakeLimit
									: DEFAULT_CONSECUTIVE_MISTAKE_LIMIT
							}
							onChange={(value) => setApiConfigurationField("consecutiveMistakeLimit", value)}
						/>
						{selectedProvider === "openrouter" &&
							openRouterModelProviders &&
							Object.keys(openRouterModelProviders).length > 0 && (
								<div>
									<div className="flex items-center gap-1">
										<label className="block font-medium mb-1">
											{t("settings:providers.openRouter.providerRouting.title")}
										</label>
										<a href={`https://openrouter.ai/${selectedModelId}/providers`}>
											<ExternalLinkIcon className="w-4 h-4" />
										</a>
									</div>
									<Select
										value={
											apiConfiguration?.openRouterSpecificProvider ||
											OPENROUTER_DEFAULT_PROVIDER_NAME
										}
										onValueChange={(value) =>
											setApiConfigurationField("openRouterSpecificProvider", value)
										}>
										<SelectTrigger className="w-full">
											<SelectValue placeholder={t("settings:common.select")} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={OPENROUTER_DEFAULT_PROVIDER_NAME}>
												{OPENROUTER_DEFAULT_PROVIDER_NAME}
											</SelectItem>
											{Object.entries(openRouterModelProviders).map(([value, { label }]) => (
												<SelectItem key={value} value={value}>
													{label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<div className="text-sm text-vscode-descriptionForeground mt-1">
										{t("settings:providers.openRouter.providerRouting.description")}{" "}
										<a href="https://openrouter.ai/docs/features/provider-routing">
											{t("settings:providers.openRouter.providerRouting.learnMore")}.
										</a>
									</div>
								</div>
							)}
					</CollapsibleContent>
				</Collapsible>
			)}
		</div>
	)
}

export default memo(ApiOptions)
