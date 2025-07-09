import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import i18n from "../../../i18n/setup"
import { ExtensionStateContext, ExtensionStateContextType } from "../../../context/ExtensionStateContext"
import { ProfileInfoBar } from "../ProfileInfoBar"
import { ProviderSettings } from "@roo-code/types"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

const mockUseSelectedModel = vi.fn()
vi.mock("../../ui/hooks/useSelectedModel", () => ({
	useSelectedModel: (config: any) => mockUseSelectedModel(config),
}))

vi.mock("./ModelSettingsPopup", () => ({
	ModelSettingsPopup: ({ onClose }: { onClose: () => void }) => (
		<div>
			<h1>Model Settings</h1>
			<button onClick={onClose}>Close</button>
		</div>
	),
}))

const mockApiConfiguration: ProviderSettings = {
	apiProvider: "openai-native",
	apiModelId: "gpt-4",
	providerModelSelections: {
		"openai-native": "gpt-4",
	},
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

describe("ProfileInfoBar", () => {
	beforeEach(() => {
		mockUseSelectedModel.mockReturnValue({
			id: "gpt-4",
			info: {
				contextWindow: 8192,
				inputPrice: 30,
				outputPrice: 60,
			},
			provider: "openai-native",
		})
	})

	it("renders correctly with provider and model info", () => {
		render(
			<TestWrapper>
				<ProfileInfoBar />
			</TestWrapper>,
		)
		expect(screen.getByText("OpenAI")).toBeInTheDocument()
		expect(screen.getByText("gpt-4")).toBeInTheDocument()
	})

	it("toggles expansion when chevron is clicked", () => {
		const { container } = render(
			<TestWrapper>
				<ProfileInfoBar />
			</TestWrapper>,
		)
		const chevron = container.querySelector(".chevron-button")
		expect(chevron).toHaveClass("codicon-chevron-left")
		fireEvent.click(chevron!)
		expect(chevron).toHaveClass("codicon-chevron-right")
	})

	it("opens and closes settings popup", async () => {
		render(
			<TestWrapper>
				<ProfileInfoBar />
			</TestWrapper>,
		)
		const trigger = screen.getByTitle("chat:profile.collapseInfobar").querySelector('[role="button"]')
		fireEvent.click(trigger!)

		expect(await screen.findByText("Model Settings")).toBeInTheDocument()

		fireEvent.click(screen.getByText("Close"))
		expect(screen.queryByText("Model Settings")).not.toBeInTheDocument()
	})
})
