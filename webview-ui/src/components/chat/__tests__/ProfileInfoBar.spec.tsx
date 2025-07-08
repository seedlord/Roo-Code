import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import i18n from "../../../i18n/setup"
import { ExtensionStateContext, ExtensionStateContextType } from "../../../context/ExtensionStateContext"
import { ProfileInfoBar } from "../ProfileInfoBar"
import { ModelInfo, ProviderSettings } from "@roo-code/types"
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

// Mock model data directly
vi.mock("@roo-code/types", async () => {
	const originalModule = await vi.importActual<typeof import("@roo-code/types")>("@roo-code/types")
	return {
		...originalModule,
		openAiNativeModels: {
			"gpt-4": {
				contextWindow: 8192,
				inputPrice: 30,
				outputPrice: 60,
				supportsReasoningBudget: true,
				maxTokens: 4096,
				description: "The one and only GPT-4",
			},
		},
		vscodeLlmModels: {
			"copilot-gpt-3.5-turbo": {
				contextWindow: 16384,
				description: "VS Code Copilot 3.5",
			},
		},
		xaiModels: {
			grok: {
				contextWindow: 131072,
				inputPrice: 10,
				outputPrice: 10,
				supportsReasoningBudget: false,
				maxTokens: 8192,
				description: "Grok by xAI",
			},
		},
		geminiModels: {
			"gemini-pro-test": {
				contextWindow: 1048576,
				inputPrice: 2.5,
				outputPrice: 15,
				requiredReasoningBudget: true,
				maxTokens: 64000,
				description: "Test model with required reasoning",
			},
		},
	}
})

const mockApiConfiguration: ProviderSettings = {
	apiProvider: "openai-native",
	apiModelId: "gpt-4",
	modelMaxTokens: 4096,
	modelMaxThinkingTokens: 8192,
	enableReasoningEffort: true,
}

