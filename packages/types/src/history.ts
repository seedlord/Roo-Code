import { z } from "zod"

/**
 * HistoryItem
 */

import { clineMessageSchema } from "./message.js"

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
	size: z.number().optional(),
	workspace: z.string().optional(),
	history: z.array(clineMessageSchema).optional(),
	scrollToMessageTs: z.number().optional(),
})

export type HistoryItem = z.infer<typeof historyItemSchema>
