// npx vitest src/components/settings/__tests__/ThinkingBudget.spec.tsx

import { render, screen, fireEvent } from "@/utils/test-utils"

import type { ModelInfo } from "@roo-code/types"

import { ThinkingBudget } from "../ThinkingBudget"

vi.mock("@/components/ui", () => ({
	Slider: ({ value, onValueChange, min, max }: any) => (
		<input
			type="range"
			data-testid="slider"
			min={min}
			max={max}
			value={value[0]}
			onChange={(e) => onValueChange([parseInt(e.target.value)])}
		/>
	),
}))

describe("ThinkingBudget", () => {
	const mockModelInfo: ModelInfo = {
		supportsReasoningBudget: true,
		requiredReasoningBudget: true,
		maxTokens: 16384,
		contextWindow: 200000,
		supportsPromptCache: true,
		supportsImages: true,
	}

	const defaultProps = {
		apiProvider: "openai" as const,
		apiModelId: "gpt-4",
		modelSettings: {},
		setModelSettingsFields: vi.fn(),
		modelInfo: mockModelInfo,
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should render nothing when model doesn't support thinking", () => {
		const { container } = render(
			<ThinkingBudget
				{...defaultProps}
				modelInfo={{
					...mockModelInfo,
					supportsReasoningBudget: false,
				}}
			/>,
		)
		expect(container.firstChild).toBeNull()
	})

	it("should render sliders when model supports thinking", () => {
		render(<ThinkingBudget {...defaultProps} />)
		expect(screen.getAllByTestId("slider")).toHaveLength(2)
	})

	it("should update modelMaxThinkingTokens", () => {
		const setModelSettingsFields = vi.fn()
		render(
			<ThinkingBudget
				{...defaultProps}
				modelSettings={{ modelMaxThinkingTokens: 4096 }}
				setModelSettingsFields={setModelSettingsFields}
			/>,
		)
		const sliders = screen.getAllByTestId("slider")
		fireEvent.change(sliders[1], { target: { value: "5000" } })
		expect(setModelSettingsFields).toHaveBeenCalledWith({ modelMaxThinkingTokens: 5000 })
	})

	it("should cap thinking tokens at 80% of max tokens", () => {
		const setModelSettingsFields = vi.fn()
		render(
			<ThinkingBudget
				{...defaultProps}
				modelSettings={{ modelMaxTokens: 10000, modelMaxThinkingTokens: 9000 }}
				setModelSettingsFields={setModelSettingsFields}
			/>,
		)
		// Effect should trigger and cap the value
		expect(setModelSettingsFields).toHaveBeenCalledWith({ modelMaxThinkingTokens: 8000 }) // 80% of 10000
	})

	it("should use default thinking tokens if not provided", () => {
		render(<ThinkingBudget {...defaultProps} modelSettings={{ modelMaxTokens: 10000 }} />)
		const sliders = screen.getAllByTestId("slider")
		// Default thinking tokens is 8192, but it's capped by 80% of max tokens
		expect(sliders[1]).toHaveValue("8000")
	})

	it("should use min thinking tokens of 1024", () => {
		render(<ThinkingBudget {...defaultProps} modelSettings={{ modelMaxTokens: 1000 }} />)
		const sliders = screen.getAllByTestId("slider")
		expect(sliders[1].getAttribute("min")).toBe("1024")
	})

	it("should update max tokens when slider changes", () => {
		const setModelSettingsFields = vi.fn()
		render(
			<ThinkingBudget
				{...defaultProps}
				modelSettings={{ modelMaxTokens: 10000 }}
				setModelSettingsFields={setModelSettingsFields}
			/>,
		)
		const sliders = screen.getAllByTestId("slider")
		fireEvent.change(sliders[0], { target: { value: "12000" } })
		expect(setModelSettingsFields).toHaveBeenCalledWith({ modelMaxTokens: 12000 })
	})
})
