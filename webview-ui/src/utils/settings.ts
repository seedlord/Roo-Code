import { type ProviderName } from "@roo-code/types"
import { type RouterName } from "@roo/api"

export const getModelSettingsKey = (
	provider: ProviderName | RouterName | undefined,
	modelId: string | undefined,
): string | undefined => {
	if (!provider || !modelId) {
		return undefined
	}
	return `${provider}:${modelId}`
}
