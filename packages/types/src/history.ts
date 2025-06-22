import { z } from "zod"

/**
 * HistoryItem
 */

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
	shadowGitConfigWorkTree: z.string().optional(),
	cwdOnTaskInitialization: z.string().optional(),
	parentId: z.string().optional(),
	childTaskIds: z.array(z.string()).optional(),
	status: z.enum(["pending", "running", "paused", "completed", "failed"]).optional(),
	activeChildTaskId: z.string().optional(),
	pendingChildTasks: z
		.array(
			z.object({
				id: z.string(),
				prompt: z.string(),
				files: z.array(z.string()).optional(),
				createdAt: z.number(),
			}),
		)
		.optional(),
	conversationHistoryDeletedRange: z.array(z.number()).optional(),
	isFavorited: z.boolean().optional(),
})

export type HistoryItem = z.infer<typeof historyItemSchema>
