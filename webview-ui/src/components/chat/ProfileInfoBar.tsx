import React, { useEffect, useRef, useState } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { PROVIDERS } from "../settings/constants"
import { DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS, getModelMaxOutputTokens } from "@roo/api"
import { VSCodeBadge } from "@vscode/webview-ui-toolkit/react"
import { Trans, useTranslation } from "react-i18next"
import { EditableValue } from "./EditableValue"
import { Popover, PopoverContent, PopoverTrigger } from "../ui"
import { useSelectedModel } from "../ui/hooks/useSelectedModel"
import { getModelSettingsKey } from "./hooks/useModelSettings"
import { ModelSettingsPopup } from "./ModelSettingsPopup"
import { formatPrice } from "@/utils/formatPrice"

export const ProfileInfoBar: React.FC = () => {
	const [isExpanded, setIsExpanded] = useState(true)
	const [isSettingsPopupOpen, setIsSettingsPopupOpen] = useState(false)
	const { t } = useTranslation()
	const { apiConfiguration } = useExtensionState()
	const {
		id: selectedModelId,
		info: selectedModelInfo,
		provider: selectedProvider,
	} = useSelectedModel(apiConfiguration)

	const profileInfoBarRef = useRef<HTMLDivElement>(null)
	const popoverContentRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!isSettingsPopupOpen) return
		const handleClickOutside = (event: MouseEvent) => {
			if (
				profileInfoBarRef.current &&
				!profileInfoBarRef.current.contains(event.target as Node) &&
				popoverContentRef.current &&
				!popoverContentRef.current.contains(event.target as Node)
			) {
				setIsSettingsPopupOpen(false)
			}
		}
		document.addEventListener("mousedown", handleClickOutside, true)
		return () => document.removeEventListener("mousedown", handleClickOutside, true)
	}, [isSettingsPopupOpen])

	if (!apiConfiguration || !apiConfiguration.apiProvider) {
		return null
	}

	const providerDisplayName = PROVIDERS.find((p) => p.value === selectedProvider)?.label || selectedProvider
	const modelId = selectedModelId
	const modelInfo = selectedModelInfo
	const modelSettings =
		modelId && selectedProvider
			? apiConfiguration.modelSettings?.[getModelSettingsKey(selectedProvider, modelId)]
			: undefined

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

	const formatTokenCount = (tokens: number | undefined | null) => {
		if (tokens === undefined || tokens === null) return "N/A"
		const K_DIVISOR = 1000
		const M_DIVISOR = K_DIVISOR * K_DIVISOR
		if (tokens >= M_DIVISOR) return `${Math.round(tokens / M_DIVISOR)}M`
		if (tokens >= K_DIVISOR) return `${Math.round(tokens / K_DIVISOR)}K`
		return tokens.toString()
	}

	const PlaceholderSpan: React.FC = () => <span className="block invisible">&nbsp;</span>

	const MarqueeText: React.FC<{ text: string; title: string }> = ({ text, title }) => {
		const textRef = useRef<HTMLSpanElement>(null)
		const containerRef = useRef<HTMLDivElement>(null)
		useEffect(() => {
			const PAUSE_DURATION_MS = 1500
			const SCROLL_SPEED_PIXELS_PER_S = 50
			const textEl = textRef.current
			const containerEl = containerRef.current
			let animationTimeoutIds: NodeJS.Timeout[] = []
			let animationEndHandler: (() => void) | null = null

			const clearAllTimeouts = () => {
				animationTimeoutIds.forEach(clearTimeout)
				animationTimeoutIds = []
			}
			const resetTextAnimation = () => {
				if (textEl) {
					if (animationEndHandler) textEl.removeEventListener("animationend", animationEndHandler)
					textEl.classList.remove("marquee-text-animate")
					textEl.style.transform = "translateX(0%)"
					textEl.style.animationDuration = ""
				}
			}
			const startAnimationCycle = () => {
				if (!textEl || !containerEl) return
				clearAllTimeouts()
				resetTextAnimation()
				if (textEl.scrollWidth <= containerEl.clientWidth) return

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
					animationEndHandler = () => {
						const timeoutId2 = setTimeout(startAnimationCycle, PAUSE_DURATION_MS)
						animationTimeoutIds.push(timeoutId2)
					}
					textEl.addEventListener("animationend", animationEndHandler, { once: true })
				}, PAUSE_DURATION_MS)
				animationTimeoutIds.push(timeoutId1)
			}
			startAnimationCycle()
			window.addEventListener("resize", startAnimationCycle)
			return () => {
				clearAllTimeouts()
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
		if (!modelId) {
			return (
				<div className="flex items-center justify-center text-vscode-descriptionForeground">
					<VSCodeBadge>
						<Trans>Profilinformationen nicht verfügbar (keine Modell-ID)</Trans>
					</VSCodeBadge>
				</div>
			)
		}
		if (!modelInfo) {
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
			<div className="flex gap-x-2 items-center min-w-0 overflow-hidden text-[9px] h-full">
				<div className="flex flex-col gap-y-0 w-24 flex-shrink min-w-0">
					<MarqueeText text={providerDisplayName} title={t("chat:profile.provider")} />
					<MarqueeText text={modelId} title={t("chat:profile.model")} />
				</div>
				{(maxOutputTokens !== undefined ||
					modelInfo.contextWindow !== undefined ||
					thinkingBudget !== undefined) && (
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
									title={`${t("chat:profile.contextSize")}: ${modelInfo.contextWindow} ${t(
										"chat:profile.tokens",
									)}`}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)}>
									{formatTokenCount(modelInfo.contextWindow)}
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
									title={`${t("chat:profile.contextSize")}: ${modelInfo.contextWindow} ${t(
										"chat:profile.tokens",
									)}`}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)}>
									{formatTokenCount(modelInfo.contextWindow)}
								</span>
							</>
						)}
					</div>
				)}
				{(modelInfo.inputPrice !== undefined || modelInfo.outputPrice !== undefined) && (
					<div className="flex flex-col gap-y-0 flex-shrink min-w-0">
						{modelInfo.inputPrice !== undefined ? (
							<span
								title={t("chat:profile.inputPricePer1M")}
								className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
								onClick={() => setIsSettingsPopupOpen(true)}>
								{formatPrice(modelInfo.inputPrice)}
							</span>
						) : (
							<PlaceholderSpan />
						)}
						{modelInfo.outputPrice !== undefined ? (
							<span
								title={t("chat:profile.outputPricePer1M")}
								className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
								onClick={() => setIsSettingsPopupOpen(true)}>
								{formatPrice(modelInfo.outputPrice)}
							</span>
						) : (
							<PlaceholderSpan />
						)}
					</div>
				)}
				{modelInfo.supportsPromptCache &&
					(modelInfo.cacheWritesPrice !== undefined || modelInfo.cacheReadsPrice !== undefined) && (
						<div className="flex flex-col gap-y-0 flex-shrink min-w-0">
							{modelInfo.cacheWritesPrice !== undefined ? (
								<span
									title={t("chat:profile.cacheWritePricePer1M")}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)}>
									{formatPrice(modelInfo.cacheWritesPrice)}
								</span>
							) : (
								<PlaceholderSpan />
							)}
							{modelInfo.cacheReadsPrice !== undefined ? (
								<span
									title={t("chat:profile.cacheReadPricePer1M")}
									className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
									onClick={() => setIsSettingsPopupOpen(true)}>
									{formatPrice(modelInfo.cacheReadsPrice)}
								</span>
							) : (
								<PlaceholderSpan />
							)}
						</div>
					)}
			</div>
		)
	}

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
					<ModelSettingsPopup
						onClose={() => setIsSettingsPopupOpen(false)}
						setHasChanges={() => {
							/* This is a no-op because the parent component doesn't need to know about changes */
						}}
					/>
				</PopoverContent>
			</Popover>
		</div>
	)
}
