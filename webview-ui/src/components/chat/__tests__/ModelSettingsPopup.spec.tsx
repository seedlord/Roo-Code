import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import i18n from "../../../i18n/setup"
import { ExtensionStateContext, ExtensionStateContextType } from "../../../context/ExtensionStateContext"
import { ModelSettingsPopup } from "../ModelSettingsPopup"
import { ModelInfo, ProviderSettings } from "@roo-code/types"
import { vi, describe, it, expect, beforeEach, Mock } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { vscode } from "@/utils/vscode"

vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

const mockUseSelectedModel = vi.fn()
vi.mock("../../ui/hooks/useSelectedModel", () => ({
	useSelectedModel: (config: any) => mockUseSelectedModel(config),
}))

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

const queryClient = new QueryClient()

const TestWrapper: React.FC<{
	children: React.ReactNode
	state?: Partial<ExtensionStateContextType>
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

describe("ModelSettingsPopup", () => {
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

	it("saves settings when save button is clicked", async () => {
		const setHasChanges = vi.fn()
		render(
			<TestWrapper>
				<ModelSettingsPopup onClose={() => {}} setHasChanges={setHasChanges} />
			</TestWrapper>,
		)

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
				gemini: "gemini-1.5-flash",
			},
		}

		mockUseSelectedModel.mockReturnValue({
			id: "gemini-1.5-pro",
			info: { contextWindow: 1048576, maxTokens: 8192 } as ModelInfo,
			provider: "vertex",
		})

		render(
			<TestWrapper state={{ apiConfiguration: configWithVertex }}>
				<ModelSettingsPopup onClose={() => {}} setHasChanges={() => {}} />
			</TestWrapper>,
		)

		const providerSelect = screen.getByTestId("provider-select")
		fireEvent.change(providerSelect, { target: { value: "gemini" } })

		await waitFor(() => {
			const modelSelect = screen.getByTestId("model-select") as HTMLSelectElement
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
			<TestWrapper>
				<ModelSettingsPopup onClose={() => {}} setHasChanges={() => {}} />
			</TestWrapper>,
		)

		const providerSelect = screen.getByTestId("provider-select")
		fireEvent.change(providerSelect, { target: { value: "gemini" } })

		await waitFor(() => {
			const modelSelect = screen.getByTestId("model-select") as HTMLSelectElement
			expect(modelSelect.value).toBe("gemini-1.5-pro")
		})
	})
})
