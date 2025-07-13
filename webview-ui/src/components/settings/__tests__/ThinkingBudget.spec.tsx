// npx vitest src/components/settings/__tests__/ThinkingBudget.spec.tsx

import { render, screen, fireEvent } from "@/utils/test-utils"

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
	Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectValue: () => <div />,
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("ThinkingBudget", () => {
	const defaultProps = {
		enableReasoningEffort: true,
		reasoningEffort: "low" as const,
		customMaxOutputTokens: 8192,
		customMaxThinkingTokens: 4096,
		modelMaxThinkingTokens: 16384,
		isReasoningBudgetSupported: true,
		isReasoningBudgetRequired: false,
		isReasoningEffortSupported: false,
		maxTokens: 32768,
		onReasoningEffortChange: vi.fn(),
		onReasoningEffortValueChange: vi.fn(),
		onMaxOutputTokensChange: vi.fn(),
		onMaxThinkingTokensChange: vi.fn(),
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should render nothing when model supports neither budget nor effort", () => {
		const { container } = render(
			<ThinkingBudget {...defaultProps} isReasoningBudgetSupported={false} isReasoningEffortSupported={false} />,
		)
		expect(container.firstChild).toBeNull()
	})

	it("should render sliders when model supports reasoning budget", () => {
		render(<ThinkingBudget {...defaultProps} />)
		expect(screen.getAllByTestId("slider")).toHaveLength(2)
	})

	it("should call onMaxThinkingTokensChange when thinking tokens slider changes", () => {
		render(<ThinkingBudget {...defaultProps} />)
		const sliders = screen.getAllByTestId("slider")
		fireEvent.change(sliders[1], { target: { value: "5000" } })
		expect(defaultProps.onMaxThinkingTokensChange).toHaveBeenCalledWith(5000)
	})

	it("should call onMaxOutputTokensChange when max tokens slider changes", () => {
		render(<ThinkingBudget {...defaultProps} />)
		const sliders = screen.getAllByTestId("slider")
		fireEvent.change(sliders[0], { target: { value: "12000" } })
		expect(defaultProps.onMaxOutputTokensChange).toHaveBeenCalledWith(12000)
	})

	it("should render effort select when model supports reasoning effort", () => {
		render(
			<ThinkingBudget
				{...defaultProps}
				isReasoningBudgetSupported={false}
				isReasoningEffortSupported={true}
				maxTokens={undefined}
			/>,
		)
		expect(screen.getByTestId("reasoning-effort")).toBeInTheDocument()
	})
})
