import { ApiManager } from "../ApiManager"
import { ProviderSettingsManager } from "../../core/config/ProviderSettingsManager"
import { buildApiHandler } from ".."
import { type ProviderSettings } from "@roo-code/types"

// Mock dependencies
vi.mock("../../core/config/ProviderSettingsManager")
vi.mock("..", () => ({
	buildApiHandler: vi.fn(),
}))

describe("ApiManager", () => {
	let providerSettingsManager: ProviderSettingsManager
	let apiManager: ApiManager

	beforeEach(() => {
		// Reset mocks and instances before each test
		vi.clearAllMocks()
		// @ts-ignore - Resetting singleton for testing purposes
		ApiManager.instance = undefined
		apiManager = ApiManager.getInstance()

		providerSettingsManager = new (vi.mocked(ProviderSettingsManager))({} as any)
		apiManager.setProviderSettingsManager(providerSettingsManager)
	})

	test("should be a singleton", () => {
		const instance1 = ApiManager.getInstance()
		const instance2 = ApiManager.getInstance()
		expect(instance1).toBe(instance2)
	})

	test("getHandler should create a new handler if not cached", async () => {
		const profileId = "profile-1"
		const config: ProviderSettings & { name: string } = { name: "test", apiProvider: "anthropic" }
		const mockHandler = { getModel: () => ({ id: "test-model", info: {} }) }

		vi.mocked(providerSettingsManager.getProfile).mockResolvedValue(config)
		vi.mocked(buildApiHandler).mockReturnValue(mockHandler as any)

		const handler = await apiManager.getHandler(profileId)

		expect(providerSettingsManager.getProfile).toHaveBeenCalledWith({ id: profileId })
		expect(buildApiHandler).toHaveBeenCalledWith(config)
		expect(handler).toBe(mockHandler)
	})

	test("getHandler should return a cached handler", async () => {
		const profileId = "profile-1"
		const config: ProviderSettings & { name: string } = { name: "test", apiProvider: "anthropic" }
		const mockHandler = { getModel: () => ({ id: "test-model", info: {} }) }

		vi.mocked(providerSettingsManager.getProfile).mockResolvedValue(config)
		vi.mocked(buildApiHandler).mockReturnValue(mockHandler as any)

		// First call to cache the handler
		await apiManager.getHandler(profileId)

		// Clear mocks to ensure they are not called again
		vi.mocked(providerSettingsManager.getProfile).mockClear()
		vi.mocked(buildApiHandler).mockClear()

		// Second call should return the cached handler
		const handler = await apiManager.getHandler(profileId)

		expect(providerSettingsManager.getProfile).not.toHaveBeenCalled()
		expect(buildApiHandler).not.toHaveBeenCalled()
		expect(handler).toBe(mockHandler)
	})

	test("updateConfiguration should invalidate the handler", async () => {
		const profileId = "profile-1"
		const initialConfig: ProviderSettings & { name: string } = { name: "test", apiProvider: "anthropic" }
		const updatedConfig: ProviderSettings & { name: string } = { name: "test", apiProvider: "openai" }
		const initialHandler = { getModel: () => ({ id: "initial-model", info: {} }) }
		const updatedHandler = { getModel: () => ({ id: "updated-model", info: {} }) }

		// Initial setup
		vi.mocked(providerSettingsManager.getProfile).mockResolvedValue(initialConfig)
		vi.mocked(buildApiHandler).mockReturnValue(initialHandler as any)
		await apiManager.getHandler(profileId)

		// Update configuration
		apiManager.updateConfiguration(profileId, updatedConfig)

		// Setup for the next call
		vi.mocked(providerSettingsManager.getProfile).mockResolvedValue(updatedConfig)
		vi.mocked(buildApiHandler).mockReturnValue(updatedHandler as any)

		const handler = await apiManager.getHandler(profileId)

		expect(providerSettingsManager.getProfile).toHaveBeenCalledWith({ id: profileId })
		expect(buildApiHandler).toHaveBeenCalledWith(updatedConfig)
		expect(handler).toBe(updatedHandler)
		expect(handler).not.toBe(initialHandler)
	})

	test("getHandler should throw if ProviderSettingsManager is not set", async () => {
		// @ts-ignore
		apiManager.providerSettingsManager = undefined
		await expect(apiManager.getHandler("profile-1")).rejects.toThrow(
			"ProviderSettingsManager has not been set in ApiManager.",
		)
	})
})