const mockRouterModels = {
	openrouter: {
		"openrouter/model-A": {
			contextWindow: 16000,
			inputPrice: 1,
			outputPrice: 2,
			supportsReasoningBudget: true,
			maxTokens: 8000,
			description: "OpenRouter Model A",
		},
		"openrouter/model-B": {
			contextWindow: 32000,
			inputPrice: 3,
			outputPrice: 4,
			supportsReasoningBudget: false,
			maxTokens: 16000,
			description: "OpenRouter Model B",
		},
	},
	litellm: {
		"litellm/model-1": {
			contextWindow: 32000,
			inputPrice: 0.5,
			outputPrice: 1.5,
			supportsReasoningBudget: false,
			maxTokens: 16000,
			description: "LiteLLM Model 1",
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
					routerModels: mockRouterModels,
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
		// Standardize on openai-native for all tests to ensure controls are rendered
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
			provider: "openai-native",
			isLoading: false,
			isError: false,
		})
	})

	it("renders correctly with standard provider info", () => {
		render(
			<TestWrapper state={{}}>
				<ProfileInfoBar />
			</TestWrapper>,
		)
		expect(screen.getByText("OpenAI")).toBeInTheDocument()
		expect(screen.getByText("gpt-4")).toBeInTheDocument()
	})

	it("renders correctly for vscode-lm provider", () => {
		const vscodeLmConfig: ProviderSettings = {
			...mockApiConfiguration,
			apiProvider: "vscode-lm",
			vsCodeLmModelSelector: { vendor: "copilot", family: "gpt-3.5-turbo" },
		}
		mockUseSelectedModel.mockReturnValue({
			id: "copilot/gpt-3.5-turbo",
			info: {
				contextWindow: 16384,
				description: "VS Code Copilot 3.5",
			} as ModelInfo,
			provider: "vscode-lm",
			isLoading: false,
			isError: false,
		})

		render(
			<TestWrapper state={{ apiConfiguration: vscodeLmConfig }}>
				<ProfileInfoBar />
			</TestWrapper>,
		)

		expect(screen.getByText("VS Code LM API")).toBeInTheDocument()
		expect(screen.getByText("copilot/gpt-3.5-turbo")).toBeInTheDocument()
		// Check for context window as a proxy for correct info display
		expect(screen.getByTitle("chat:profile.contextSize: 16384 chat:profile.tokens")).toHaveTextContent("16K")
	})

	it("renders correctly for xai provider", () => {
		const xaiConfig: ProviderSettings = {
			...mockApiConfiguration,
			apiProvider: "xai",
			apiModelId: "grok",
		}
		mockUseSelectedModel.mockReturnValue({
			id: "grok",
			info: {
				contextWindow: 131072,
				inputPrice: 10,
				outputPrice: 10,
				supportsReasoningBudget: false,
				maxTokens: 8192,
				description: "Grok by xAI",
			} as ModelInfo,
			provider: "xai",
			isLoading: false,
			isError: false,
		})
		render(
			<TestWrapper state={{ apiConfiguration: xaiConfig }}>
				<ProfileInfoBar />
			</TestWrapper>,
		)
		expect(screen.getByText("xAI (Grok)")).toBeInTheDocument()
		expect(screen.getByText("grok")).toBeInTheDocument()
		expect(screen.getByTitle("chat:profile.contextSize: 131072 chat:profile.tokens")).toHaveTextContent("131K")
	})
	it("displays thinking budget by default for models that require it", () => {
		const geminiConfig: ProviderSettings = {
			...mockApiConfiguration,
			apiProvider: "gemini",
			apiModelId: "gemini-pro-test",
			// No modelSettings defined for this model yet
			modelSettings: {},
		}
		mockUseSelectedModel.mockReturnValue({
			id: "gemini-pro-test",
			info: {
				contextWindow: 1048576,
				inputPrice: 2.5,
				outputPrice: 15,
				requiredReasoningBudget: true,
				maxTokens: 64000,
			} as ModelInfo,
			provider: "gemini",
			isLoading: false,
			isError: false,
		})

		render(
			<TestWrapper state={{ apiConfiguration: geminiConfig }}>
				<ProfileInfoBar />
			</TestWrapper>,
		)

		// Check that the thinking budget is displayed, even without specific settings saved
		const thinkingBudgetElement = screen.getByTitle(/chat:profile.thinkingBudget/i)
		expect(thinkingBudgetElement).toBeInTheDocument()
		// The default value should be formatted
		expect(thinkingBudgetElement).toHaveTextContent("8K")
	})

	it("toggles expansion when chevron is clicked", () => {
		const { container } = render(
			<TestWrapper state={{}}>
				<ProfileInfoBar />
			</TestWrapper>,
		)
		const chevron = container.querySelector(".chevron-button")
		expect(chevron).not.toBeNull()
		expect(chevron).toHaveClass("codicon-chevron-left")

		fireEvent.click(chevron!)
		expect(chevron).toHaveClass("codicon-chevron-right")

		fireEvent.click(chevron!)
		expect(chevron).toHaveClass("codicon-chevron-left")
	})

	it("opens settings popup on click", async () => {
		render(
			<TestWrapper state={{}}>
				<ProfileInfoBar />
			</TestWrapper>,
		)

		const infoBar = screen.getByTitle("chat:profile.collapseInfobar")
		fireEvent.click(infoBar.querySelector('[data-state="closed"]')!)

		const modelSettingsTitle = await screen.findByText("Model Settings")
		expect(modelSettingsTitle).toBeInTheDocument()

		expect(screen.getByTestId("provider-select")).toHaveValue("openai-native")
		// The model select might not be present for all providers, so this check is conditional
		const modelSelect = screen.queryByTestId("model-select")
		if (modelSelect) {
			expect(modelSelect).toHaveValue("gpt-4")
		}
	})

	it("saves settings when save button is clicked", async () => {
		// The beforeEach hook now provides a consistent setup with 'openai-native'
		render(
			<TestWrapper state={{ apiConfiguration: { ...mockApiConfiguration, apiProvider: "openai-native" } }}>
				<ProfileInfoBar />
			</TestWrapper>,
		)

		// 1. Open the settings popup
		const infoBar = screen.getByTitle("chat:profile.collapseInfobar")
		fireEvent.click(infoBar.querySelector('[data-state="closed"]')!)
		await screen.findByText("Model Settings")

		// 2. Find the reasoning checkbox and click it to trigger a change.
		const reasoningCheckbox = await screen.findByLabelText("chat:profile.enableReasoning")
		expect(reasoningCheckbox).toBeChecked() // It's enabled by default
		fireEvent.click(reasoningCheckbox)

		// 3. Wait for the change to be reflected in the UI
		await waitFor(() => {
			expect(reasoningCheckbox).not.toBeChecked()
		})

		// 4. Click save
		const saveButton = screen.getByRole("button", { name: "Save" })
		fireEvent.click(saveButton)

		// 5. Assert the correct message was posted
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "upsertApiConfiguration",
			text: "default",
			apiConfiguration: expect.objectContaining({
				apiProvider: "openai-native",
				apiModelId: "gpt-4",
				modelSettings: expect.objectContaining({
					"gpt-4": expect.objectContaining({
						enableReasoningEffort: false, // This was the change we made
					}),
				}),
			}),
		})
	})
})
