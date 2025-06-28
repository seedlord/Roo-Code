import React, { useCallback, useEffect, useRef, useState } from "react"
import { useEvent } from "react-use"
import { useExtensionState, ExtensionStateContextType } from "../../context/ExtensionStateContext"
import { PROVIDERS } from "../settings/constants"
import { ModelInfo, ProviderName, ProviderSettings, ModelSpecificSettings } from "@roo-code/types"
import {
	anthropicModels,
	bedrockModels,
	deepSeekModels,
	groqModels,
	chutesModels,
	openAiNativeModels,
	geminiModels,
	vertexModels,
	vscodeLlmModels,
	xaiModels,
	ollamaModels as ollamaModelInfo,
} from "@roo-code/types"
import {
	DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS,
	DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
	isRouterName,
	RouterName,
} from "@roo/api"
import { VSCodeBadge, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { Trans, useTranslation } from "react-i18next"
import { EditableValue } from "./EditableValue"
import { Button, Popover, PopoverContent, PopoverTrigger } from "../ui"
import { formatPrice } from "@/utils/formatPrice"
import { vscode } from "@/utils/vscode"
import { useSelectedModel } from "../ui/hooks/useSelectedModel"
import { ThinkingBudget } from "../settings/ThinkingBudget"
import { getModelSettingsKey } from "../../utils/settings"

const modelSources: Partial<Record<ProviderName, Record<string, ModelInfo> | ModelInfo>> = {
	anthropic: anthropicModels,
	bedrock: bedrockModels,
	deepseek: deepSeekModels,
	groq: groqModels,
	chutes: chutesModels,
	openai: openAiNativeModels,
	gemini: geminiModels,
	vertex: vertexModels,
	"vscode-lm": vscodeLlmModels,
	xai: xaiModels,
	ollama: ollamaModelInfo,
}

const formatTokenCount = (tokens: number | undefined | null) => {
	if (tokens === undefined || tokens === null) return "N/A"
	const K_DIVISOR = 1000
	const M_DIVISOR = K_DIVISOR * K_DIVISOR
	if (tokens >= M_DIVISOR) return `${Math.round(tokens / M_DIVISOR)}M`
	if (tokens >= K_DIVISOR) return `${Math.round(tokens / K_DIVISOR)}K`
	return tokens.toString()
}

type SettingsPopupContentProps = {
	localApiConfiguration: ProviderSettings | undefined
	setLocalApiConfiguration: React.Dispatch<React.SetStateAction<ProviderSettings | undefined>>
	hasChanges: boolean
	setHasChanges: React.Dispatch<React.SetStateAction<boolean>>
	handleSaveSettings: () => void
	handleCloseSettings: () => void
	ollamaModels: string[]
	routerModels: ExtensionStateContextType["routerModels"]
	apiConfiguration: ProviderSettings | undefined
	currentApiConfigName: string | undefined
}

const SettingsPopupContent: React.FC<SettingsPopupContentProps> = ({
	localApiConfiguration,
	setLocalApiConfiguration,
	hasChanges,
	setHasChanges,
	handleSaveSettings,
	handleCloseSettings,
	ollamaModels,
	routerModels,
	apiConfiguration,
}) => {
	const { t } = useTranslation()
	const { apiProvider: localProvider, apiModelId: localModelId } = localApiConfiguration ?? {}

	const { info: localModelInfo } = useSelectedModel(localApiConfiguration)

	const setModelSettingsFields = useCallback(
		(updates: Partial<ModelSpecificSettings>) => {
			const modelSettingsKey = getModelSettingsKey(localProvider, localModelId)
			if (!modelSettingsKey) return

			setLocalApiConfiguration((prevState) => {
				if (!prevState) return prevState
				const newModelSettings = {
					...(prevState.modelSettings ?? {}),
					[modelSettingsKey]: {
						...(prevState.modelSettings?.[modelSettingsKey] ?? {}),
						...updates,
					},
				}
				setHasChanges(true)
				return { ...prevState, modelSettings: newModelSettings }
			})
		},
		[localProvider, localModelId, setLocalApiConfiguration, setHasChanges],
	)

	const handleProviderChange = (e: any) => {
		const newProvider = e.target.value as ProviderName | RouterName

		let newModelId: string | undefined
		const newProviderModels = isRouterName(newProvider)
			? routerModels?.[newProvider]
			: modelSources[newProvider as ProviderName]

		if (newProviderModels && typeof newProviderModels === "object") {
			const modelEntries = Object.entries(newProviderModels)
			if (modelEntries.length > 0) {
				const savedModelForProvider = apiConfiguration?.apiModelId
				const isSavedModelAvailable =
					savedModelForProvider && modelEntries.some(([id]) => id === savedModelForProvider)

				if (isSavedModelAvailable) {
					newModelId = savedModelForProvider
				} else {
					newModelId = modelEntries[0][0]
				}
			}
		}

		setLocalApiConfiguration((prevState) => {
			const updatedConfig = {
				...prevState,
				apiProvider: newProvider,
				apiModelId: newModelId,
			}
			setHasChanges(true)
			return updatedConfig
		})
	}

	const handleModelChange = (e: any) => {
		const newModelId = e.target.value
		setLocalApiConfiguration((prevState) => {
			const updatedConfig = {
				...prevState,
				apiModelId: newModelId,
			}
			setHasChanges(true)
			return updatedConfig
		})
	}

	return (
		<div className="flex flex-col gap-1">
			<h3 className="text-sm font-semibold mt-0 mb-0">Model Settings</h3>
			<div className="flex flex-col gap-1">
				<label htmlFor="provider-select" className="text-xs font-medium">
					{t("settings:providers.apiProvider")}
				</label>
				<VSCodeDropdown id="provider-select" value={localProvider} onChange={handleProviderChange}>
					{PROVIDERS.map((p) => (
						<VSCodeOption key={p.value} value={p.value}>
							{p.label}
						</VSCodeOption>
					))}
				</VSCodeDropdown>
			</div>
			{localProvider && (
				<div className="flex flex-col gap-1">
					<label htmlFor="model-select" className="text-xs font-medium">
						{t("settings:providers.model")}
					</label>
					<VSCodeDropdown id="model-select" value={localModelId} onChange={handleModelChange}>
						{localProvider === "ollama"
							? ollamaModels.map((id) => (
									<VSCodeOption key={id} value={id}>
										{id}
									</VSCodeOption>
								))
							: Object.entries(
									(isRouterName(localProvider)
										? routerModels?.[localProvider]
										: modelSources[localProvider as ProviderName]) ?? {},
								).map(([id, info]) => (
									<VSCodeOption key={id} value={id} title={info.description}>
										{id}
									</VSCodeOption>
								))}
					</VSCodeDropdown>
				</div>
			)}
			{localModelInfo && (
				<>
					<ThinkingBudget
						apiProvider={localProvider}
						apiModelId={localModelId}
						modelSettings={
							localApiConfiguration?.modelSettings?.[
								getModelSettingsKey(localProvider, localModelId) ?? ""
							]
						}
						setModelSettingsFields={setModelSettingsFields}
						modelInfo={localModelInfo}
					/>
					<div className="grid grid-cols-2 gap-2 text-xs">
						<div>{t("chat:profile.contextSize")}:</div>
						<div className="text-right">{formatTokenCount(localModelInfo.contextWindow)}</div>

						{localModelInfo.inputPrice !== undefined && (
							<>
								<div>{t("chat:profile.inputPricePer1M")}:</div>
								<div className="text-right">{formatPrice(localModelInfo.inputPrice)}</div>
							</>
						)}
						{localModelInfo.outputPrice !== undefined && (
							<>
								<div>{t("chat:profile.outputPricePer1M")}:</div>
								<div className="text-right">{formatPrice(localModelInfo.outputPrice)}</div>
							</>
						)}
						{localModelInfo.supportsPromptCache && (
							<>
								{localModelInfo.cacheWritesPrice !== undefined && (
									<>
										<div>{t("chat:profile.cacheWritePricePer1M")}:</div>
										<div className="text-right">{formatPrice(localModelInfo.cacheWritesPrice)}</div>
									</>
								)}
								{localModelInfo.cacheReadsPrice !== undefined && (
									<>
										<div>{t("chat:profile.cacheReadPricePer1M")}:</div>
										<div className="text-right">{formatPrice(localModelInfo.cacheReadsPrice)}</div>
									</>
								)}
							</>
						)}
					</div>
				</>
			)}
			<div className="flex justify-end gap-2 mt-1">
				<Button onClick={handleCloseSettings} className="bg-transparent hover:bg-vscode-list-hoverBackground">
					Close
				</Button>
				<Button onClick={handleSaveSettings} disabled={!hasChanges}>
					Save
				</Button>
			</div>
		</div>
	)
}

export const ProfileInfoBar: React.FC = () => {
	const [isExpanded, setIsExpanded] = useState(true)
	const [isSettingsPopupOpen, setIsSettingsPopupOpen] = useState(false)
	const [hasChanges, setHasChanges] = useState(false)
	const { t } = useTranslation()
	const [ollamaModels, setOllamaModels] = useState<string[]>([])
	const {
		apiConfiguration,
		currentApiConfigName,
		isAwaitingConfigurationUpdate,
		setIsAwaitingConfigurationUpdate,
		routerModels,
	} = useExtensionState()
	const {
		id: selectedModelId,
		info: selectedModelInfo,
		provider: selectedProvider,
	} = useSelectedModel(apiConfiguration)

	const profileInfoBarRef = useRef<HTMLDivElement>(null)
	const popoverContentRef = useRef<HTMLDivElement>(null)

	const [localApiConfiguration, setLocalApiConfiguration] = useState<ProviderSettings | undefined>(apiConfiguration)

	useEffect(() => {
		setLocalApiConfiguration(apiConfiguration)
		setHasChanges(false)
	}, [apiConfiguration])

	useEffect(() => {
		if (apiConfiguration?.apiProvider === "ollama") {
			vscode.postMessage({ type: "requestOllamaModels" })
		}
	}, [apiConfiguration?.apiProvider])

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
		if (!localApiConfiguration) return

		setIsAwaitingConfigurationUpdate(true)
		vscode.postMessage({
			type: "upsertApiConfiguration",
			text: currentApiConfigName,
			apiConfiguration: localApiConfiguration,
		})
		setHasChanges(false)
	}, [localApiConfiguration, currentApiConfigName, setIsAwaitingConfigurationUpdate])

	const handleCloseSettings = useCallback(() => {
		setLocalApiConfiguration(apiConfiguration)
		setIsSettingsPopupOpen(false)
		setHasChanges(false)
	}, [apiConfiguration])

	useEffect(() => {
		if (!isSettingsPopupOpen) return

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

	if (!apiConfiguration || isAwaitingConfigurationUpdate) {
		return (
			<div className="flex items-center px-1 py-0 text-xs h-6 bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md">
				<span className="codicon codicon-loading animate-spin" />
			</div>
		)
	}

	const providerDisplayName = PROVIDERS.find((p) => p.value === selectedProvider)?.label || selectedProvider

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

				const isCurrentlyOverflowing = textEl.scrollWidth > containerEl.clientWidth
				if (!isCurrentlyOverflowing) return

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

	const ExpandedContent: React.FC = () => {
		const modelSettingsKey = getModelSettingsKey(selectedProvider, selectedModelId)
		const modelSettings = modelSettingsKey ? apiConfiguration?.modelSettings?.[modelSettingsKey] : undefined
		const isReasoningBudgetSupported = !!selectedModelInfo?.supportsReasoningBudget
		const enableReasoningEffort = modelSettings?.enableReasoningEffort ?? isReasoningBudgetSupported

		const maxOutputTokens =
			modelSettings?.modelMaxTokens ??
			(isReasoningBudgetSupported ? DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS : undefined)
		const thinkingBudget =
			modelSettings?.modelMaxThinkingTokens ??
			(isReasoningBudgetSupported ? DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS : undefined)

		if (!selectedModelId) {
			return (
				<VSCodeBadge>
					<Trans>Profilinformationen nicht verfügbar (keine Modell-ID)</Trans>
				</VSCodeBadge>
			)
		}
		if (!selectedModelInfo) {
			return (
				<VSCodeBadge>
					<Trans>Profilinformationen für dieses Modell nicht gefunden.</Trans>
				</VSCodeBadge>
			)
		}

		const inputPrice = selectedModelInfo?.inputPrice
		const outputPrice = selectedModelInfo?.outputPrice
		const cacheWritesPrice = selectedModelInfo?.cacheWritesPrice
		const cacheReadsPrice = selectedModelInfo?.cacheReadsPrice

		return (
			<div className="flex gap-x-2 items-center min-w-0 overflow-hidden text-[9px] h-full">
				<div className="flex flex-col gap-y-0 w-24 flex-shrink min-w-0">
					<MarqueeText text={providerDisplayName} title={t("chat:profile.provider")} />
					<MarqueeText text={selectedModelId} title={t("chat:profile.model")} />
				</div>
				{(maxOutputTokens !== undefined ||
					selectedModelInfo.contextWindow !== undefined ||
					thinkingBudget !== undefined) && (
					<div className="flex items-center gap-x-1 flex-shrink min-w-0">
						{selectedModelInfo.supportsReasoningBudget &&
						(selectedModelInfo.requiredReasoningBudget || enableReasoningEffort) ? (
							<>
								<div className="flex flex-col gap-y-0">
									<EditableValue
										value={maxOutputTokens}
										title={`${t("chat:profile.maxOutput")}: ${maxOutputTokens} ${t("chat:profile.tokens")}`}
										onClick={() => setIsSettingsPopupOpen(true)}
										formatValue={formatTokenCount}
									/>
									<EditableValue
										value={thinkingBudget}
										title={`${t("chat:profile.thinkingBudget")}: ${thinkingBudget} ${t("chat:profile.tokens")}`}
										onClick={() => setIsSettingsPopupOpen(true)}
										formatValue={formatTokenCount}
									/>
								</div>
								<span
									title={`${t("chat:profile.contextSize")}: ${selectedModelInfo.contextWindow} ${t("chat:profile.tokens")}`}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)}>
									{formatTokenCount(selectedModelInfo.contextWindow)}
								</span>
							</>
						) : (
							<>
								<EditableValue
									value={maxOutputTokens}
									title={`${t("chat:profile.maxOutput")}: ${maxOutputTokens} ${t("chat:profile.tokens")}`}
									onClick={() => setIsSettingsPopupOpen(true)}
									formatValue={formatTokenCount}
								/>
								<span
									title={`${t("chat:profile.contextSize")}: ${selectedModelInfo.contextWindow} ${t("chat:profile.tokens")}`}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)}>
									{formatTokenCount(selectedModelInfo.contextWindow)}
								</span>
							</>
						)}
					</div>
				)}
				{(inputPrice !== undefined || outputPrice !== undefined) && (
					<div className="flex flex-col gap-y-0 flex-shrink min-w-0">
						{inputPrice !== undefined ? (
							<span
								title={t("chat:profile.inputPricePer1M")}
								className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
								onClick={() => setIsSettingsPopupOpen(true)}>
								{formatPrice(inputPrice)}
							</span>
						) : (
							<span className="block invisible">&nbsp;</span>
						)}
						{outputPrice !== undefined ? (
							<span
								title={t("chat:profile.outputPricePer1M")}
								className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
								onClick={() => setIsSettingsPopupOpen(true)}>
								{formatPrice(outputPrice)}
							</span>
						) : (
							<span className="block invisible">&nbsp;</span>
						)}
					</div>
				)}
				{selectedModelInfo?.supportsPromptCache &&
					(cacheWritesPrice !== undefined || cacheReadsPrice !== undefined) && (
						<div className="flex flex-col gap-y-0 flex-shrink min-w-0">
							{cacheWritesPrice !== undefined ? (
								<span
									title={t("chat:profile.cacheWritePricePer1M")}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)}>
									{formatPrice(cacheWritesPrice)}
								</span>
							) : (
								<span className="block invisible">&nbsp;</span>
							)}
							{cacheReadsPrice !== undefined ? (
								<span
									title={t("chat:profile.cacheReadPricePer1M")}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)}>
									{formatPrice(cacheReadsPrice)}
								</span>
							) : (
								<span className="block invisible">&nbsp;</span>
							)}
						</div>
					)}
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
				onClick={() => setIsExpanded(!isExpanded)}
				className={`chevron-button codicon ${
					isExpanded ? "codicon-chevron-left" : "codicon-chevron-right"
				} text-base flex-shrink-0 cursor-pointer`}
			/>

			<Popover open={isSettingsPopupOpen} onOpenChange={setIsSettingsPopupOpen}>
				<PopoverTrigger asChild>
					<div
						className={`
							flex-grow overflow-hidden
							transition-all duration-300 ease-in-out
							${isExpanded ? "ml-2 max-w-full opacity-100" : "ml-0 max-w-0 opacity-0"}
							cursor-pointer
						`}
						onClick={() => setIsSettingsPopupOpen(true)}>
						{isExpanded && <ExpandedContent />}
					</div>
				</PopoverTrigger>
				<PopoverContent ref={popoverContentRef} className="w-64 px-4 py-1">
					{isSettingsPopupOpen && (
						<SettingsPopupContent
							localApiConfiguration={localApiConfiguration}
							setLocalApiConfiguration={setLocalApiConfiguration}
							hasChanges={hasChanges}
							setHasChanges={setHasChanges}
							handleSaveSettings={handleSaveSettings}
							handleCloseSettings={handleCloseSettings}
							ollamaModels={ollamaModels}
							routerModels={routerModels}
							apiConfiguration={apiConfiguration}
							currentApiConfigName={currentApiConfigName}
						/>
					)}
				</PopoverContent>
			</Popover>
		</div>
	)
}
