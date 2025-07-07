import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"

import { ContextWindowProgress } from "../ContextWindowProgress"
import * as modelUtils from "@/utils/model-utils"

// Mock the translation hook
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { [key: string]: string | number }) => {
			if (options) {
				return `${key} ${JSON.stringify(options)}`
			}
			return key
		},
	}),
}))

// Mock the formatLargeNumber utility
vi.mock("@/utils/format", () => ({
	formatLargeNumber: (num: number) => num.toString(),
}))

// Mock the calculateTokenDistribution utility
const calculateTokenDistributionSpy = vi.spyOn(modelUtils, "calculateTokenDistribution")

describe("ContextWindowProgress", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("sollte die Breiten der Fortschrittsbalken korrekt basierend auf den berechneten Prozenten einstellen", () => {
		calculateTokenDistributionSpy.mockReturnValue({
			currentPercent: 50,
			reservedPercent: 25,
			availablePercent: 25,
			reservedForOutput: 2500,
			availableSize: 2500,
		})

		render(<ContextWindowProgress contextWindow={10000} contextTokens={5000} maxTokens={2500} />)

		const usedBar = screen.getByTestId("context-tokens-used")
		const reservedBar = screen.getByTestId("context-reserved-tokens")
		const availableBar = screen.getByTestId("context-available-space-section")

		expect(usedBar).toHaveStyle("width: 50%")
		expect(reservedBar).toHaveStyle("width: 25%")
		expect(availableBar).toHaveStyle("width: 25%")
	})

	it("sollte den Tooltip mit den korrekten Token-Informationen anzeigen", async () => {
		calculateTokenDistributionSpy.mockReturnValue({
			currentPercent: 60,
			reservedPercent: 20,
			availablePercent: 20,
			reservedForOutput: 2000,
			availableSize: 2000,
		})

		render(<ContextWindowProgress contextWindow={10000} contextTokens={6000} maxTokens={2000} />)

		const progressBar = screen.getByTestId("context-tokens-used").parentElement?.parentElement
		if (!progressBar) {
			throw new Error("Progress bar container not found")
		}
		await userEvent.hover(progressBar)

		expect(await screen.findByText(/chat:tokenProgress.tokensUsed/)).toBeInTheDocument()
		expect(await screen.findByText(/chat:tokenProgress.reservedForResponse/)).toBeInTheDocument()
		expect(await screen.findByText(/chat:tokenProgress.availableSpace/)).toBeInTheDocument()

		expect(screen.getByText('chat:tokenProgress.tokensUsed {"used":"6000","total":"10000"}')).toBeInTheDocument()
		expect(screen.getByText('chat:tokenProgress.reservedForResponse {"amount":"2000"}')).toBeInTheDocument()
		expect(screen.getByText('chat:tokenProgress.availableSpace {"amount":"2000"}')).toBeInTheDocument()
	})

	it("sollte calculateTokenDistribution mit den korrekten Argumenten aufrufen", () => {
		render(<ContextWindowProgress contextWindow={128000} contextTokens={10000} maxTokens={4096} />)

		expect(calculateTokenDistributionSpy).toHaveBeenCalledTimes(1)
		expect(calculateTokenDistributionSpy).toHaveBeenCalledWith(128000, 10000, 4096)
	})

	it("sollte keine verfügbare Leiste rendern, wenn availablePercent 0 ist", () => {
		calculateTokenDistributionSpy.mockReturnValue({
			currentPercent: 80,
			reservedPercent: 20,
			availablePercent: 0,
			reservedForOutput: 2000,
			availableSize: 0,
		})

		render(<ContextWindowProgress contextWindow={10000} contextTokens={8000} maxTokens={2000} />)

		const availableBar = screen.queryByTestId("context-available-space-section")
		expect(availableBar).not.toBeInTheDocument()
	})
})
