import { type ProviderSettings } from "@roo-code/types"
import { type ApiHandler, buildApiHandler } from "./index"
import { ProviderSettingsManager } from "../core/config/ProviderSettingsManager"

/**
 * Manages API handler instances to ensure that configuration changes
 * are reflected in real-time for ongoing tasks.
 */
export class ApiManager {
	private static instance: ApiManager
	private handlers: Map<string, ApiHandler> = new Map()
	private configs: Map<string, ProviderSettings> = new Map()
	private providerSettingsManager?: ProviderSettingsManager

	private constructor() {}

	/**
	 * Returns the singleton instance of the ApiManager.
	 */
	public static getInstance(): ApiManager {
		if (!ApiManager.instance) {
			ApiManager.instance = new ApiManager()
		}
		return ApiManager.instance
	}

	/**
	 * Injects the ProviderSettingsManager dependency.
	 */
	public setProviderSettingsManager(manager: ProviderSettingsManager) {
		this.providerSettingsManager = manager
	}

	/**
	 * Retrieves or creates an API handler for a given profile ID.
	 * If the configuration for the profile is outdated or the handler
	 * doesn't exist, a new one is created.
	 *
	 * @param profileId The ID of the configuration profile.
	 * @return A promise that resolves to the ApiHandler for the profile.
	 */
	public async getHandler(profileId: string): Promise<ApiHandler> {
		const cachedHandler = this.handlers.get(profileId)
		// If handler exists for the profile, return it
		if (cachedHandler) {
			return cachedHandler
		}
		// Otherwise create a new one
		if (!this.providerSettingsManager) {
			throw new Error("ProviderSettingsManager has not been set in ApiManager.")
		}

		const config = await this.providerSettingsManager.getProfile({ id: profileId })
		this.configs.set(profileId, config)

		const newHandler = buildApiHandler(config)
		this.handlers.set(profileId, newHandler)
		return newHandler
	}

	/**
	 * Updates the configuration for a profile and invalidates its handler.
	 *
	 * @param profileId The ID of the configuration profile to update.
	 * @param config The new configuration settings for the profile.
	 */
	public updateConfiguration(profileId: string, config: ProviderSettings) {
		this.configs.set(profileId, config)
		this.handlers.delete(profileId) // Invalidate handler
	}
}
