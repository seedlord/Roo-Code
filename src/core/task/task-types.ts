import { ProviderSettings } from "@roo-code/types"
import { Task } from "./Task"
import { ClineProvider } from "../webview/ClineProvider"

// Define interfaces for task data structures, replacing proto-generated types.

export interface TaskItem {
	id: string
	parentId?: string
	childTaskIds?: string[]
	status?: "pending" | "running" | "paused" | "completed" | "failed"
	activeChildTaskId?: string
	pendingChildTasks?: Array<{
		id: string
		prompt: string
		files: string[]
		createdAt: number
	}>
	// Add other fields derived from .proto files or Task.ts logic
	ts: number // Timestamp for ordering
	task: string // Task description
	tokensIn: number
	tokensOut: number
	cacheWrites: number
	cacheReads: number
	totalCost: number
	size: number // Task directory size
	shadowGitConfigWorkTree?: string // Path to shadow git config work tree
	cwdOnTaskInitialization?: string // Working directory at task initialization
	conversationHistoryDeletedRange?: [number, number] // Range of deleted conversation history
	isFavorited?: boolean // Whether the task is favorited
	number: number // Task number
	workspace?: string
}

export interface NewChildTaskParams {
	childTaskPrompt: string
	childTaskFiles?: string[]
	executeImmediately?: boolean
}

export type StartNextChildTaskParams = Record<string, never>

export type ViewPendingTasksParams = Record<string, never>

export interface TaskCreationOptions {
	provider: ClineProvider
	apiConfiguration: ProviderSettings
	enableDiff?: boolean
	enableCheckpoints?: boolean
	fuzzyMatchThreshold?: number
	consecutiveMistakeLimit?: number
	experiments?: Record<string, boolean>
	task?: string
	images?: string[]
	files?: string[]
	historyItem?: TaskItem // Use the new TaskItem interface
	startTask?: boolean
	rootTask?: Task
	parentTask?: Task
	childTaskId?: string
	taskNumber?: number
	onCreated?: (cline: Task) => void
	globalStoragePath: string
	workspace?: string
}
