import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { useAppTranslation } from "@/i18n/TranslationContext"

import { Slider } from "@/components/ui"

interface TemperatureControlProps {
	value: number
	onChange: (value: number) => void
	maxValue?: number
	isCustomEnabled: boolean
	onCustomEnabledChange: (enabled: boolean) => void
	disabled?: boolean
}

export const TemperatureControl = ({
	value,
	onChange,
	maxValue = 1,
	isCustomEnabled,
	onCustomEnabledChange,
	disabled,
}: TemperatureControlProps) => {
	const { t } = useAppTranslation()

	const handleCheckedChange = (e: any) => {
		onCustomEnabledChange(e.target.checked)
	}

	const handleSliderChange = (newValue: number[]) => {
		onChange(newValue[0])
	}

	return (
		<>
			<div>
				<VSCodeCheckbox checked={isCustomEnabled} onChange={handleCheckedChange} disabled={disabled}>
					<label className="block font-medium mb-1">{t("settings:temperature.useCustom")}</label>
				</VSCodeCheckbox>
				<div className="text-sm text-vscode-descriptionForeground mt-1">
					{t("settings:temperature.description")}
				</div>
			</div>

			{isCustomEnabled && (
				<div className="flex flex-col gap-3 pl-3 border-l-2 border-vscode-button-background">
					<div>
						<div className="flex items-center gap-2">
							<Slider
								min={0}
								max={maxValue}
								step={0.01}
								value={[value]}
								onValueChange={handleSliderChange}
								disabled={disabled}
							/>
							<span className="w-10">{value}</span>
						</div>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							{t("settings:temperature.rangeDescription")}
						</div>
					</div>
				</div>
			)}
		</>
	)
}
