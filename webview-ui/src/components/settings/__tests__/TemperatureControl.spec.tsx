// npx vitest src/components/settings/__tests__/TemperatureControl.spec.tsx

import { render, screen, fireEvent } from "@/utils/test-utils"

import { TemperatureControl } from "../TemperatureControl"

vi.mock("@/components/ui", () => ({
	...vi.importActual("@/components/ui"),
	Slider: ({ value, onValueChange, "data-testid": dataTestId }: any) => (
		<input
			type="range"
			value={value[0]}
			onChange={(e) => onValueChange([parseFloat(e.target.value)])}
			data-testid={dataTestId}
			role="slider"
		/>
	),
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeCheckbox: ({ children, onChange, checked, ...props }: any) => (
		<label>
			<input
				type="checkbox"
				role="checkbox"
				checked={checked || false}
				aria-checked={checked || false}
				onChange={(e: any) => onChange?.({ target: { checked: e.target.checked } })}
				{...props}
			/>
			{children}
		</label>
	),
}))

describe("TemperatureControl", () => {
	it("renders with default temperature disabled", () => {
		const onChange = vi.fn()
		const onCustomEnabledChange = vi.fn()
		render(
			<TemperatureControl
				value={1}
				onChange={onChange}
				isCustomEnabled={false}
				onCustomEnabledChange={onCustomEnabledChange}
			/>,
		)

		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).not.toBeChecked()
		expect(screen.queryByRole("slider")).not.toBeInTheDocument()
	})

	it("renders with custom temperature enabled", () => {
		const onChange = vi.fn()
		const onCustomEnabledChange = vi.fn()
		render(
			<TemperatureControl
				value={0.7}
				onChange={onChange}
				isCustomEnabled={true}
				onCustomEnabledChange={onCustomEnabledChange}
			/>,
		)

		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).toBeChecked()

		const input = screen.getByRole("slider")
		expect(input).toBeInTheDocument()
		expect(input).toHaveValue("0.7")
	})

	it("calls onCustomEnabledChange when checkbox is toggled", () => {
		const onChange = vi.fn()
		const onCustomEnabledChange = vi.fn()
		render(
			<TemperatureControl
				value={0.7}
				onChange={onChange}
				isCustomEnabled={true}
				onCustomEnabledChange={onCustomEnabledChange}
			/>,
		)

		const checkbox = screen.getByRole("checkbox")
		fireEvent.click(checkbox)
		expect(onCustomEnabledChange).toHaveBeenCalledWith(false)
	})

	it("calls onChange when slider is moved", () => {
		const onChange = vi.fn()
		const onCustomEnabledChange = vi.fn()
		render(
			<TemperatureControl
				value={0.7}
				onChange={onChange}
				isCustomEnabled={true}
				onCustomEnabledChange={onCustomEnabledChange}
			/>,
		)

		const slider = screen.getByRole("slider")
		fireEvent.change(slider, { target: { value: "0.5" } })
		expect(onChange).toHaveBeenCalledWith(0.5)
	})
})
