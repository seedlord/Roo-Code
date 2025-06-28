import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import i18n from "../../../i18n/setup"
import { ExtensionStateContext, ExtensionStateContextType } from "../../../context/ExtensionStateContext"
import { ProfileInfoBar } from "../ProfileInfoBar"
import { ProviderSettings } from "@roo-code/types"
import { vi, describe, it, expect, beforeEach, Mock } from "vitest"

// Mock ResizeObserver for JSDOM at the top level
global.ResizeObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn(),
}))

// Mock vscode API
vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))
import { vscode } from "@/utils/vscode"

// Mock the useSelectedModel hook
const mockUseSelectedModel = vi.fn()
vi.mock("../../ui/hooks/useSelectedModel", () => ({
	useSelectedModel: (config: any) => mockUseSelectedModel(config),
}))

// Mock UI components
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeBadge: ({ children }: { children: React.ReactNode }) => <span data-testid="vscode-badge">{children}</span>,
	VSCodeCheckbox: ({
		children,
		checked,
		onChange,
	}: {
		children: React.ReactNode
		checked: boolean
		onChange: (e: any) => void
	}) => (
		<label>
			<input type="checkbox" checked={checked} onChange={onChange} />
			{children}
		</label>
	),
	VSCodeDropdown: ({
		children,
		value,
		onChange,
		id,
	}: {
		children: React.ReactNode
		value: string
		onChange: (e: any) => void
		id: string
	}) => (
		<select data-testid={id} value={value} onChange={onChange}>
			{children}
		</select>
	),
	VSCodeOption: ({ children, value, title }: { children: React.ReactNode; value: string; title?: string }) => (
		<option value={value} title={title}>
			{children}
		</option>
	),
}))

vi.mock("react-i18next", async () => {
	const original = await vi.importActual<typeof import("react-i18next")>("react-i18next")
	return {
		...original,
		Trans: ({ i18nKey, children }: { i18nKey?: string; children: React.ReactNode }) => <>{children || i18nKey}</>,
		useTranslation: () => ({ t: (key: string) => key }),
	}
})

const mockApiConfiguration: ProviderSettings = {
	apiProvider: "openai",
	apiModelId: "gpt-4",
	modelSettings: {
		"gpt-4": {
			modelMaxTokens: 4096,
			modelMaxThinkingTokens: 8192,
			enableReasoningEffort: true,
		},
	},
}

const TestWrapper: React.FC<{
	children: React.ReactNode
	state: Partial<ExtensionStateContextType>
}> = ({ children, state }) => (
	<I18nextProvider i18n={i18n}>
		<ExtensionStateContext.Provider
			value={
				{
					apiConfiguration: mockApiConfiguration,
					currentApiConfigName: "default",
					setIsAwaitingConfigurationUpdate: vi.fn(),
					routerModels: {},
					...state,
				} as unknown as ExtensionStateContextType
			}>
			{children}
		</ExtensionStateContext.Provider>
	</I18nextProvider>
)

describe("ProfileInfoBar", () => {
	beforeEach(() => {
		;(vscode.postMessage as Mock).mockClear()
		mockUseSelectedModel.mockReturnValue({
			id: "gpt-4",
			info: {
				contextWindow: 8192,
				inputPrice: 30,
				outputPrice: 60,
				supportsReasoningBudget: true,
				maxTokens: 4096,
				description: "The one and only GPT-4",
			},
			provider: "openai",
		})
	})

	it("renders correctly with provider info", () => {
		render(
			<TestWrapper state={{}}>
				<ProfileInfoBar />
			</TestWrapper>,
		)
		expect(screen.getByText("OpenAI")).toBeInTheDocument()
		expect(screen.getByText("gpt-4")).toBeInTheDocument()
	})

	it("opens settings popup on click", async () => {
		render(
			<TestWrapper state={{}}>
				<ProfileInfoBar />
			</TestWrapper>,
		)

		// Click on an element within the trigger area to open the popover
		fireEvent.click(screen.getByText("OpenAI"))

		await waitFor(() => {
			expect(screen.getByText("Model Settings")).toBeInTheDocument()
		})

		expect(screen.getByTestId("provider-select")).toHaveValue("openai")
	})

	it("saves settings when save button is clicked", async () => {
		const setIsAwaitingConfigurationUpdate = vi.fn()
		render(
			<TestWrapper state={{ setIsAwaitingConfigurationUpdate }}>
				<ProfileInfoBar />
			</TestWrapper>,
		)

		// Click on an element within the trigger area to open the popover
		fireEvent.click(screen.getByText("OpenAI"))

		await waitFor(() => {
			expect(screen.getByText("Model Settings")).toBeInTheDocument()
		})

		const saveButton = screen.getByRole("button", { name: "Save" })
		// Initially should be disabled
		expect(saveButton).toBeDisabled()

		const reasoningCheckbox = screen.getByLabelText("chat:profile.enableReasoning")
		fireEvent.click(reasoningCheckbox)

		// Should be enabled after a change
		await waitFor(() => {
			expect(saveButton).not.toBeDisabled()
		})
		fireEvent.click(saveButton)

		expect(setIsAwaitingConfigurationUpdate).toHaveBeenCalledWith(true)
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "upsertApiConfiguration",
			text: "default",
			// The entire configuration object should be sent, reflecting the change
			apiConfiguration: {
				...mockApiConfiguration,
				modelSettings: {
					...mockApiConfiguration.modelSettings,
					"gpt-4": {
						...mockApiConfiguration.modelSettings?.["gpt-4"],
						enableReasoningEffort: false, // It was true, we clicked it, so it should be false
					},
				},
			},
		})
	})
})
