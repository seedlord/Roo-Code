import { Checkbox } from "vscrui"

import { type ReasoningEffort, reasoningEfforts } from "@roo-code/types"

import { DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS } from "@roo/api"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Slider, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"

interface ThinkingBudgetProps {
	enableReasoningEffort?: boolean
	reasoningEffort?: ReasoningEffort
	customMaxOutputTokens: number
	customMaxThinkingTokens: number
	modelMaxThinkingTokens: number
	isReasoningBudgetSupported: boolean
	isReasoningBudgetRequired: boolean
	isReasoningEffortSupported: boolean
	maxTokens?: number
	onReasoningEffortChange: (value: boolean) => void
	onReasoningEffortValueChange: (value: ReasoningEffort) => void
	onMaxOutputTokensChange: (value: number) => void
	onMaxThinkingTokensChange: (value: number) => void
}

export const ThinkingBudget = ({
	enableReasoningEffort,
	reasoningEffort,
	customMaxOutputTokens,
	customMaxThinkingTokens,
	modelMaxThinkingTokens,
	isReasoningBudgetSupported,
	isReasoningBudgetRequired,
	isReasoningEffortSupported,
	maxTokens,
	onReasoningEffortChange,
	onReasoningEffortValueChange,
	onMaxOutputTokensChange,
	onMaxThinkingTokensChange,
}: ThinkingBudgetProps) => {
	const { t } = useAppTranslation()

	if (!isReasoningBudgetSupported && !isReasoningEffortSupported) {
		return null
	}

	return isReasoningBudgetSupported && !!maxTokens ? (
		<>
			{!isReasoningBudgetRequired && (
				<div className="flex flex-col gap-1">
					<Checkbox
						checked={enableReasoningEffort}
						onChange={(checked: boolean) => onReasoningEffortChange(checked === true)}>
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
									maxTokens || 8192,
									customMaxOutputTokens,
									DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS,
								)}
								step={1024}
								value={[customMaxOutputTokens]}
								onValueChange={([value]) => onMaxOutputTokensChange(value)}
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
								value={[customMaxThinkingTokens]}
								onValueChange={([value]) => onMaxThinkingTokensChange(value)}
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
				value={reasoningEffort}
				onValueChange={(value) => onReasoningEffortValueChange(value as ReasoningEffort)}>
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
