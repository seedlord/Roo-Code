import React, { useCallback, useEffect, useRef, useState } from "react"
import { useEvent } from "react-use"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { PROVIDERS } from "../settings/constants"
import {
	ModelInfo,
	ProviderName,
	ProviderSettings,
	ModelSpecificSettings,
	claudeCodeModels,
	anthropicModels,
	bedrockModels,
	chutesModels,
	deepSeekModels,
	geminiModels,
	groqModels,
	ollamaModels,
	openAiNativeModels,
	vertexModels,
	vscodeLlmModels,
	xaiModels,
	mistralModels,
} from "@roo-code/types"
import {
	DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS,
	DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
	getModelMaxOutputTokens,
	isRouterName,
	RouterName,
} from "@roo/api"
import { VSCodeBadge, VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { Trans, useTranslation } from "react-i18next"
import { EditableValue } from "./EditableValue"
import { Button, Popover, PopoverContent, PopoverTrigger, Slider } from "../ui"
import { formatPrice } from "@/utils/formatPrice"
import { vscode } from "@/utils/vscode"
import { useSelectedModel } from "../ui/hooks/useSelectedModel"

const modelSources: Partial<Record<ProviderName, Record<string, ModelInfo> | ModelInfo>> = {
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

// This is the content that will be shown when the bar is expanded.
// It's defined as an inner component to keep the main component's return statement clean
// and to encapsulate the detailed logic.

const getModelSettingsKey = (provider: ProviderName | RouterName, modelId: string) => `${provider}:${modelId}`

export const ProfileInfoBar: React.FC = () => {
	const [isExpanded, setIsExpanded] = useState(true)
	const [isSettingsPopupOpen, setIsSettingsPopupOpen] = useState(false) // New state for settings popup
	const [hasChanges, setHasChanges] = useState(false) // New state to track changes
	const { t } = useTranslation()
	const [ollamaModels, setOllamaModels] = useState<string[]>([])
	const { apiConfiguration, currentApiConfigName, setIsAwaitingConfigurationUpdate, routerModels } =
		useExtensionState()
	const {
		id: selectedModelId,
		info: selectedModelInfo,
		provider: selectedProvider,
	} = useSelectedModel(apiConfiguration)

	const profileInfoBarRef = useRef<HTMLDivElement>(null)
	const popoverContentRef = useRef<HTMLDivElement>(null) // Ref for the popover content

	// Local states for slider values, initialized from apiConfiguration
	const [localApiConfiguration, setLocalApiConfiguration] = useState<ProviderSettings | undefined>(apiConfiguration)

	const localApiProvider = localApiConfiguration?.apiProvider
	const localSelectedModelId = localApiProvider && localApiConfiguration?.providerModelSelections?.[localApiProvider]
	const localMaxOutputTokens = localApiConfiguration?.modelMaxTokens
	const localThinkingBudget = localApiConfiguration?.modelMaxThinkingTokens
	const localEnableReasoning = localApiConfiguration?.enableReasoningEffort

	const setLocalApiConfigurationField = useCallback(
		<K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => {
			setLocalApiConfiguration((prevState) => {
				if (!prevState) return undefined
				if (prevState[field] === value) {
					return prevState
				}

				setHasChanges(true)
				return { ...prevState, [field]: value }
			})
		},
		[setHasChanges],
	)

	// Effect to sync local state when the popup opens or the main configuration changes
	useEffect(() => {
		if (isSettingsPopupOpen && apiConfiguration) {
			// When the popup opens, initialize its local state.
			// Prioritize the model-specific settings, then fall back to the model's calculated defaults.
			// This avoids using the stale top-level profile settings as a fallback.
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
			}

			setLocalApiConfiguration(initialLocalConfig)
			setHasChanges(false)
		}
	}, [isSettingsPopupOpen, apiConfiguration, selectedModelId, selectedModelInfo, selectedProvider])

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

		const newModelSettings: ModelSpecificSettings = {
			modelMaxTokens: localMaxOutputTokens,
			modelMaxThinkingTokens: localThinkingBudget,
			enableReasoningEffort: localEnableReasoning,
		}

		const modelSettingsKey = getModelSettingsKey(localApiProvider, localSelectedModelId)

		const configToSave: ProviderSettings = {
			...localApiConfiguration,
			// Also update the legacy apiModelId for backward compatibility
			apiModelId: localSelectedModelId,
			modelSettings: {
				...localApiConfiguration?.modelSettings,
				[modelSettingsKey]: newModelSettings,
			},
		}

		// Delete top-level properties to prevent them from polluting the stored profile.
		// These settings are now managed exclusively on a per-model basis in `modelSettings`.
		delete (configToSave as Partial<ProviderSettings>).modelMaxTokens
		delete (configToSave as Partial<ProviderSettings>).modelMaxThinkingTokens
		delete (configToSave as Partial<ProviderSettings>).enableReasoningEffort

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
		setHasChanges,
		currentApiConfigName,
		setIsAwaitingConfigurationUpdate,
	])

	useEffect(() => {
		const modelInfo = selectedModelInfo
		const isReasoningBudgetSupported = !!modelInfo && modelInfo.supportsReasoningBudget

		if (!isReasoningBudgetSupported || !localApiConfiguration) {
			return
		}

		const customMaxOutputTokens = localApiConfiguration.modelMaxTokens ?? 0
		const customMaxThinkingTokens = localApiConfiguration.modelMaxThinkingTokens ?? 0

		const modelMaxThinkingTokens = modelInfo?.maxThinkingTokens
			? Math.min(modelInfo.maxThinkingTokens, Math.floor(0.8 * customMaxOutputTokens))
			: Math.floor(0.8 * customMaxOutputTokens)

		if (customMaxThinkingTokens > modelMaxThinkingTokens) {
			setLocalApiConfiguration((prevState) => {
				if (!prevState) return undefined
				const newState = { ...prevState, modelMaxThinkingTokens: modelMaxThinkingTokens }
				if (JSON.stringify(prevState) === JSON.stringify(newState)) {
					return prevState
				}
				setHasChanges(true)
				return newState
			})
		}
	}, [localApiConfiguration, selectedModelInfo, setLocalApiConfiguration, setHasChanges])

	const handleCloseSettings = useCallback(() => {
		// Reset local states to original values if not saved
		setLocalApiConfiguration(apiConfiguration)
		setIsSettingsPopupOpen(false)
		setHasChanges(false) // Reset changes flag when closing without saving
	}, [apiConfiguration, setLocalApiConfiguration, setIsSettingsPopupOpen, setHasChanges])

	// Close popover when clicking outside or webview loses focus
	useEffect(() => {
		if (!isSettingsPopupOpen) {
			return
		}

		const handleClickOutside = (event: MouseEvent) => {
			if (
				profileInfoBarRef.current &&
				!profileInfoBarRef.current.contains(event.target as Node) &&
				popoverContentRef.current &&
				!popoverContentRef.current.contains(event.target as Node)
			) {
				handleCloseSettings()
			}
		}

		const handleBlur = () => {
			handleCloseSettings()
		}

		document.addEventListener("mousedown", handleClickOutside, true)
		window.addEventListener("blur", handleBlur)

		return () => {
			document.removeEventListener("mousedown", handleClickOutside, true)
			window.removeEventListener("blur", handleBlur)
		}
	}, [isSettingsPopupOpen, handleCloseSettings])

	if (!apiConfiguration) {
		return null
	}

	const { apiProvider } = apiConfiguration

	if (!apiProvider) {
		return null
	}

	const providerDisplayName = PROVIDERS.find((p) => p.value === selectedProvider)?.label || selectedProvider
	const modelId = selectedModelId

	// Use the centrally fetched modelInfo
	const modelInfo = selectedModelInfo
	const modelSettings =
		modelId && selectedProvider
			? apiConfiguration.modelSettings?.[getModelSettingsKey(selectedProvider, modelId)]
			: undefined

	// Moved from ExpandedContent
	const isEditable = !!(modelInfo?.supportsReasoningBudget || modelInfo?.requiredReasoningBudget)
	const defaultReasoningState = !!(modelInfo?.supportsReasoningBudget || modelInfo?.requiredReasoningBudget)
	const isReasoningEnabled = isEditable && (modelSettings?.enableReasoningEffort ?? defaultReasoningState)

	const maxOutputTokens =
		modelSettings?.modelMaxTokens ??
		(modelInfo && modelId
			? getModelMaxOutputTokens({
					modelId: modelId,
					model: modelInfo,
					settings: { ...apiConfiguration, enableReasoningEffort: isReasoningEnabled },
				})
			: undefined)

	const thinkingBudget = isReasoningEnabled
		? (modelSettings?.modelMaxThinkingTokens ?? DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS)
		: undefined

	const contextWindow = modelInfo?.contextWindow
	const inputPrice = modelInfo?.inputPrice
	const outputPrice = modelInfo?.outputPrice
	const cacheWritesPrice = modelInfo?.cacheWritesPrice
	const cacheReadsPrice = modelInfo?.cacheReadsPrice

	// Moved from ExpandedContent
	const formatTokenCount = (tokens: number | undefined | null) => {
		if (tokens === undefined || tokens === null) return "N/A"
		const K_DIVISOR = 1000 // Use 1000 for more intuitive display (e.g., 32000 -> 32K)
		const M_DIVISOR = K_DIVISOR * K_DIVISOR

		if (tokens >= M_DIVISOR) {
			return `${Math.round(tokens / M_DIVISOR)}M`
		}
		if (tokens >= K_DIVISOR) {
			return `${Math.round(tokens / K_DIVISOR)}K`
		}
		return tokens.toString()
	}

	const PlaceholderSpan: React.FC = () => <span className="block invisible">&nbsp;</span>

	const MarqueeText: React.FC<{ text: string; title: string }> = ({ text, title }) => {
		const textRef = useRef<HTMLSpanElement>(null)
		const containerRef = useRef<HTMLDivElement>(null)

		const animationTimeoutIds = useRef<NodeJS.Timeout[]>([])
		const animationEndHandlerRef = useRef<(() => void) | null>(null)

		useEffect(() => {
			const PAUSE_DURATION_MS = 1500
			const SCROLL_SPEED_PIXELS_PER_S = 50
			const textEl = textRef.current
			const containerEl = containerRef.current

			const clearAllTimeouts = () => {
				animationTimeoutIds.current.forEach(clearTimeout)
				animationTimeoutIds.current = []
			}

			const resetTextAnimation = () => {
				if (textEl) {
					if (animationEndHandlerRef.current) {
						textEl.removeEventListener("animationend", animationEndHandlerRef.current)
						animationEndHandlerRef.current = null
					}
					textEl.classList.remove("marquee-text-animate")
					textEl.style.transform = "translateX(0%)"
					textEl.style.animationDuration = ""
				}
			}

			const startAnimationCycle = () => {
				if (!textEl || !containerEl) return

				clearAllTimeouts()
				resetTextAnimation()

				const textScrollWidth = textEl.scrollWidth
				const containerClientWidth = containerEl.clientWidth
				const isCurrentlyOverflowing = textScrollWidth > containerClientWidth

				if (!isCurrentlyOverflowing) {
					return
				}

				const timeoutId1 = setTimeout(() => {
					if (!textEl || !containerEl) return

					const scrollDistance = textEl.scrollWidth - containerEl.clientWidth
					if (scrollDistance <= 0) {
						resetTextAnimation()
						return
					}

					const scrollDurationS = scrollDistance / SCROLL_SPEED_PIXELS_PER_S

					containerEl.style.setProperty("--marquee-scroll-amount", `-${scrollDistance}px`)

					textEl.style.animationDuration = `${scrollDurationS}s`
					textEl.classList.add("marquee-text-animate")

					animationEndHandlerRef.current = () => {
						animationEndHandlerRef.current = null

						const timeoutId2 = setTimeout(() => {
							if (!textEl || !containerEl) return
							startAnimationCycle()
						}, PAUSE_DURATION_MS)
						animationTimeoutIds.current.push(timeoutId2)
					}
					textEl.addEventListener("animationend", animationEndHandlerRef.current)
				}, PAUSE_DURATION_MS)
				animationTimeoutIds.current.push(timeoutId1)
			}

			startAnimationCycle()
			window.addEventListener("resize", startAnimationCycle)

			return () => {
				clearAllTimeouts()
				if (textEl && animationEndHandlerRef.current) {
					textEl.removeEventListener("animationend", animationEndHandlerRef.current)
				}
				resetTextAnimation()
				window.removeEventListener("resize", startAnimationCycle)
			}
		}, [text])

		return (
			<div ref={containerRef} title={title} className="marquee-container">
				<span ref={textRef} className="marquee-text text-left">
					{text}
				</span>
			</div>
		)
	}

	// This is the content that will be shown when the bar is expanded.
	// It's defined as an inner component to keep the main component's return statement clean
	// and to encapsulate the detailed logic.
	const ExpandedContent: React.FC = () => {
		if (!modelId) {
			// This case should ideally be caught earlier, but as a safeguard:
			return (
				<div className="flex items-center justify-center text-vscode-descriptionForeground">
					<VSCodeBadge>
						<Trans>Profilinformationen nicht verfügbar (keine Modell-ID)</Trans>
					</VSCodeBadge>
				</div>
			)
		}

		if (!modelInfo) {
			// For providers where we expect to have model info, show a specific message.
			// For others, like OpenAI-compatible ones, it's expected not to have detailed info.
			if (
				!["openaicompatible", "azureopenai", "glama", "requesty", "openrouter", "litellm"].includes(
					selectedProvider,
				)
			) {
				return (
					<div className="flex items-center justify-center text-vscode-descriptionForeground">
						<VSCodeBadge>
							<Trans>Profilinformationen für dieses Modell nicht gefunden.</Trans>
						</VSCodeBadge>
					</div>
				)
			}
			// For compatible providers, just show the basic info.
			return (
				<div className="flex items-center justify-center gap-x-2 text-vscode-descriptionForeground">
					<span title="Provider">{providerDisplayName}</span>
					{modelId && <span className="opacity-50">|</span>}
					<span>
						<Trans>Weitere Profilinformationen nicht verfügbar.</Trans>
					</span>
				</div>
			)
		}

		return (
			// This is the original layout for the expanded info bar
			<div className="flex gap-x-2 items-center min-w-0 overflow-hidden text-[9px] h-full">
				{/* Column 1: Provider / Model */}
				<div className="flex flex-col gap-y-0 w-24 flex-shrink min-w-0">
					<MarqueeText text={providerDisplayName} title={t("chat:profile.provider")} />
					<MarqueeText text={modelId} title={t("chat:profile.model")} />
				</div>

				{/* Column 2: Tokens (Output / Context / Budget) */}
				{(maxOutputTokens !== undefined || contextWindow !== undefined || thinkingBudget !== undefined) && (
					<div className="flex items-center gap-x-1 flex-shrink min-w-0">
						{thinkingBudget !== undefined ? (
							<>
								<div className="flex flex-col gap-y-0">
									<EditableValue
										value={maxOutputTokens}
										title={`${t("chat:profile.maxOutput")}: ${maxOutputTokens} ${t(
											"chat:profile.tokens",
										)}`}
										onClick={() => setIsSettingsPopupOpen(true)}
										formatValue={formatTokenCount}
									/>
									<EditableValue
										value={thinkingBudget}
										title={`${t("chat:profile.thinkingBudget")}: ${thinkingBudget} ${t(
											"chat:profile.tokens",
										)}`}
										onClick={() => setIsSettingsPopupOpen(true)}
										formatValue={formatTokenCount}
									/>
								</div>
								<span
									title={`${t("chat:profile.contextSize")}: ${contextWindow} ${t(
										"chat:profile.tokens",
									)}`}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)}>
									{formatTokenCount(contextWindow)}
								</span>
							</>
						) : (
							<>
								<EditableValue
									value={maxOutputTokens}
									title={`${t("chat:profile.maxOutput")}: ${maxOutputTokens} ${t(
										"chat:profile.tokens",
									)}`}
									onClick={() => setIsSettingsPopupOpen(true)}
									formatValue={formatTokenCount}
								/>
								<span
									title={`${t("chat:profile.contextSize")}: ${contextWindow} ${t(
										"chat:profile.tokens",
									)}`}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)}>
									{formatTokenCount(contextWindow)}
								</span>
							</>
						)}
					</div>
				)}

				{/* Column 3: Input Price / Output Price */}
				{(inputPrice !== undefined || outputPrice !== undefined) && (
					<div className="flex flex-col gap-y-0 flex-shrink min-w-0">
						{inputPrice !== undefined ? (
							<span
								title={t("chat:profile.inputPricePer1M")}
								className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
								onClick={() => setIsSettingsPopupOpen(true)} // Open common settings popup
							>
								{formatPrice(inputPrice)}
							</span>
						) : (
							<PlaceholderSpan />
						)}
						{outputPrice !== undefined ? (
							<span
								title={t("chat:profile.outputPricePer1M")}
								className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
								onClick={() => setIsSettingsPopupOpen(true)} // Open common settings popup
							>
								{formatPrice(outputPrice)}
							</span>
						) : (
							<PlaceholderSpan />
						)}
					</div>
				)}

				{/* Column 4: Cache Prices */}
				{modelInfo?.supportsPromptCache &&
					(cacheWritesPrice !== undefined || cacheReadsPrice !== undefined) && (
						<div className="flex flex-col gap-y-0 flex-shrink min-w-0">
							{cacheWritesPrice !== undefined ? (
								<span
									title={t("chat:profile.cacheWritePricePer1M")}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)} // Open common settings popup
								>
									{formatPrice(cacheWritesPrice)}
								</span>
							) : (
								<PlaceholderSpan />
							)}
							{cacheReadsPrice !== undefined ? (
								<span
									title={t("chat:profile.cacheReadPricePer1M")}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)} // Open common settings popup
								>
									{formatPrice(cacheReadsPrice)}
								</span>
							) : (
								<PlaceholderSpan />
							)}
						</div>
					)}
			</div>
		)
	}

	// Initial check for modelId before rendering anything collapsible
	if (!modelId) {
		return (
			<div className="flex items-center justify-center p-1 text-xs text-vscode-descriptionForeground bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md">
				<VSCodeBadge>
					<Trans>Profilinformationen nicht verfügbar (keine Modell-ID)</Trans>
				</VSCodeBadge>
			</div>
		)
	}

	return (
		<div
			ref={profileInfoBarRef}
			aria-expanded={isExpanded}
			title={isExpanded ? t("chat:profile.collapseInfobar") : t("chat:profile.expandInfobar")}
			className={`
			             flex items-center px-1 py-0 text-xs h-6
			             bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md
			             transition-all duration-300 ease-in-out relative group text-vscode-descriptionForeground
			             hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)]
			             ${isExpanded ? "w-full" : "w-auto max-w-xs"}
			         `}>
			<span
				onClick={() => setIsExpanded(!isExpanded)} // Only chevron toggles expansion
				className={`chevron-button codicon ${
					isExpanded ? "codicon-chevron-left" : "codicon-chevron-right"
				} text-base flex-shrink-0 cursor-pointer`}
			/>

			{/* Common Settings Popover */}
			<Popover open={isSettingsPopupOpen} onOpenChange={setIsSettingsPopupOpen}>
				<PopoverTrigger asChild>
					{/* This trigger now wraps the main content of the info bar */}
					<div
						className={`
							flex-grow overflow-hidden
							transition-all duration-300 ease-in-out
							${isExpanded ? "ml-2 max-w-full opacity-100" : "ml-0 max-w-0 opacity-0"}
							cursor-pointer
						`}
						// onClick={() => setIsSettingsPopupOpen(true)} // Open common settings popup on click - Removed to prevent re-opening when already open
					>
						{isExpanded && <ExpandedContent />}
					</div>
				</PopoverTrigger>
				<PopoverContent ref={popoverContentRef} className="w-64 px-4 py-1">
					<div className="flex flex-col gap-1">
						<h3 className="text-sm font-semibold mt-0 mb-0">Model Settings</h3>

						{/* Provider Selection */}
						<div className="flex flex-col gap-1">
							<label htmlFor="provider-select" className="text-xs font-medium">
								{t("settings:providers.apiProvider")}
							</label>
							<VSCodeDropdown
								id="provider-select"
								value={localApiProvider}
								onChange={(e) => {
									const newProvider = (e.target as HTMLSelectElement).value as
										| ProviderName
										| RouterName
									const currentUnsavedSettings = {
										modelMaxTokens: localMaxOutputTokens,
										modelMaxThinkingTokens: localThinkingBudget,
										enableReasoningEffort: localEnableReasoning,
									}

									const newProviderModels = isRouterName(newProvider)
										? routerModels?.[newProvider]
										: modelSources[newProvider as ProviderName]

									// Get the last used model for the new provider from the new dedicated selections map
									const lastUsedModelId =
										localApiConfiguration?.providerModelSelections?.[newProvider]

									let newModelId: string | undefined

									if (
										typeof lastUsedModelId === "string" &&
										newProviderModels &&
										Object.prototype.hasOwnProperty.call(newProviderModels, lastUsedModelId)
									) {
										newModelId = lastUsedModelId
									} else if (newProviderModels && typeof newProviderModels === "object") {
										const modelEntries = Object.entries(newProviderModels)
										if (modelEntries.length > 0) {
											newModelId = modelEntries[0][0]
										}
									}

									let modelInfo: ModelInfo | undefined
									if (
										newModelId &&
										newProviderModels &&
										Object.prototype.hasOwnProperty.call(newProviderModels, newModelId)
									) {
										modelInfo = (newProviderModels as Record<string, ModelInfo>)[newModelId]
									}

									let newMaxOutputTokens: number | undefined
									let newThinkingBudget: number | undefined
									let newEnableReasoning: boolean | undefined

									if (modelInfo && newModelId) {
										const modelSettingsKey = getModelSettingsKey(newProvider, newModelId)
										const savedModelSettings = apiConfiguration?.modelSettings?.[modelSettingsKey]
										newMaxOutputTokens =
											savedModelSettings?.modelMaxTokens ??
											getModelMaxOutputTokens({
												modelId: newModelId,
												model: modelInfo,
												settings: {
													...apiConfiguration,
													modelMaxTokens: undefined,
												} as ProviderSettings,
											})
										newThinkingBudget =
											savedModelSettings?.modelMaxThinkingTokens ??
											DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS
										newEnableReasoning =
											savedModelSettings?.enableReasoningEffort ??
											!!modelInfo.supportsReasoningBudget
									} else {
										newMaxOutputTokens = undefined
										newThinkingBudget = DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS
										newEnableReasoning = false
									}

									setLocalApiConfiguration((prevState) => {
										if (!prevState || !localSelectedModelId || !localApiProvider) return undefined
										const oldModelSettingsKey = getModelSettingsKey(
											localApiProvider,
											localSelectedModelId,
										)

										return {
											...prevState,
											apiProvider: newProvider,
											apiModelId: newModelId, // Keep legacy field in sync
											providerModelSelections: {
												...prevState.providerModelSelections,
												[newProvider]: newModelId,
											},
											modelSettings: {
												...prevState.modelSettings,
												[oldModelSettingsKey]: currentUnsavedSettings,
											},
											modelMaxTokens: newMaxOutputTokens,
											modelMaxThinkingTokens: newThinkingBudget,
											enableReasoningEffort: newEnableReasoning,
										}
									})
									setHasChanges(true)
								}}>
								{PROVIDERS.map((provider) => (
									<VSCodeOption key={provider.value} value={provider.value}>
										{provider.label}
									</VSCodeOption>
								))}
							</VSCodeDropdown>
						</div>

						{/* Dynamic Model Info based on local states for popup display */}
						{(() => {
							const popupModelId = localSelectedModelId
							let popupModelInfo: ModelInfo | undefined
							let popupModelSource: Record<string, ModelInfo> | undefined | ModelInfo = undefined

							if (localApiProvider && isRouterName(localApiProvider)) {
								popupModelSource = routerModels?.[localApiProvider]
							} else if (localApiProvider) {
								popupModelSource = modelSources[localApiProvider as ProviderName]
							}

							if (localApiProvider === "ollama") {
								popupModelSource = ollamaModels.reduce(
									(acc, model) => {
										acc[model] = {
											contextWindow: 8192, // Default value
											supportsPromptCache: false,
											supportsImages: true,
											supportsReasoningBudget: false,
											maxTokens: 4096, // Default value
										}
										return acc
									},
									{} as Record<string, ModelInfo>,
								)
							} else if (popupModelSource && popupModelId && popupModelId in popupModelSource) {
								popupModelInfo = (popupModelSource as Record<string, ModelInfo>)[popupModelId]
							}

							const popupMaxOutputTokens =
								popupModelInfo && popupModelId
									? getModelMaxOutputTokens({
											modelId: popupModelId,
											model: popupModelInfo,
											settings: {
												...apiConfiguration,
												apiProvider: localApiProvider,
												apiModelId: localSelectedModelId,
											} as ProviderSettings,
										})
									: undefined
							const popupContextWindow = popupModelInfo?.contextWindow
							const popupInputPrice = popupModelInfo?.inputPrice
							const popupOutputPrice = popupModelInfo?.outputPrice
							const popupCacheWritesPrice = popupModelInfo?.cacheWritesPrice
							const popupCacheReadsPrice = popupModelInfo?.cacheReadsPrice

							const customMaxOutputTokens = localMaxOutputTokens ?? popupMaxOutputTokens ?? 0
							const maxForOutputSlider = Math.max(
								popupModelInfo?.maxTokens || 8192,
								customMaxOutputTokens,
								DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS,
							)
							const maxForThinkingSlider = popupModelInfo?.maxThinkingTokens
								? Math.min(popupModelInfo.maxThinkingTokens, Math.floor(0.8 * customMaxOutputTokens))
								: Math.floor(0.8 * customMaxOutputTokens)

							return (
								<>
									{/* Model Selection */}
									{popupModelSource &&
										typeof popupModelSource === "object" &&
										!("contextWindow" in popupModelSource) && (
											<div className="flex flex-col gap-1">
												<label htmlFor="model-select" className="text-xs font-medium">
													{t("settings:providers.model")}
												</label>
												<VSCodeDropdown
													id="model-select"
													value={localSelectedModelId ?? ""}
													onChange={(e) => {
														const newModelId = (e.target as HTMLSelectElement).value
														const currentUnsavedSettings = {
															modelMaxTokens: localMaxOutputTokens,
															modelMaxThinkingTokens: localThinkingBudget,
															enableReasoningEffort: localEnableReasoning,
														}

														let modelInfo: ModelInfo | undefined
														if (
															popupModelSource &&
															Object.prototype.hasOwnProperty.call(
																popupModelSource,
																newModelId,
															)
														) {
															modelInfo = (popupModelSource as Record<string, ModelInfo>)[
																newModelId
															]
														}

														let newMaxOutputTokens = localMaxOutputTokens
														let newThinkingBudget = localThinkingBudget
														let newEnableReasoning = localEnableReasoning

														if (modelInfo) {
															const modelSettingsKey = getModelSettingsKey(
																localApiProvider as ProviderName,
																newModelId,
															)
															const savedModelSettings =
																apiConfiguration?.modelSettings?.[modelSettingsKey]
															newMaxOutputTokens =
																savedModelSettings?.modelMaxTokens ??
																getModelMaxOutputTokens({
																	modelId: newModelId,
																	model: modelInfo,
																	settings: {
																		...apiConfiguration,
																		modelMaxTokens: undefined,
																	} as ProviderSettings,
																})
															newThinkingBudget =
																savedModelSettings?.modelMaxThinkingTokens ??
																DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS
															newEnableReasoning =
																savedModelSettings?.enableReasoningEffort ??
																!!modelInfo.supportsReasoningBudget
														}

														setLocalApiConfiguration((prevState) => {
															if (
																!prevState ||
																!localApiProvider ||
																!localSelectedModelId
															)
																return undefined
															const oldModelSettingsKey = getModelSettingsKey(
																localApiProvider,
																localSelectedModelId,
															)

															return {
																...prevState,
																apiModelId: newModelId, // Keep legacy field in sync
																providerModelSelections: {
																	...prevState.providerModelSelections,
																	[localApiProvider]: newModelId,
																},
																modelSettings: {
																	...prevState.modelSettings,
																	[oldModelSettingsKey]: currentUnsavedSettings,
																},
																modelMaxTokens: newMaxOutputTokens,
																modelMaxThinkingTokens: newThinkingBudget,
																enableReasoningEffort: newEnableReasoning,
															}
														})
														setHasChanges(true)
													}}>
													{Object.entries(popupModelSource as Record<string, ModelInfo>).map(
														([id, info]) => (
															<VSCodeOption key={id} value={id} title={info.description}>
																{id}
															</VSCodeOption>
														),
													)}
												</VSCodeDropdown>
											</div>
										)}

									{popupModelId && popupModelInfo && (
										<>
											{/* Enable Reasoning Checkbox */}
											{popupModelInfo.supportsReasoningBudget &&
												!popupModelInfo.requiredReasoningBudget && (
													<VSCodeCheckbox
														checked={localEnableReasoning}
														onChange={(e) => {
															const isEnabled = (e.target as HTMLInputElement).checked
															setLocalApiConfigurationField(
																"enableReasoningEffort",
																isEnabled,
															)

															if (!isEnabled && popupModelInfo) {
																// If reasoning is disabled, reset the token values to their non-reasoning defaults.
																const defaultMaxOutput = getModelMaxOutputTokens({
																	modelId: popupModelId,
																	model: popupModelInfo,
																	settings: {
																		...localApiConfiguration,
																		enableReasoningEffort: false,
																	} as ProviderSettings,
																})
																setLocalApiConfigurationField(
																	"modelMaxTokens",
																	defaultMaxOutput,
																)
																setLocalApiConfigurationField(
																	"modelMaxThinkingTokens",
																	DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
																)
															}
															setHasChanges(true)
														}}>
														{t("chat:profile.enableReasoning")}
													</VSCodeCheckbox>
												)}

											{/* Sliders, visible only if reasoning is enabled */}
											{localEnableReasoning && (
												<>
													{/* Max Output Tokens Slider */}
													{(popupModelInfo?.supportsReasoningBudget ||
														popupModelInfo?.requiredReasoningBudget) && (
														<div className="flex flex-col gap-1">
															<div className="flex justify-between items-center text-xs font-medium">
																<span>{t("chat:profile.maxOutput")}</span>
																<span>
																	{localMaxOutputTokens ?? popupMaxOutputTokens ?? 0}
																</span>
															</div>
															<Slider
																value={[
																	localMaxOutputTokens ?? popupMaxOutputTokens ?? 0,
																]}
																min={8192}
																max={maxForOutputSlider}
																step={1024}
																onValueChange={([newValue]) => {
																	setLocalApiConfigurationField(
																		"modelMaxTokens",
																		newValue,
																	)
																	setHasChanges(true) // Mark as changed
																}}
															/>
														</div>
													)}

													{/* Thinking Budget Slider */}
													{popupModelInfo.supportsReasoningBudget && (
														<div className="flex flex-col gap-1">
															<div className="flex justify-between items-center text-xs font-medium">
																<span>{t("chat:profile.thinkingBudget")}</span>
																<span>
																	{localThinkingBudget ??
																		DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS}
																</span>
															</div>
															<Slider
																value={[
																	localThinkingBudget ??
																		DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
																]}
																min={1024}
																max={maxForThinkingSlider}
																step={1024}
																onValueChange={([newValue]) => {
																	setLocalApiConfigurationField(
																		"modelMaxThinkingTokens",
																		newValue,
																	)
																	setHasChanges(true) // Mark as changed
																}}
															/>
														</div>
													)}
												</>
											)}

											{/* Other non-editable info */}
											<div className="grid grid-cols-2 gap-2 text-xs">
												<div>{t("chat:profile.contextSize")}:</div>
												<div className="text-right">{formatTokenCount(popupContextWindow)}</div>

												{popupInputPrice !== undefined && (
													<>
														<div>{t("chat:profile.inputPricePer1M")}:</div>
														<div className="text-right">{formatPrice(popupInputPrice)}</div>
													</>
												)}
												{popupOutputPrice !== undefined && (
													<>
														<div>{t("chat:profile.outputPricePer1M")}:</div>
														<div className="text-right">
															{formatPrice(popupOutputPrice)}
														</div>
													</>
												)}
												{popupModelInfo.supportsPromptCache && (
													<>
														{popupCacheWritesPrice !== undefined && (
															<>
																<div>{t("chat:profile.cacheWritePricePer1M")}:</div>
																<div className="text-right">
																	{formatPrice(popupCacheWritesPrice)}
																</div>
															</>
														)}
														{popupCacheReadsPrice !== undefined && (
															<>
																<div>{t("chat:profile.cacheReadPricePer1M")}:</div>
																<div className="text-right">
																	{formatPrice(popupCacheReadsPrice)}
																</div>
															</>
														)}
													</>
												)}
											</div>
										</>
									)}
								</>
							)
						})()}
						<div className="flex justify-end gap-2 mt-1">
							<Button
								onClick={handleCloseSettings}
								className="bg-transparent hover:bg-vscode-list-hoverBackground">
								Close
							</Button>
							<Button onClick={handleSaveSettings} disabled={!hasChanges}>
								Save
							</Button>
						</div>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	)
}
