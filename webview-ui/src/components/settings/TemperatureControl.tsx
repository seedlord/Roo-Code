import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { useEffect, useRef, useState } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { useDebounce } from "react-use"

import { Slider } from "@/components/ui"

interface TemperatureControlProps {
	value: number | undefined | null
	onChange: (value: number | undefined | null) => void
	maxValue?: number
	isCustomEnabled?: boolean
	onCustomEnabledChange?: (enabled: boolean) => void
}

export const TemperatureControl = ({
	value,
	onChange,
	maxValue = 1,
	isCustomEnabled,
	onCustomEnabledChange,
}: TemperatureControlProps) => {
	const { t } = useAppTranslation()
	const [isCustomTemperature, setIsCustomTemperature] = useState(isCustomEnabled ?? value !== undefined)
	const [inputValue, setInputValue] = useState(value)
	const hasInteracted = useRef(false)

	useDebounce(
		() => {
			if (hasInteracted.current) {
				onChange(inputValue)
			}
		},
		50,
		[onChange, inputValue],
	)

	useEffect(() => {
		const hasCustomTemperature = isCustomEnabled ?? (value !== undefined && value !== null)
		setIsCustomTemperature(hasCustomTemperature)
		setInputValue(value)
		hasInteracted.current = false
	}, [value, isCustomEnabled])

	const handleCheckedChange = (e: any) => {
		hasInteracted.current = true
		const isChecked = e.target.checked
		setIsCustomTemperature(isChecked)
		if (onCustomEnabledChange) {
			onCustomEnabledChange(isChecked)
		}

		if (!isChecked) {
			setInputValue(null)
		} else {
			setInputValue(value ?? 0)
		}
	}

	const handleSliderChange = (newValue: number[]) => {
		hasInteracted.current = true
		setInputValue(newValue[0])
	}

	return (
		<>
			<div>
				<VSCodeCheckbox checked={isCustomTemperature} onChange={handleCheckedChange}>
					<label className="block font-medium mb-1">{t("settings:temperature.useCustom")}</label>
				</VSCodeCheckbox>
				<div className="text-sm text-vscode-descriptionForeground mt-1">
					{t("settings:temperature.description")}
				</div>
			</div>

			{isCustomTemperature && (
				<div className="flex flex-col gap-3 pl-3 border-l-2 border-vscode-button-background">
					<div>
						<div className="flex items-center gap-2">
							<Slider
								min={0}
								max={maxValue}
								step={0.01}
								value={[inputValue ?? 0]}
								onValueChange={handleSliderChange}
							/>
							<span className="w-10">{inputValue}</span>
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
