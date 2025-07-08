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
		...rest
	}: {
		children: React.ReactNode
		value: string
		onChange: (e: any) => void
		id: string
	}) => (
		<select data-testid={id} value={value} onChange={onChange} {...rest}>
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
		vertexModels: {
			"gemini-1.5-pro": {
				contextWindow: 1048576,
				inputPrice: 3.5,
				outputPrice: 10.5,
				supportsReasoningBudget: true,
				maxTokens: 8192,
				description: "The one and only Gemini 1.5 Pro",
			},
		},
		geminiModels: {
			"gemini-1.5-pro": {
				contextWindow: 1048576,
				inputPrice: 3.5,
				outputPrice: 10.5,
				supportsReasoningBudget: true,
				maxTokens: 8192,
				description: "The one and only Gemini 1.5 Pro",
			},
			"gemini-1.5-flash": {
				contextWindow: 1048576,
				inputPrice: 0.35,
				outputPrice: 1.05,
				supportsReasoningBudget: true,
				maxTokens: 8192,
				description: "The one and only Gemini 1.5 Flash",
			},
		},
	}
})

const mockApiConfiguration: ProviderSettings = {
	apiProvider: "openai-native",
	apiModelId: "gpt-4",
	providerModelSelections: {
		"openai-native": "gpt-4",
	},
	modelMaxTokens: 4096,
	modelMaxThinkingTokens: 8192,
	enableReasoningEffort: true,
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const queryClient = new QueryClient()

const TestWrapper: React.FC<{
	children: React.ReactNode
	state: Partial<ExtensionStateContextType>
}> = ({ children, state }) => (
	<QueryClientProvider client={queryClient}>
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
	</QueryClientProvider>
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
			provider: "openai-native",
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
		const modelSelect = screen.queryByTestId("model-select")
		if (modelSelect) {
			expect(modelSelect).toHaveValue("gpt-4")
		}
	})

	it("saves settings when save button is clicked", async () => {
		render(
			<TestWrapper state={{ apiConfiguration: { ...mockApiConfiguration, apiProvider: "openai-native" } }}>
				<ProfileInfoBar />
			</TestWrapper>,
		)

		const infoBar = screen.getByTitle("chat:profile.collapseInfobar")
		fireEvent.click(infoBar.querySelector('[data-state="closed"]')!)
		await screen.findByText("Model Settings")

		const reasoningCheckbox = await screen.findByLabelText("chat:profile.enableReasoning")
		expect(reasoningCheckbox).toBeChecked()
		fireEvent.click(reasoningCheckbox)

		await waitFor(() => {
			expect(reasoningCheckbox).not.toBeChecked()
		})

		const saveButton = screen.getByRole("button", { name: "Save" })
		fireEvent.click(saveButton)

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "upsertApiConfiguration",
			text: "default",
			apiConfiguration: expect.objectContaining({
				apiProvider: "openai-native",
				apiModelId: "gpt-4",
				modelSettings: expect.objectContaining({
					"openai-native:gpt-4": expect.objectContaining({
						enableReasoningEffort: false,
					}),
				}),
			}),
		})
	})

	it("selects the last used model when switching to a provider with a saved selection", async () => {
		const configWithVertex: ProviderSettings = {
			...mockApiConfiguration,
			apiProvider: "vertex",
			apiModelId: "gemini-1.5-pro",
			providerModelSelections: {
				...mockApiConfiguration.providerModelSelections,
				vertex: "gemini-1.5-pro",
				gemini: "gemini-1.5-flash", // Pre-saved selection for gemini
			},
		}

		mockUseSelectedModel.mockReturnValue({
			id: "gemini-1.5-pro",
			info: { contextWindow: 1048576, maxTokens: 8192 } as ModelInfo,
			provider: "vertex",
		})

		render(
			<TestWrapper state={{ apiConfiguration: configWithVertex }}>
				<ProfileInfoBar />
			</TestWrapper>,
		)

		const infoBar = screen.getByTitle("chat:profile.collapseInfobar")
		fireEvent.click(infoBar.querySelector('[data-state="closed"]')!)
		await screen.findByText("Model Settings")

		const providerSelect = screen.getByTestId("provider-select")
		fireEvent.change(providerSelect, { target: { value: "gemini" } })

		await waitFor(() => {
			const modelSelect = screen.getByTestId("model-select") as HTMLSelectElement
			// Should select the pre-saved model 'gemini-1.5-flash', not the first in the list
			expect(modelSelect.value).toBe("gemini-1.5-flash")
		})
	})

	it("selects the first model when switching to a provider without a saved selection", async () => {
		mockUseSelectedModel.mockReturnValue({
			id: "gpt-4",
			info: { contextWindow: 8192, maxTokens: 4096 } as ModelInfo,
			provider: "openai-native",
		})

		render(
			<TestWrapper state={{}}>
				<ProfileInfoBar />
			</TestWrapper>,
		)

		const infoBar = screen.getByTitle("chat:profile.collapseInfobar")
		fireEvent.click(infoBar.querySelector('[data-state="closed"]')!)
		await screen.findByText("Model Settings")

		const providerSelect = screen.getByTestId("provider-select")
		// Switch to Gemini, for which no model is pre-selected in the default mock
		fireEvent.change(providerSelect, { target: { value: "gemini" } })

		await waitFor(() => {
			const modelSelect = screen.getByTestId("model-select") as HTMLSelectElement
			// Should select the first model in the list ('gemini-1.5-pro') as a fallback
			expect(modelSelect.value).toBe("gemini-1.5-pro")
		})
	})
})
