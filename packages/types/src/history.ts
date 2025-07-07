import { z } from "zod"

/**
 * HistoryItem
 */

import { clineMessageSchema } from "./message.js"
import { providerNamesSchema } from "./provider-settings.js"

export const historyItemSchema = z.object({
	id: z.string(),
	number: z.number(),
	ts: z.number(),
	task: z.string(),
	tokensIn: z.number(),
	tokensOut: z.number(),
	cacheWrites: z.number().optional(),
	cacheReads: z.number().optional(),
	totalCost: z.number(),
	contextTokens: z.number().optional(),
	modelId: z.string().optional(),
	apiProvider: providerNamesSchema.optional(),
	contextWindow: z.number().optional(),
	size: z.number().optional(),
	workspace: z.string().optional(),
	history: z.array(clineMessageSchema).optional(),
	scrollToMessageTs: z.number().optional(),
})

export type HistoryItem = z.infer<typeof historyItemSchema>
