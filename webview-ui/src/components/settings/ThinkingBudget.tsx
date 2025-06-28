import { useCallback, useEffect } from "react"
import { Checkbox } from "vscrui"

import {
	type ModelInfo,
	type ReasoningEffort,
	reasoningEfforts,
	ProviderName,
	ModelSpecificSettings,
} from "@roo-code/types"

import {
	DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS,
	DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
	RouterName,
} from "@roo/api"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Slider, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"

interface ThinkingBudgetProps {
	apiProvider: ProviderName | RouterName | undefined
	apiModelId: string | undefined
	modelSettings: ModelSpecificSettings | undefined
	setModelSettingsFields: (updates: Partial<ModelSpecificSettings>) => void
	modelInfo?: ModelInfo
}

export const ThinkingBudget = ({ modelSettings, setModelSettingsFields, modelInfo }: ThinkingBudgetProps) => {
	const { t } = useAppTranslation()

	const isReasoningBudgetSupported = !!modelInfo?.supportsReasoningBudget
	const isReasoningBudgetRequired = !!modelInfo?.requiredReasoningBudget
	const isReasoningEffortSupported = !!modelInfo?.supportsReasoningEffort

	const enableReasoningEffort = modelSettings?.enableReasoningEffort ?? isReasoningBudgetSupported

	const customMaxOutputTokens =
		modelSettings?.modelMaxTokens ??
		(isReasoningBudgetSupported ? DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS : undefined)
	const customMaxThinkingTokens =
		modelSettings?.modelMaxThinkingTokens ??
		(isReasoningBudgetSupported ? DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS : undefined)

	const modelMaxThinkingTokens = modelInfo?.maxThinkingTokens
		? Math.min(modelInfo.maxThinkingTokens, Math.floor(0.8 * (customMaxOutputTokens ?? 0)))
		: Math.floor(0.8 * (customMaxOutputTokens ?? 0))

	useEffect(() => {
		if (isReasoningBudgetSupported && customMaxThinkingTokens && customMaxThinkingTokens > modelMaxThinkingTokens) {
			setModelSettingsFields({ modelMaxThinkingTokens })
		}
	}, [isReasoningBudgetSupported, customMaxThinkingTokens, modelMaxThinkingTokens, setModelSettingsFields])

	const handleReasoningToggle = useCallback(
		(checked: boolean) => {
			const updates: Partial<ModelSpecificSettings> = { enableReasoningEffort: checked }
			if (checked) {
				if (modelSettings?.modelMaxTokens === undefined) {
					updates.modelMaxTokens = isReasoningBudgetSupported
						? DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS
						: undefined
				}
				if (modelSettings?.modelMaxThinkingTokens === undefined) {
					updates.modelMaxThinkingTokens = isReasoningBudgetSupported
						? DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS
						: undefined
				}
			}
			setModelSettingsFields(updates)
		},
		[
			isReasoningBudgetSupported,
			modelSettings?.modelMaxTokens,
			modelSettings?.modelMaxThinkingTokens,
			setModelSettingsFields,
		],
	)

	if (!modelInfo) {
		return null
	}

	return isReasoningBudgetSupported && modelInfo.maxTokens ? (
		<>
			{!isReasoningBudgetRequired && (
				<div className="flex flex-col gap-1">
					<Checkbox checked={!!enableReasoningEffort} onChange={handleReasoningToggle}>
						{t("settings:providers.useReasoning")}
					</Checkbox>
				</div>
			)}
			{(isReasoningBudgetRequired || enableReasoningEffort) && (
				<>
					<div className="flex flex-col gap-1">
						<div className="font-medium">{t("settings:thinkingBudget.maxTokens")}</div>
						<div className="flex items-center gap-1">
							<Slider
								min={8192}
								max={Math.max(
									modelInfo.maxTokens || 8192,
									customMaxOutputTokens ?? 0,
									DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS,
								)}
								step={1024}
								value={[customMaxOutputTokens ?? 0]}
								onValueChange={([value]) => setModelSettingsFields({ modelMaxTokens: value })}
							/>
							<div className="w-12 text-sm text-center">{customMaxOutputTokens}</div>
						</div>
					</div>
					<div className="flex flex-col gap-1">
						<div className="font-medium">{t("settings:thinkingBudget.maxThinkingTokens")}</div>
						<div className="flex items-center gap-1" data-testid="reasoning-budget">
							<Slider
								min={1024}
								max={modelMaxThinkingTokens}
								step={1024}
								value={[customMaxThinkingTokens ?? 0]}
								onValueChange={([value]) => setModelSettingsFields({ modelMaxThinkingTokens: value })}
							/>
							<div className="w-12 text-sm text-center">{customMaxThinkingTokens}</div>
						</div>
					</div>
				</>
			)}
		</>
	) : isReasoningEffortSupported ? (
		<div className="flex flex-col gap-1" data-testid="reasoning-effort">
			<div className="flex justify-between items-center">
				<label className="block font-medium mb-1">{t("settings:providers.reasoningEffort.label")}</label>
			</div>
			<Select
				value={modelSettings?.reasoningEffort}
				onValueChange={(value) => setModelSettingsFields({ reasoningEffort: value as ReasoningEffort })}>
				<SelectTrigger className="w-full">
					<SelectValue placeholder={t("settings:common.select")} />
				</SelectTrigger>
				<SelectContent>
					{reasoningEfforts.map((value) => (
						<SelectItem key={value} value={value}>
							{t(`settings:providers.reasoningEffort.${value}`)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	) : null
}
