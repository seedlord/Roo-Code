import React, { useState } from "react"
import { ModelInfo, ProviderName, ProviderSettings } from "@roo-code/types"
import {
	DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS,
	DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
	getModelMaxOutputTokens,
	isRouterName,
} from "@roo/api"
import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { useTranslation } from "react-i18next"
import { Button, Slider } from "../ui"
import { formatPrice } from "@/utils/formatPrice"
import { PROVIDERS } from "../settings/constants"
import { modelSources, useModelSettings } from "./hooks/useModelSettings"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { TemperatureControl } from "../settings/TemperatureControl"
import { vscode } from "@/utils/vscode"
import { IconButton } from "./IconButton"

interface ModelSettingsPopupProps {
	onClose: () => void
	setHasChanges: (value: boolean) => void
}

export const ModelSettingsPopup: React.FC<ModelSettingsPopupProps> = ({ onClose, setHasChanges }) => {
	const { t } = useTranslation()
	const { apiConfiguration } = useExtensionState()
	const [isTooltipActive, setIsTooltipActive] = useState(false)
	const {
		localApiConfiguration,
		localApiProvider,
		localSelectedModelId,
		localMaxOutputTokens,
		localThinkingBudget,
		localEnableReasoning,
		localModelTemperature,
		localEnableModelTemperature,
		hasChanges,
		ollamaModels,
		routerModels,
		handleSaveSettings,
		resetState,
		setLocalApiConfigurationField,
		handleProviderChange,
		handleModelChange,
		handleTemperatureChange,
		handleCustomTemperatureChange,
	} = useModelSettings(true, setHasChanges)

	const handleAdvancedSettingsClick = () => {
		vscode.postMessage({ type: "switchTab", tab: "settings" })
		onClose()
	}

	const handleClose = () => {
		resetState()
		onClose()
	}

	const formatTokenCount = (tokens: number | undefined | null) => {
		if (tokens === undefined || tokens === null) return "N/A"
		const K_DIVISOR = 1000
		const M_DIVISOR = K_DIVISOR * K_DIVISOR
		if (tokens >= M_DIVISOR) return `${Math.round(tokens / M_DIVISOR)}M`
		if (tokens >= K_DIVISOR) return `${Math.round(tokens / K_DIVISOR)}K`
		return tokens.toString()
	}

	return (
		<div className="flex flex-col gap-1" onPointerEnter={() => setIsTooltipActive(true)}>
			<div className="flex justify-between items-center">
				<h3 className="text-sm font-semibold mt-0 mb-0">Model Settings</h3>
				<IconButton
					iconClass="codicon-settings-gear"
					onClick={handleAdvancedSettingsClick}
					title={t("settings:header.title")}
					tooltipDisabled={!isTooltipActive}
				/>
			</div>

			<div className="flex flex-col gap-1">
				<label htmlFor="provider-select" className="text-xs font-medium">
					{t("settings:providers.apiProvider")}
				</label>
				<VSCodeDropdown
					id="provider-select"
					value={localApiProvider}
					onChange={(e) => handleProviderChange((e.target as HTMLSelectElement).value as ProviderName)}>
					{PROVIDERS.map((provider) => (
						<VSCodeOption key={provider.value} value={provider.value}>
							{provider.label}
						</VSCodeOption>
					))}
				</VSCodeDropdown>
			</div>

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
								contextWindow: 8192,
								supportsPromptCache: false,
								supportsImages: true,
								supportsReasoningBudget: false,
								maxTokens: 4096,
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
						{popupModelSource &&
							typeof popupModelSource === "object" &&
							!("contextWindow" in popupModelSource) && (
								<div className="flex flex-col gap-1">
									<label htmlFor="model-select" className="text-xs font-medium">
										{t("settings:providers.model")}
									</label>
									<VSCodeDropdown
										key={localApiProvider}
										id="model-select"
										value={localSelectedModelId ?? ""}
										onChange={(e) => handleModelChange((e.target as HTMLSelectElement).value)}>
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
								{popupModelInfo.supportsReasoningBudget && !popupModelInfo.requiredReasoningBudget && (
									<VSCodeCheckbox
										checked={localEnableReasoning}
										onChange={(e) => {
											const isEnabled = (e.target as HTMLInputElement).checked
											setLocalApiConfigurationField("enableReasoningEffort", isEnabled)
											if (!isEnabled && popupModelInfo) {
												const defaultMaxOutput = getModelMaxOutputTokens({
													modelId: popupModelId,
													model: popupModelInfo,
													settings: {
														...localApiConfiguration,
														enableReasoningEffort: false,
													} as ProviderSettings,
												})
												setLocalApiConfigurationField("modelMaxTokens", defaultMaxOutput)
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
								{localEnableReasoning && (
									<>
										{(popupModelInfo?.supportsReasoningBudget ||
											popupModelInfo?.requiredReasoningBudget) && (
											<div className="flex flex-col gap-1">
												<div className="flex justify-between items-center text-xs font-medium">
													<span>{t("chat:profile.maxOutput")}</span>
													<span>{localMaxOutputTokens ?? popupMaxOutputTokens ?? 0}</span>
												</div>
												<Slider
													value={[localMaxOutputTokens ?? popupMaxOutputTokens ?? 0]}
													min={8192}
													max={maxForOutputSlider}
													step={1024}
													onValueChange={([newValue]) => {
														setLocalApiConfigurationField("modelMaxTokens", newValue)
														setHasChanges(true)
													}}
												/>
											</div>
										)}
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
														setHasChanges(true)
													}}
												/>
											</div>
										)}
									</>
								)}
								<TemperatureControl
									value={localModelTemperature ?? 1}
									isCustomEnabled={localEnableModelTemperature ?? false}
									onCustomEnabledChange={handleCustomTemperatureChange}
									onChange={handleTemperatureChange}
									maxValue={2}
								/>
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
											<div className="text-right">{formatPrice(popupOutputPrice)}</div>
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
			<div className="flex justify-end gap-2">
				<Button onClick={handleClose} className="bg-transparent hover:bg-vscode-list-hoverBackground">
					Close
				</Button>
				<Button onClick={handleSaveSettings} disabled={!hasChanges}>
					Save
				</Button>
			</div>
		</div>
	)
}
