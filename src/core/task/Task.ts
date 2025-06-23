import * as path from "path"
import os from "os"
import crypto from "crypto"
import EventEmitter from "events"

import { Anthropic } from "@anthropic-ai/sdk"
import delay from "delay"
import pWaitFor from "p-wait-for"
import { serializeError } from "serialize-error"

import {
	type ProviderSettings,
	type TokenUsage,
	type ToolUsage,
	type ToolName,
	type ContextCondense,
	type ClineAsk,
	type ClineMessage,
	type ClineSay,
	type ToolProgressStatus,
	TelemetryEventName,
} from "@roo-code/types"
import { MessageStateHandler } from "./message-state"
import { TelemetryService } from "@roo-code/telemetry"
import { CloudService } from "@roo-code/cloud"

// api
import { ApiHandler, ApiHandlerCreateMessageMetadata, buildApiHandler } from "../../api"
import { ApiStream } from "../../api/transform/stream"

// shared
import { findLastIndex } from "../../shared/array"
import { combineApiRequests } from "../../shared/combineApiRequests"
import { combineCommandSequences } from "../../shared/combineCommandSequences"
import { t } from "../../i18n"
import { ClineApiReqCancelReason, ClineApiReqInfo } from "../../shared/ExtensionMessage"
import { getApiMetrics } from "../../shared/getApiMetrics"
import { ClineAskResponse } from "../../shared/WebviewMessage"
import { defaultModeSlug } from "../../shared/modes"
import { DiffStrategy } from "../../shared/tools"
import { EXPERIMENT_IDS, experiments } from "../../shared/experiments"

// services
import { UrlContentFetcher } from "../../services/browser/UrlContentFetcher"
import { BrowserSession } from "../../services/browser/BrowserSession"
import { McpHub } from "../../services/mcp/McpHub"
import { McpServerManager } from "../../services/mcp/McpServerManager"
import { RepoPerTaskCheckpointService } from "../../services/checkpoints"

// integrations
import { DiffViewProvider } from "../../integrations/editor/DiffViewProvider"
import { findToolName, formatContentBlockToMarkdown } from "../../integrations/misc/export-markdown"
import { RooTerminalProcess } from "../../integrations/terminal/types"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"

// utils
import { calculateApiCostAnthropic } from "../../shared/cost"
import { getWorkspacePath } from "../../utils/path"

// prompts
import { formatResponse } from "../prompts/responses"
import { SYSTEM_PROMPT } from "../prompts/system"

// core modules
import { ToolRepetitionDetector } from "../tools/ToolRepetitionDetector"
import { FileContextTracker } from "../context-tracking/FileContextTracker"
import { RooIgnoreController } from "../ignore/RooIgnoreController"
import { RooProtectedController } from "../protect/RooProtectedController"
import { type AssistantMessageContent, parseAssistantMessage, presentAssistantMessage } from "../assistant-message"
import { truncateConversationIfNeeded } from "../sliding-window"
import { ClineProvider } from "../webview/ClineProvider"
import { MultiSearchReplaceDiffStrategy } from "../diff/strategies/multi-search-replace"
import { MultiFileSearchReplaceDiffStrategy } from "../diff/strategies/multi-file-search-replace"
import { readApiMessages, saveApiMessages, readTaskMessages, saveTaskMessages, taskMetadata } from "../task-persistence"
import { getEnvironmentDetails } from "../environment/getEnvironmentDetails"
import {
	type CheckpointDiffOptions,
	type CheckpointRestoreOptions,
	getCheckpointService,
	checkpointSave,
	checkpointRestore,
	checkpointDiff,
} from "../checkpoints"
import { processUserContentMentions } from "../mentions/processUserContentMentions"
import { ApiMessage } from "../task-persistence/apiMessages"
import { TaskState } from "./TaskState"
import { getMessagesSinceLastSummary, summarizeConversation } from "../condense"
import { maybeRemoveImageBlocks } from "../../api/transform/image-cleaning"
import { type TaskItem, type TaskCreationOptions } from "./task-types"
export type { TaskCreationOptions } from "./task-types"

export type ClineEvents = {
	message: [{ action: "created" | "updated"; message: ClineMessage }]
	taskStarted: []
	taskModeSwitched: [taskId: string, mode: string]
	taskPaused: []
	taskUnpaused: []
	taskAskResponded: []
	taskAborted: []
	taskSpawned: [taskId: string]
	taskCompleted: [taskId: string, tokenUsage: TokenUsage, toolUsage: ToolUsage]
	taskTokenUsageUpdated: [taskId: string, tokenUsage: TokenUsage]
	taskToolFailed: [taskId: string, tool: ToolName, error: string]
}

export class Task extends EventEmitter<ClineEvents> {
	readonly taskId: string
	readonly instanceId: string

	readonly rootTask: Task | undefined = undefined
	readonly parentTask: Task | undefined = undefined
	readonly taskNumber: number
	readonly workspacePath: string
	public mode: string

	providerRef: WeakRef<ClineProvider>
	public readonly globalStoragePath: string
	state: TaskState

	// API
	readonly apiConfiguration: ProviderSettings
	api: ApiHandler
	private static lastGlobalApiRequestTime?: number

	/**
	 * Reset the global API request timestamp. This should only be used for testing.
	 * @internal
	 */
	static resetGlobalApiRequestTime(): void {
		Task.lastGlobalApiRequestTime = undefined
	}

	toolRepetitionDetector: ToolRepetitionDetector
	rooIgnoreController?: RooIgnoreController
	rooProtectedController?: RooProtectedController
	fileContextTracker: FileContextTracker
	urlContentFetcher: UrlContentFetcher
	terminalProcess?: RooTerminalProcess

	// Computer User
	browserSession: BrowserSession

	// Editing
	diffViewProvider: DiffViewProvider
	diffStrategy?: DiffStrategy
	diffEnabled: boolean = false
	fuzzyMatchThreshold: number

	// Task Management
	childTaskIds: string[] = []
	pendingChildTasks: { id: string; prompt: string; files: string[]; createdAt: number; mode?: string }[] = []
	activeChildTask?: Task

	// LLM Messages & Chat Messages
	messageStateHandler: MessageStateHandler

	// Ask

	// Tool Use
	consecutiveMistakeLimit: number
	consecutiveMistakeCountForApplyDiff: Map<string, number> = new Map()

	// Checkpoints
	enableCheckpoints: boolean
	checkpointService?: RepoPerTaskCheckpointService
	checkpointServiceInitializing = false

	constructor({
		provider,
		apiConfiguration,
		enableDiff = false,
		enableCheckpoints = true,
		fuzzyMatchThreshold = 1.0,
		consecutiveMistakeLimit = 3,
		task,
		images,
		files,
		historyItem,
		startTask = true,
		rootTask,
		parentTask,
		childTaskId,
		taskNumber = -1,
		onCreated,
		globalStoragePath,
		mode,
	}: TaskCreationOptions) {
		super()

		this.state = new TaskState()
		this.taskId = historyItem ? historyItem.id : (childTaskId ?? crypto.randomUUID())
		this.childTaskIds = historyItem?.childTaskIds ?? []
		this.pendingChildTasks = historyItem?.pendingChildTasks ?? []
		// normal use-case is usually retry similar history task with new workspace
		this.workspacePath = parentTask
			? parentTask.workspacePath
			: getWorkspacePath(path.join(os.homedir(), "Desktop"))
		this.instanceId = crypto.randomUUID().slice(0, 8)
		this.taskNumber = taskNumber

		this.mode = mode ?? parentTask?.mode ?? historyItem?.mode ?? defaultModeSlug
		this.rooIgnoreController = new RooIgnoreController(this.workspacePath)
		this.rooProtectedController = new RooProtectedController(this.workspacePath)
		this.fileContextTracker = new FileContextTracker(provider, this.taskId)

		this.rooIgnoreController.initialize().catch((error) => {
			console.error("Failed to initialize RooIgnoreController:", error)
		})

		this.apiConfiguration = apiConfiguration
		this.api = buildApiHandler(apiConfiguration)

		this.urlContentFetcher = new UrlContentFetcher(provider.context)
		this.browserSession = new BrowserSession(provider.context)
		this.diffEnabled = enableDiff
		this.fuzzyMatchThreshold = fuzzyMatchThreshold
		this.consecutiveMistakeLimit = consecutiveMistakeLimit
		this.providerRef = new WeakRef(provider)
		this.globalStoragePath = parentTask
			? parentTask.globalStoragePath
			: (globalStoragePath ?? provider.context.globalStorageUri.fsPath)
		if (!this.globalStoragePath) {
			throw new Error("globalStoragePath is required")
		}
		this.diffViewProvider = new DiffViewProvider(this.workspacePath)
		this.enableCheckpoints = enableCheckpoints

		this.rootTask = rootTask
		this.parentTask = parentTask

		this.messageStateHandler = new MessageStateHandler({
			context: provider.context,
			taskId: this.taskId,
			globalStoragePath: this.globalStoragePath,
			taskIsFavorited: historyItem?.isFavorited,
			updateTaskHistory: (item: TaskItem) => {
				// Set the workspace property on the existing object.
				item.workspace = this.workspacePath?.split(path.sep).join(path.posix.sep)
				return provider.updateTaskHistory(item)
			},
			getTaskInfo: () => {
				return {
					parentId: this.parentTask?.taskId,
					activeChildTaskId: this.activeChildTask?.taskId,
					status: this.state.isComplete ? "completed" : this.state.abort ? "failed" : "running",
					pendingChildTasks: this.pendingChildTasks,
					mode: this.mode,
					number: this.taskNumber,
					workspace: this.workspacePath?.split(path.sep).join(path.posix.sep),
					childTaskIds: this.childTaskIds,
				}
			},
		})

		if (historyItem) {
			TelemetryService.instance.captureTaskRestarted(this.taskId)
		} else {
			TelemetryService.instance.captureTaskCreated(this.taskId)
		}

		// Only set up diff strategy if diff is enabled
		if (this.diffEnabled) {
			// Default to old strategy, will be updated if experiment is enabled
			this.diffStrategy = new MultiSearchReplaceDiffStrategy(this.fuzzyMatchThreshold)

			// Check experiment asynchronously and update strategy if needed
			provider.getState().then((state) => {
				const isMultiFileApplyDiffEnabled = experiments.isEnabled(
					state.experiments ?? {},
					EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF,
				)

				if (isMultiFileApplyDiffEnabled) {
					this.diffStrategy = new MultiFileSearchReplaceDiffStrategy(this.fuzzyMatchThreshold)
				}
			})
		}

		this.toolRepetitionDetector = new ToolRepetitionDetector(this.consecutiveMistakeLimit)

		onCreated?.(this)

		if (!task && !historyItem && !images?.length && !files?.length) {
			throw new Error("Either historyItem or task/images/files must be provided")
		}
	}

	static create(options: TaskCreationOptions): [Task, Promise<void>] {
		const { images, task, files, historyItem } = options
		const instance = new Task({ ...options, startTask: false })
		let promise

		if (images || task || files) {
			promise = instance.startTask(task, images, files)
		} else if (historyItem) {
			// When resuming, a new instance is created with the same options.
			// The constructor handles the logic of resuming from the historyItem.
			const resumeInstance = new Task({ ...options, startTask: false })
			promise = resumeInstance.resumeTaskFromHistory()
			return [resumeInstance, promise]
		} else {
			// This is a new, empty task.
			promise = instance.initializeEmptyTask()
		}

		return [instance, promise]
	}

	// Note that `partial` has three valid states true (partial message),
	// false (completion of partial message), undefined (individual complete
	// message).
	async ask(
		type: ClineAsk,
		text?: string,
		partial?: boolean,
		progressStatus?: ToolProgressStatus,
		isProtected?: boolean,
	): Promise<{ response: ClineAskResponse; text?: string; images?: string[]; params?: Record<string, any> }> {
		// If this Cline instance was aborted by the provider, then the only
		// thing keeping us alive is a promise still running in the background,
		// in which case we don't want to send its result to the webview as it
		// is attached to a new instance of Cline now. So we can safely ignore
		// the result of any active promises, and this class will be
		// deallocated. (Although we set Cline = undefined in provider, that
		// simply removes the reference to this instance, but the instance is
		// still alive until this promise resolves or rejects.)
		if (this.state.abort) {
			throw new Error(`[RooCode#ask] task ${this.taskId}.${this.instanceId} aborted`)
		}

		let askTs: number

		if (partial !== undefined) {
			const lastMessage = this.messageStateHandler.getClineMessages().at(-1)

			const isUpdatingPreviousPartial =
				lastMessage && lastMessage.partial && lastMessage.type === "ask" && lastMessage.ask === type

			if (partial) {
				if (isUpdatingPreviousPartial) {
					// Existing partial message, so update it.
					lastMessage.text = text
					lastMessage.partial = partial
					lastMessage.progressStatus = progressStatus
					lastMessage.isProtected = isProtected
					// TODO: Be more efficient about saving and posting only new
					// data or one whole message at a time so ignore partial for
					// saves, and only post parts of partial message instead of
					// whole array in new listener.
					const lastMessageIndex = this.messageStateHandler.getClineMessages().length - 1
					this.messageStateHandler.updateClineMessage(lastMessageIndex, lastMessage)
					throw new Error("Current ask promise was ignored (#1)")
				} else {
					// This is a new partial message, so add it with partial
					// state.
					askTs = Date.now()
					this.state.lastMessageTs = askTs
					await this.messageStateHandler.addToClineMessages({
						ts: askTs,
						type: "ask",
						ask: type,
						text,
						partial,
						isProtected,
					})
					throw new Error("Current ask promise was ignored (#2)")
				}
			} else {
				if (isUpdatingPreviousPartial) {
					// This is the complete version of a previously partial
					// message, so replace the partial with the complete version.
					this.state.askResponse = undefined
					this.state.askResponseText = undefined
					this.state.askResponseImages = undefined
					this.state.askResponseParams = undefined

					// Bug for the history books:
					// In the webview we use the ts as the chatrow key for the
					// virtuoso list. Since we would update this ts right at the
					// end of streaming, it would cause the view to flicker. The
					// key prop has to be stable otherwise react has trouble
					// reconciling items between renders, causing unmounting and
					// remounting of components (flickering).
					// The lesson here is if you see flickering when rendering
					// lists, it's likely because the key prop is not stable.
					// So in this case we must make sure that the message ts is
					// never altered after first setting it.
					askTs = lastMessage.ts
					this.state.lastMessageTs = askTs
					lastMessage.text = text
					lastMessage.partial = false
					lastMessage.progressStatus = progressStatus
					lastMessage.isProtected = isProtected
					await this.messageStateHandler.saveClineMessagesAndUpdateHistory()
					const lastMessageIndex = this.messageStateHandler.getClineMessages().length - 1
					this.messageStateHandler.updateClineMessage(lastMessageIndex, lastMessage)
				} else {
					// This is a new and complete message, so add it like normal.
					this.state.askResponse = undefined
					this.state.askResponseText = undefined
					this.state.askResponseImages = undefined
					this.state.askResponseParams = undefined
					askTs = Date.now()
					this.state.lastMessageTs = askTs
					await this.messageStateHandler.addToClineMessages({
						ts: askTs,
						type: "ask",
						ask: type,
						text,
						isProtected,
					})
				}
			}
		} else {
			// This is a new non-partial message, so add it like normal.
			this.state.askResponse = undefined
			this.state.askResponseText = undefined
			this.state.askResponseImages = undefined
			this.state.askResponseParams = undefined
			askTs = Date.now()
			this.state.lastMessageTs = askTs
			await this.messageStateHandler.addToClineMessages({ ts: askTs, type: "ask", ask: type, text, isProtected })
		}

		await pWaitFor(() => this.state.askResponse !== undefined || this.state.lastMessageTs !== askTs, {
			interval: 100,
		})

		if (this.state.lastMessageTs !== askTs) {
			// Could happen if we send multiple asks in a row i.e. with
			// command_output. It's important that when we know an ask could
			// fail, it is handled gracefully.
			throw new Error("Current ask promise was ignored")
		}

		const result = {
			response: this.state.askResponse!,
			text: this.state.askResponseText,
			images: this.state.askResponseImages,
			params: this.state.askResponseParams,
		}
		this.state.askResponse = undefined
		this.state.askResponseText = undefined
		this.state.askResponseImages = undefined
		this.state.askResponseParams = undefined
		this.emit("taskAskResponded")
		return result
	}

	public async condenseContext(): Promise<void> {
		const systemPrompt = await this.getSystemPrompt()

		// Get condensing configuration
		// Using type assertion to handle the case where Phase 1 hasn't been implemented yet
		const state = await this.providerRef.deref()?.getState()
		const customCondensingPrompt = state ? (state as any).customCondensingPrompt : undefined
		const condensingApiConfigId = state ? (state as any).condensingApiConfigId : undefined
		const listApiConfigMeta = state ? (state as any).listApiConfigMeta : undefined

		// Determine API handler to use
		let condensingApiHandler: ApiHandler | undefined
		if (condensingApiConfigId && listApiConfigMeta && Array.isArray(listApiConfigMeta)) {
			// Using type assertion for the id property to avoid implicit any
			const matchingConfig = listApiConfigMeta.find((config: any) => config.id === condensingApiConfigId)
			if (matchingConfig) {
				const profile = await this.providerRef.deref()?.providerSettingsManager.getProfile({
					id: condensingApiConfigId,
				})
				// Ensure profile and apiProvider exist before trying to build handler
				if (profile && profile.apiProvider) {
					condensingApiHandler = buildApiHandler(profile)
				}
			}
		}

		const { contextTokens: prevContextTokens } = this.getTokenUsage()
		const {
			messages,
			summary,
			cost,
			newContextTokens = 0,
			error,
		} = await summarizeConversation(
			this.messageStateHandler.getApiConversationHistory(),
			this.api, // Main API handler (fallback)
			systemPrompt, // Default summarization prompt (fallback)
			this.taskId,
			prevContextTokens,
			false, // manual trigger
			customCondensingPrompt, // User's custom prompt
			condensingApiHandler, // Specific handler for condensing
		)
		if (error) {
			this.say(
				"condense_context_error",
				error,
				undefined /* images */,
				false /* partial */,
				undefined /* checkpoint */,
				undefined /* progressStatus */,
				{ isNonInteractive: true } /* options */,
			)
			return
		}
		await this.messageStateHandler.overwriteApiConversationHistory(messages)
		const contextCondense: ContextCondense = { summary, cost, newContextTokens, prevContextTokens }
		await this.say(
			"condense_context",
			undefined /* text */,
			undefined /* images */,
			false /* partial */,
			undefined /* checkpoint */,
			undefined /* progressStatus */,
			{ isNonInteractive: true } /* options */,
			contextCondense,
		)
	}

	async handleWebviewAskResponse(
		askResponse: ClineAskResponse,
		text?: string,
		images?: string[],
		params?: Record<string, any>,
	) {
		this.state.askResponse = askResponse
		this.state.askResponseText = text
		this.state.askResponseImages = images
		this.state.askResponseParams = params
	}

	async handleTerminalOperation(terminalOperation: "continue" | "abort") {
		if (terminalOperation === "continue") {
			this.terminalProcess?.continue()
		} else if (terminalOperation === "abort") {
			this.terminalProcess?.abort()
		}
	}

	async say(
		type: ClineSay,
		text?: string,
		images?: string[],
		partial?: boolean,
		checkpoint?: Record<string, unknown>,
		progressStatus?: ToolProgressStatus,
		options: {
			isNonInteractive?: boolean
		} = {},
		contextCondense?: ContextCondense,
	): Promise<undefined> {
		if (this.state.abort) {
			throw new Error(`[RooCode#say] task ${this.taskId}.${this.instanceId} aborted`)
		}

		if (partial !== undefined) {
			const lastMessage = this.messageStateHandler.getClineMessages().at(-1)

			const isUpdatingPreviousPartial =
				lastMessage && lastMessage.partial && lastMessage.type === "say" && lastMessage.say === type

			if (partial) {
				if (isUpdatingPreviousPartial) {
					// Existing partial message, so update it.
					lastMessage.text = text
					lastMessage.images = images
					lastMessage.partial = partial
					lastMessage.progressStatus = progressStatus
					const lastMessageIndex = this.messageStateHandler.getClineMessages().length - 1
					this.messageStateHandler.updateClineMessage(lastMessageIndex, lastMessage)
				} else {
					// This is a new partial message, so add it with partial state.
					const sayTs = Date.now()

					if (!options.isNonInteractive) {
						this.state.lastMessageTs = sayTs
					}

					await this.messageStateHandler.addToClineMessages({
						ts: sayTs,
						type: "say",
						say: type,
						text,
						images,
						partial,
						contextCondense,
					})
				}
			} else {
				// New now have a complete version of a previously partial message.
				// This is the complete version of a previously partial
				// message, so replace the partial with the complete version.
				if (isUpdatingPreviousPartial) {
					if (!options.isNonInteractive) {
						this.state.lastMessageTs = lastMessage.ts
					}

					lastMessage.text = text
					lastMessage.images = images
					lastMessage.partial = false
					lastMessage.progressStatus = progressStatus

					// Instead of streaming partialMessage events, we do a save
					// and post like normal to persist to disk.
					await this.messageStateHandler.saveClineMessagesAndUpdateHistory()

					// More performant than an entire `postStateToWebview`.
					const lastMessageIndex = this.messageStateHandler.getClineMessages().length - 1
					this.messageStateHandler.updateClineMessage(lastMessageIndex, lastMessage)
				} else {
					// This is a new and complete message, so add it like normal.
					const sayTs = Date.now()

					if (!options.isNonInteractive) {
						this.state.lastMessageTs = sayTs
					}

					await this.messageStateHandler.addToClineMessages({
						ts: sayTs,
						type: "say",
						say: type,
						text,
						images,
						contextCondense,
					})
				}
			}
		} else {
			// This is a new non-partial message, so add it like normal.
			const sayTs = Date.now()

			// A "non-interactive" message is a message is one that the user
			// does not need to respond to. We don't want these message types
			// to trigger an update to `lastMessageTs` since they can be created
			// asynchronously and could interrupt a pending ask.
			if (!options.isNonInteractive) {
				this.state.lastMessageTs = sayTs
			}

			await this.messageStateHandler.addToClineMessages({
				ts: sayTs,
				type: "say",
				say: type,
				text,
				images,
				checkpoint,
				contextCondense,
			})
		}
	}

	async sayAndCreateMissingParamError(toolName: ToolName, paramName: string, relPath?: string) {
		await this.say(
			"error",
			`Roo tried to use ${toolName}${
				relPath ? ` for '${relPath.toPosix()}'` : ""
			} without value for required parameter '${paramName}'. Retrying...`,
		)
		return formatResponse.toolError(formatResponse.missingToolParameterError(paramName))
	}

	public async initializeEmptyTask(): Promise<void> {
		this.messageStateHandler.setClineMessages([])
		this.messageStateHandler.setApiConversationHistory([])

		// Manually save empty message arrays to their respective files
		// without updating the global history, which was causing the loop.
		await saveTaskMessages({
			messages: [],
			taskId: this.taskId,
			globalStoragePath: this.globalStoragePath,
		})
		await saveApiMessages({
			messages: [],
			taskId: this.taskId,
			globalStoragePath: this.globalStoragePath,
		})

		// The webview state will be updated by the ClineProvider after the task is added to the stack.
		this.state.isInitialized = true
	}

	// Start / Abort / Resume

	public async startTask(task?: string, images?: string[], files?: string[]): Promise<void> {
		// `conversationHistory` (for API) and `clineMessages` (for webview)
		// need to be in sync.
		// If the extension process were killed, then on restart the
		// `clineMessages` might not be empty, so we need to set it to [] when
		// we create a new Cline client (otherwise webview would show stale
		// messages from previous session).
		this.messageStateHandler.setClineMessages([])
		this.messageStateHandler.setApiConversationHistory([])
		await this.providerRef.deref()?.postStateToWebview()

		const fileMentions = files?.map((f) => `@[${f}]`).join(" ") || ""
		const taskText = `${task || ""} ${fileMentions}`.trim()

		await this.say("text", taskText, images)
		this.state.isInitialized = true

		let imageBlocks: Anthropic.ImageBlockParam[] = formatResponse.imageBlocks(images)

		console.log(`[task] task ${this.taskId}.${this.instanceId} starting`)

		this.initiateTaskLoop([
			{
				type: "text",
				text: `<task>\n${taskText}\n</task>`,
			},
			...imageBlocks,
		]).catch((error) => {
			console.error(`Task loop failed for task ${this.taskId}`, error)
			this.say("error", `Task failed with error: ${error.message}`)
		})
	}

	public async resumePausedTask(lastMessage: string, childTaskNumber?: number) {
		// Release this Cline instance from paused state.
		this.state.isPaused = false
		this.emit("taskUnpaused")

		// Fake an answer from the subtask that it has completed running and
		// this is the result of what it has done  add the message to the chat
		// history and to the webview ui.
		try {
			const payload = JSON.stringify({ result: lastMessage, taskNumber: childTaskNumber })
			// Use a "subtask_result" message for the UI to ensure it's displayed correctly.
			await this.say("subtask_result", payload)

			// Format the message to the API as a tool result, so the parent task
			// continues its execution loop instead of terminating.
			await this.messageStateHandler.addToApiConversationHistory({
				role: "user",
				content: [{ type: "text", text: `[subtask_result]\n${lastMessage}` }],
			})
		} catch (error) {
			this.providerRef
				.deref()
				?.log(`Error failed to add reply from subtask into conversation of parent task, error: ${error}`)

			throw error
		}
	}

	private async resumeTaskFromHistory() {
		await this.messageStateHandler.loadMessagesFromHistory(this.globalStoragePath)

		// Remove any resume messages that may have been added before
		const modifiedClineMessages = this.messageStateHandler.getClineMessages()
		const lastRelevantMessageIndex = findLastIndex(
			modifiedClineMessages,
			(m: any) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"),
		)

		if (lastRelevantMessageIndex !== -1) {
			modifiedClineMessages.splice(lastRelevantMessageIndex + 1)
		}

		// since we don't use api_req_finished anymore, we need to check if the last api_req_started has a cost value, if it doesn't and no cancellation reason to present, then we remove it since it indicates an api request without any partial content streamed
		const lastApiReqStartedIndex = findLastIndex(
			modifiedClineMessages,
			(m: any) => m.type === "say" && m.say === "api_req_started",
		)

		if (lastApiReqStartedIndex !== -1) {
			const lastApiReqStarted = modifiedClineMessages[lastApiReqStartedIndex]
			const { cost, cancelReason }: ClineApiReqInfo = JSON.parse(lastApiReqStarted.text || "{}")
			if (cost === undefined && cancelReason === undefined) {
				modifiedClineMessages.splice(lastApiReqStartedIndex, 1)
			}
		}

		await this.messageStateHandler.overwriteClineMessages(modifiedClineMessages)

		// Now present the cline messages to the user and ask if they want to
		// resume (NOTE: we ran into a bug before where the
		// apiConversationHistory wouldn't be initialized when opening a old
		// task, and it was because we were waiting for resume).
		// This is important in case the user deletes messages without resuming
		// the task first.
		await this.messageStateHandler.loadApiMessagesFromHistory(this.globalStoragePath)

		const lastClineMessage = this.messageStateHandler
			.getClineMessages()
			.slice()
			.reverse()
			.find((m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task")) // could be multiple resume tasks

		let askType: ClineAsk
		if (lastClineMessage?.ask === "completion_result") {
			askType = "resume_completed_task"
		} else {
			askType = "resume_task"
		}

		this.state.isInitialized = true

		const { response, text, images } = await this.ask(askType) // calls poststatetowebview
		let responseText: string | undefined
		let responseImages: string[] | undefined
		if (response === "messageResponse") {
			await this.say("user_feedback", text, images)
			responseText = text
			responseImages = images
		}

		// Make sure that the api conversation history can be resumed by the API,
		// even if it goes out of sync with cline messages.
		let existingApiConversationHistory: ApiMessage[] = await readApiMessages({
			taskId: this.taskId,
			globalStoragePath: this.globalStoragePath,
		})

		// v2.0 xml tags refactor caveat: since we don't use tools anymore, we need to replace all tool use blocks with a text block since the API disallows conversations with tool uses and no tool schema
		const conversationWithoutToolBlocks = existingApiConversationHistory.map((message) => {
			if (Array.isArray(message.content)) {
				const newContent = message.content.map((block) => {
					if (block.type === "tool_use") {
						// It's important we convert to the new tool schema
						// format so the model doesn't get confused about how to
						// invoke tools.
						const inputAsXml = Object.entries(block.input as Record<string, string>)
							.map(([key, value]) => `<${key}>\n${value}\n</${key}>`)
							.join("\n")
						return {
							type: "text",
							text: `<${block.name}>\n${inputAsXml}\n</${block.name}>`,
						} as Anthropic.Messages.TextBlockParam
					} else if (block.type === "tool_result") {
						// Convert block.content to text block array, removing images
						const contentAsTextBlocks = Array.isArray(block.content)
							? block.content.filter((item) => item.type === "text")
							: [{ type: "text", text: block.content }]
						const textContent = contentAsTextBlocks.map((item) => item.text).join("\n\n")
						const toolName = findToolName(block.tool_use_id, existingApiConversationHistory)
						return {
							type: "text",
							text: `[${toolName} Result]\n\n${textContent}`,
						} as Anthropic.Messages.TextBlockParam
					}
					return block
				})
				return { ...message, content: newContent }
			}
			return message
		})
		existingApiConversationHistory = conversationWithoutToolBlocks

		// FIXME: remove tool use blocks altogether

		// if the last message is an assistant message, we need to check if there's tool use since every tool use has to have a tool response
		// if there's no tool use and only a text block, then we can just add a user message
		// (note this isn't relevant anymore since we use custom tool prompts instead of tool use blocks, but this is here for legacy purposes in case users resume old tasks)

		// if the last message is a user message, we can need to get the assistant message before it to see if it made tool calls, and if so, fill in the remaining tool responses with 'interrupted'

		let modifiedOldUserContent: Anthropic.Messages.ContentBlockParam[] // either the last message if its user message, or the user message before the last (assistant) message
		let modifiedApiConversationHistory: ApiMessage[] // need to remove the last user message to replace with new modified user message
		if (existingApiConversationHistory.length > 0) {
			const lastMessage = existingApiConversationHistory[existingApiConversationHistory.length - 1]

			if (lastMessage.role === "assistant") {
				const content = Array.isArray(lastMessage.content)
					? lastMessage.content
					: [{ type: "text", text: lastMessage.content }]
				const hasToolUse = content.some((block) => block.type === "tool_use")

				if (hasToolUse) {
					const toolUseBlocks = content.filter(
						(block) => block.type === "tool_use",
					) as Anthropic.Messages.ToolUseBlock[]
					const toolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
						type: "tool_result",
						tool_use_id: block.id,
						content: "Task was interrupted before this tool call could be completed.",
					}))
					modifiedApiConversationHistory = [...existingApiConversationHistory] // no changes
					modifiedOldUserContent = [...toolResponses]
				} else {
					modifiedApiConversationHistory = [...existingApiConversationHistory]
					modifiedOldUserContent = []
				}
			} else if (lastMessage.role === "user") {
				const previousAssistantMessage: ApiMessage | undefined =
					existingApiConversationHistory[existingApiConversationHistory.length - 2]

				const existingUserContent: Anthropic.Messages.ContentBlockParam[] = Array.isArray(lastMessage.content)
					? lastMessage.content
					: [{ type: "text", text: lastMessage.content }]
				if (previousAssistantMessage && previousAssistantMessage.role === "assistant") {
					const assistantContent = Array.isArray(previousAssistantMessage.content)
						? previousAssistantMessage.content
						: [{ type: "text", text: previousAssistantMessage.content }]

					const toolUseBlocks = assistantContent.filter(
						(block) => block.type === "tool_use",
					) as Anthropic.Messages.ToolUseBlock[]

					if (toolUseBlocks.length > 0) {
						const existingToolResults = existingUserContent.filter(
							(block) => block.type === "tool_result",
						) as Anthropic.ToolResultBlockParam[]

						const missingToolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks
							.filter(
								(toolUse) => !existingToolResults.some((result) => result.tool_use_id === toolUse.id),
							)
							.map((toolUse) => ({
								type: "tool_result",
								tool_use_id: toolUse.id,
								content: "Task was interrupted before this tool call could be completed.",
							}))

						modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1) // removes the last user message
						modifiedOldUserContent = [...existingUserContent, ...missingToolResponses]
					} else {
						modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
						modifiedOldUserContent = [...existingUserContent]
					}
				} else {
					modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
					modifiedOldUserContent = [...existingUserContent]
				}
			} else {
				throw new Error("Unexpected: Last message is not a user or assistant message")
			}
		} else {
			throw new Error("Unexpected: No existing API conversation history")
		}

		let newUserContent: Anthropic.Messages.ContentBlockParam[] = [...modifiedOldUserContent]

		const agoText = ((): string => {
			const timestamp = lastClineMessage?.ts ?? Date.now()
			const now = Date.now()
			const diff = now - timestamp
			const minutes = Math.floor(diff / 60000)
			const hours = Math.floor(minutes / 60)
			const days = Math.floor(hours / 24)

			if (days > 0) {
				return `${days} day${days > 1 ? "s" : ""} ago`
			}
			if (hours > 0) {
				return `${hours} hour${hours > 1 ? "s" : ""} ago`
			}
			if (minutes > 0) {
				return `${minutes} minute${minutes > 1 ? "s" : ""} ago`
			}
			return "just now"
		})()

		const lastTaskResumptionIndex = newUserContent.findIndex(
			(x) => x.type === "text" && x.text.startsWith("[TASK RESUMPTION]"),
		)
		if (lastTaskResumptionIndex !== -1) {
			newUserContent.splice(lastTaskResumptionIndex, newUserContent.length - lastTaskResumptionIndex)
		}

		const wasRecent = lastClineMessage?.ts && Date.now() - lastClineMessage.ts < 30_000

		newUserContent.push({
			type: "text",
			text:
				`[TASK RESUMPTION] This task was interrupted ${agoText}. It may or may not be complete, so please reassess the task context. Be aware that the project state may have changed since then. If the task has not been completed, retry the last step before interruption and proceed with completing the task.\n\nNote: If you previously attempted a tool use that the user did not provide a result for, you should assume the tool use was not successful and assess whether you should retry. If the last tool was a browser_action, the browser has been closed and you must launch a new browser if needed.${
					wasRecent
						? "\n\nIMPORTANT: If the last tool use was a write_to_file that was interrupted, the file was reverted back to its original state before the interrupted edit, and you do NOT need to re-read the file as you already have its up-to-date contents."
						: ""
				}` +
				(responseText
					? `\n\nNew instructions for task continuation:\n<user_message>\n${responseText}\n</user_message>`
					: ""),
		})

		if (responseImages && responseImages.length > 0) {
			newUserContent.push(...formatResponse.imageBlocks(responseImages))
		}

		await this.messageStateHandler.overwriteApiConversationHistory(modifiedApiConversationHistory)

		console.log(`[history] task ${this.taskId}.${this.instanceId} resuming from history item`)

		this.initiateTaskLoop(newUserContent).catch((error) => {
			console.error(`Resumed task loop failed for task ${this.taskId}:`, error)
			this.say("error", `Task failed with error: ${error.message}`)
		})
	}

	public dispose(): void {
		// Release any terminals associated with this task.
		try {
			// Release any terminals associated with this task.
			TerminalRegistry.releaseTerminalsForTask(this.taskId)
		} catch (error) {
			console.error("Error releasing terminals:", error)
		}

		try {
			this.urlContentFetcher.closeBrowser()
		} catch (error) {
			console.error("Error closing URL content fetcher browser:", error)
		}

		try {
			this.browserSession.closeBrowser()
		} catch (error) {
			console.error("Error closing browser session:", error)
		}

		try {
			if (this.rooIgnoreController) {
				this.rooIgnoreController.dispose()
				this.rooIgnoreController = undefined
			}
		} catch (error) {
			console.error("Error disposing RooIgnoreController:", error)
			// This is the critical one for the leak fix
		}

		try {
			this.fileContextTracker.dispose()
		} catch (error) {
			console.error("Error disposing file context tracker:", error)
		}

		try {
			// If we're not streaming then `abortStream` won't be called
			if (this.state.isStreaming && this.diffViewProvider.isEditing) {
				this.diffViewProvider.revertChanges().catch(console.error)
			}
		} catch (error) {
			console.error("Error reverting diff changes:", error)
		}
	}

	public async abortTask(save = false) {
		if (this.state.abort) {
			return // Task is already aborted, do nothing.
		}
		console.log(`[task] aborting task ${this.taskId}.${this.instanceId}`)

		// Will stop any autonomously running promises.
		if (save) {
			this.state.isComplete = true // Status: completed
		} else {
			this.state.abandoned = true
		}

		this.state.abort = true
		this.emit("taskAborted")

		// Immediately save the final state to history
		await this.messageStateHandler.saveClineMessagesAndUpdateHistory()

		try {
			this.dispose() // Call the centralized dispose method
		} catch (error) {
			console.error(`Error during task ${this.taskId}.${this.instanceId} disposal:`, error)
			// Don't rethrow - we want abort to always succeed
		}
	}

	// Task Loop

	private async initiateTaskLoop(userContent: Anthropic.Messages.ContentBlockParam[]): Promise<void> {
		// Kicks off the checkpoints initialization process in the background.
		getCheckpointService(this)

		let nextUserContent = userContent
		let includeFileDetails = true

		this.emit("taskStarted")

		while (!this.state.abort) {
			const didEndLoop = await this.recursivelyMakeClineRequests(nextUserContent, includeFileDetails)
			includeFileDetails = false // we only need file details the first time

			// The way this agentic loop works is that cline will be given a
			// task that he then calls tools to complete. Unless there's an
			// attempt_completion call, we keep responding back to him with his
			// tool's responses until he either attempt_completion or does not
			// use anymore tools. If he does not use anymore tools, we ask him
			// to consider if he's completed the task and then call
			// attempt_completion, otherwise proceed with completing the task.
			// There is a MAX_REQUESTS_PER_TASK limit to prevent infinite
			// requests, but Cline is prompted to finish the task as efficiently
			// as he can.

			if (didEndLoop) {
				// For now a task never 'completes'. This will only happen if
				// the user hits max requests and denies resetting the count.
				break
			} else {
				nextUserContent = [{ type: "text", text: formatResponse.noToolsUsed() }]
				this.state.consecutiveMistakeCount++
			}
		}

		this.abortTask(true)
	}

	public async recursivelyMakeClineRequests(
		userContent: Anthropic.Messages.ContentBlockParam[],
		includeFileDetails: boolean = false,
	): Promise<boolean> {
		if (this.state.abort) {
			throw new Error(`[RooCode#recursivelyMakeRooRequests] task ${this.taskId}.${this.instanceId} aborted`)
		}

		if (this.state.consecutiveMistakeCount >= this.consecutiveMistakeLimit) {
			const { response, text, images } = await this.ask(
				"mistake_limit_reached",
				t("common:errors.mistake_limit_guidance"),
			)

			if (response === "messageResponse") {
				userContent.push(
					...[
						{ type: "text" as const, text: formatResponse.tooManyMistakes(text) },
						...formatResponse.imageBlocks(images),
					],
				)

				await this.say("user_feedback", text, images)

				// Track consecutive mistake errors in telemetry.
				TelemetryService.instance.captureConsecutiveMistakeError(this.taskId)
			}

			this.state.consecutiveMistakeCount = 0
		}

		// In this Cline request loop, we need to check if this task instance
		// has been asked to wait for a subtask to finish before continuing.
		const provider = this.providerRef.deref()

		if (this.state.isPaused && provider) {
			provider.log(`[subtasks] paused ${this.taskId}.${this.instanceId}`)
			// No longer need to wait for resume, the provider will handle it
			provider.log(`[subtasks] resumed ${this.taskId}.${this.instanceId}`)
			const currentMode = (await provider.getState())?.mode ?? defaultModeSlug

			if (currentMode !== this.state.pausedModeSlug) {
				// The mode has changed, we need to switch back to the paused mode.
				await provider.handleModeSwitch(this.state.pausedModeSlug)

				// Delay to allow mode change to take effect before next tool is executed.
				await delay(500)

				provider.log(
					`[subtasks] task ${this.taskId}.${this.instanceId} has switched back to '${this.state.pausedModeSlug}' from '${currentMode}'`,
				)
			}
		}

		// Getting verbose details is an expensive operation, it uses ripgrep to
		// top-down build file structure of project which for large projects can
		// take a few seconds. For the best UX we show a placeholder api_req_started
		// message with a loading spinner as this happens.
		await this.say(
			"api_req_started",
			JSON.stringify({
				request:
					userContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n") + "\n\nLoading...",
			}),
		)

		const { showRooIgnoredFiles = true } = (await this.providerRef.deref()?.getState()) ?? {}

		const parsedUserContent = await processUserContentMentions({
			userContent,
			cwd: this.workspacePath,
			urlContentFetcher: this.urlContentFetcher,
			fileContextTracker: this.fileContextTracker,
			rooIgnoreController: this.rooIgnoreController,
			showRooIgnoredFiles,
		})

		const environmentDetails = await getEnvironmentDetails(this, includeFileDetails)

		// Add environment details as its own text block, separate from tool
		// results.
		const finalUserContent = [...parsedUserContent, { type: "text" as const, text: environmentDetails }]

		await this.messageStateHandler.addToApiConversationHistory({ role: "user", content: finalUserContent })
		TelemetryService.instance.captureConversationMessage(this.taskId, "user")

		// Since we sent off a placeholder api_req_started message to update the
		// webview while waiting to actually start the API request (to load
		// potential details for example), we need to update the text of that
		// message.
		const lastApiReqIndex = findLastIndex(
			this.messageStateHandler.getClineMessages(),
			(m: any) => m.say === "api_req_started",
		)

		this.messageStateHandler.updateClineMessage(lastApiReqIndex, {
			text: JSON.stringify({
				request: finalUserContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n"),
			} satisfies ClineApiReqInfo),
		})

		await this.messageStateHandler.saveClineMessagesAndUpdateHistory()
		await provider?.postStateToWebview()

		try {
			let cacheWriteTokens = 0
			let cacheReadTokens = 0
			let inputTokens = 0
			let outputTokens = 0
			let totalCost: number | undefined

			// We can't use `api_req_finished` anymore since it's a unique case
			// where it could come after a streaming message (i.e. in the middle
			// of being updated or executed).
			// Fortunately `api_req_finished` was always parsed out for the GUI
			// anyways, so it remains solely for legacy purposes to keep track
			// of prices in tasks from history (it's worth removing a few months
			// from now).
			const updateApiReqMsg = (cancelReason?: ClineApiReqCancelReason, streamingFailedMessage?: string) => {
				const clineMessages = this.messageStateHandler.getClineMessages()
				this.messageStateHandler.updateClineMessage(lastApiReqIndex, {
					text: JSON.stringify({
						...JSON.parse(clineMessages[lastApiReqIndex].text || "{}"),
						tokensIn: inputTokens,
						tokensOut: outputTokens,
						cacheWrites: cacheWriteTokens,
						cacheReads: cacheReadTokens,
						cost:
							totalCost ??
							calculateApiCostAnthropic(
								this.api.getModel().info,
								inputTokens,
								outputTokens,
								cacheWriteTokens,
								cacheReadTokens,
							),
						cancelReason,
						streamingFailedMessage,
					} satisfies ClineApiReqInfo),
				})
			}

			const abortStream = async (cancelReason: ClineApiReqCancelReason, streamingFailedMessage?: string) => {
				if (this.diffViewProvider.isEditing) {
					await this.diffViewProvider.revertChanges() // closes diff view
				}

				// if last message is a partial we need to update and save it
				const lastMessage = this.messageStateHandler.getClineMessages().at(-1)

				if (lastMessage && lastMessage.partial) {
					// lastMessage.ts = Date.now() DO NOT update ts since it is used as a key for virtuoso list
					lastMessage.partial = false
					// instead of streaming partialMessage events, we do a save and post like normal to persist to disk
					console.log("updating partial message", lastMessage)
					// await this.saveClineMessages()
				}

				// Let assistant know their response was interrupted for when task is resumed
				await this.messageStateHandler.addToApiConversationHistory({
					role: "assistant",
					content: [
						{
							type: "text",
							text:
								assistantMessage +
								`\n\n[${
									cancelReason === "streaming_failed"
										? "Response interrupted by API Error"
										: "Response interrupted by user"
								}]`,
						},
					],
				})

				// Update `api_req_started` to have cancelled and cost, so that
				// we can display the cost of the partial stream.
				updateApiReqMsg(cancelReason, streamingFailedMessage)
				await this.messageStateHandler.saveClineMessagesAndUpdateHistory()

				// Signals to provider that it can retrieve the saved messages
				// from disk, as abortTask can not be awaited on in nature.
				this.state.didFinishAbortingStream = true
			}

			// Reset streaming state.
			this.state.currentStreamingContentIndex = 0
			this.state.assistantMessageContent = []
			this.state.didCompleteReadingStream = false
			this.state.userMessageContent = []
			this.state.userMessageContentReady = false
			this.state.didRejectTool = false
			this.state.didAlreadyUseTool = false
			this.state.presentAssistantMessageLocked = false
			this.state.presentAssistantMessageHasPendingUpdates = false

			await this.diffViewProvider.reset()

			// Yields only if the first chunk is successful, otherwise will
			// allow the user to retry the request (most likely due to rate
			// limit error, which gets thrown on the first chunk).
			const stream = this.attemptApiRequest()
			let assistantMessage = ""
			let reasoningMessage = ""
			this.state.isStreaming = true

			try {
				for await (const chunk of stream) {
					if (!chunk) {
						// Sometimes chunk is undefined, no idea that can cause
						// it, but this workaround seems to fix it.
						continue
					}

					switch (chunk.type) {
						case "reasoning":
							reasoningMessage += chunk.text
							await this.say("reasoning", reasoningMessage, undefined, true)
							break
						case "usage":
							inputTokens += chunk.inputTokens
							outputTokens += chunk.outputTokens
							cacheWriteTokens += chunk.cacheWriteTokens ?? 0
							cacheReadTokens += chunk.cacheReadTokens ?? 0
							totalCost = chunk.totalCost
							break
						case "text": {
							assistantMessage += chunk.text

							// Parse raw assistant message into content blocks.
							const prevLength = this.state.assistantMessageContent.length
							this.state.assistantMessageContent = parseAssistantMessage(assistantMessage)

							if (this.state.assistantMessageContent.length > prevLength) {
								// New content we need to present, reset to
								// false in case previous content set this to true.
								this.state.userMessageContentReady = false
							}

							// Present content to user.
							presentAssistantMessage(this)
							break
						}
					}

					if (this.state.abort) {
						console.log(`aborting stream, this.state.abandoned = ${this.state.abandoned}`)

						if (!this.state.abandoned) {
							// Only need to gracefully abort if this instance
							// isn't abandoned (sometimes OpenRouter stream
							// hangs, in which case this would affect future
							// instances of Cline).
							await abortStream("user_cancelled")
						}

						break // Aborts the stream.
					}

					if (this.state.didRejectTool) {
						// `userContent` has a tool rejection, so interrupt the
						// assistant's response to present the user's feedback.
						assistantMessage += "\n\n[Response interrupted by user feedback]"
						// Instead of setting this preemptively, we allow the
						// present iterator to finish and set
						// userMessageContentReady when its ready.
						// this.state.userMessageContentReady = true
						break
					}

					// PREV: We need to let the request finish for openrouter to
					// get generation details.
					// UPDATE: It's better UX to interrupt the request at the
					// cost of the API cost not being retrieved.
					if (this.state.didAlreadyUseTool) {
						assistantMessage +=
							"\n\n[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]"
						break
					}
				}
			} catch (error) {
				// Abandoned happens when extension is no longer waiting for the
				// Cline instance to finish aborting (error is thrown here when
				// any function in the for loop throws due to this.state.abort).
				if (!this.state.abandoned) {
					// If the stream failed, there's various states the task
					// could be in (i.e. could have streamed some tools the user
					// may have executed), so we just resort to replicating a
					// cancel task.
					this.abortTask()

					await abortStream(
						"streaming_failed",
						error.message ?? JSON.stringify(serializeError(error), null, 2),
					)

					const history = await provider?.getTaskWithId(this.taskId)

					if (history) {
						await provider?.initClineWithHistoryItem(history.historyItem)
					}
				}
			} finally {
				this.state.isStreaming = false
			}

			if (inputTokens > 0 || outputTokens > 0 || cacheWriteTokens > 0 || cacheReadTokens > 0) {
				TelemetryService.instance.captureLlmCompletion(this.taskId, {
					inputTokens,
					outputTokens,
					cacheWriteTokens,
					cacheReadTokens,
					cost:
						totalCost ??
						calculateApiCostAnthropic(
							this.api.getModel().info,
							inputTokens,
							outputTokens,
							cacheWriteTokens,
							cacheReadTokens,
						),
				})
			}

			// Need to call here in case the stream was aborted.
			if (this.state.abort || this.state.abandoned) {
				throw new Error(`[RooCode#recursivelyMakeRooRequests] task ${this.taskId}.${this.instanceId} aborted`)
			}

			this.state.didCompleteReadingStream = true

			// Set any blocks to be complete to allow `presentAssistantMessage`
			// to finish and set `userMessageContentReady` to true.
			// (Could be a text block that had no subsequent tool uses, or a
			// text block at the very end, or an invalid tool use, etc. Whatever
			// the case, `presentAssistantMessage` relies on these blocks either
			// to be completed or the user to reject a block in order to proceed
			// and eventually set userMessageContentReady to true.)
			const partialBlocks = this.state.assistantMessageContent.filter((block) => block.partial)
			partialBlocks.forEach((block) => (block.partial = false))

			// Can't just do this b/c a tool could be in the middle of executing.
			// this.state.assistantMessageContent.forEach((e) => (e.partial = false))

			if (partialBlocks.length > 0) {
				// If there is content to update then it will complete and
				// update `this.state.userMessageContentReady` to true, which we
				// `pWaitFor` before making the next request. All this is really
				// doing is presenting the last partial message that we just set
				// to complete.
				presentAssistantMessage(this)
			}

			updateApiReqMsg()
			await this.messageStateHandler.saveClineMessagesAndUpdateHistory()
			await this.providerRef.deref()?.postStateToWebview()

			// Now add to apiConversationHistory.
			// Need to save assistant responses to file before proceeding to
			// tool use since user can exit at any moment and we wouldn't be
			// able to save the assistant's response.
			let didEndLoop = false

			if (assistantMessage.length > 0) {
				await this.messageStateHandler.addToApiConversationHistory({
					role: "assistant",
					content: [{ type: "text", text: assistantMessage }],
				})

				TelemetryService.instance.captureConversationMessage(this.taskId, "assistant")

				// NOTE: This comment is here for future reference - this was a
				// workaround for `userMessageContent` not getting set to true.
				// It was due to it not recursively calling for partial blocks
				// when `didRejectTool`, so it would get stuck waiting for a
				// partial block to complete before it could continue.
				// In case the content blocks finished it may be the api stream
				// finished after the last parsed content block was executed, so
				// we are able to detect out of bounds and set
				// `userMessageContentReady` to true (note you should not call
				// `presentAssistantMessage` since if the last block i
				//  completed it will be presented again).
				// const completeBlocks = this.state.assistantMessageContent.filter((block) => !block.partial) // If there are any partial blocks after the stream ended we can consider them invalid.
				// if (this.state.currentStreamingContentIndex >= completeBlocks.length) {
				// 	this.state.userMessageContentReady = true
				// }

				await pWaitFor(() => this.state.userMessageContentReady)

				// If the model did not tool use, then we need to tell it to
				// either use a tool or attempt_completion.
				const didToolUse = this.state.assistantMessageContent.some((block) => block.type === "tool_use")

				if (!didToolUse) {
					this.state.userMessageContent.push({ type: "text", text: formatResponse.noToolsUsed() })
					this.state.consecutiveMistakeCount++
				}

				const recDidEndLoop = await this.recursivelyMakeClineRequests(this.state.userMessageContent)
				didEndLoop = recDidEndLoop
			} else {
				// If there's no assistant_responses, that means we got no text
				// or tool_use content blocks from API which we should assume is
				// an error.
				await this.say(
					"error",
					"Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output.",
				)

				await this.messageStateHandler.addToApiConversationHistory({
					role: "assistant",
					content: [{ type: "text", text: "Failure: I did not provide a response." }],
				})
			}

			return didEndLoop // Will always be false for now.
		} catch (error) {
			// This should never happen since the only thing that can throw an
			// error is the attemptApiRequest, which is wrapped in a try catch
			// that sends an ask where if noButtonClicked, will clear current
			// task and destroy this instance. However to avoid unhandled
			// promise rejection, we will end this loop which will end execution
			// of this instance (see `startTask`).
			return true // Needs to be true so parent loop knows to end task.
		}
	}

	private async getSystemPrompt(): Promise<string> {
		const { mcpEnabled } = (await this.providerRef.deref()?.getState()) ?? {}
		let mcpHub: McpHub | undefined
		if (mcpEnabled ?? true) {
			const provider = this.providerRef.deref()

			if (!provider) {
				throw new Error("Provider reference lost during view transition")
			}

			// Wait for MCP hub initialization through McpServerManager
			mcpHub = await McpServerManager.getInstance(provider.context, provider)

			if (!mcpHub) {
				throw new Error("Failed to get MCP hub from server manager")
			}

			// Wait for MCP servers to be connected before generating system prompt
			await pWaitFor(() => !mcpHub!.isConnecting, { timeout: 10_000 }).catch(() => {
				console.error("MCP servers failed to connect in time")
			})
		}

		const rooIgnoreInstructions = this.rooIgnoreController?.getInstructions()

		const state = await this.providerRef.deref()?.getState()

		const {
			browserViewportSize,
			mode,
			customModes,
			customModePrompts,
			customInstructions,
			experiments,
			enableMcpServerCreation,
			browserToolEnabled,
			language,
			maxConcurrentFileReads,
			maxReadFileLine,
		} = state ?? {}

		return await (async () => {
			const provider = this.providerRef.deref()

			if (!provider) {
				throw new Error("Provider not available")
			}

			return SYSTEM_PROMPT(
				provider.context,
				this.workspacePath,
				(this.api.getModel().info.supportsComputerUse ?? false) && (browserToolEnabled ?? true),
				mcpHub,
				this.diffStrategy,
				browserViewportSize,
				mode,
				customModePrompts,
				customModes,
				customInstructions,
				this.diffEnabled,
				experiments,
				enableMcpServerCreation,
				language,
				rooIgnoreInstructions,
				maxReadFileLine !== -1,
				{
					maxConcurrentFileReads,
				},
			)
		})()
	}

	public async *attemptApiRequest(retryAttempt: number = 0): ApiStream {
		const state = await this.providerRef.deref()?.getState()
		const {
			apiConfiguration,
			autoApprovalEnabled,
			alwaysApproveResubmit,
			requestDelaySeconds,
			mode,
			autoCondenseContext = true,
			autoCondenseContextPercent = 100,
			profileThresholds = {},
		} = state ?? {}

		// Get condensing configuration for automatic triggers
		const customCondensingPrompt = state?.customCondensingPrompt
		const condensingApiConfigId = state?.condensingApiConfigId
		const listApiConfigMeta = state?.listApiConfigMeta

		// Determine API handler to use for condensing
		let condensingApiHandler: ApiHandler | undefined
		if (condensingApiConfigId && listApiConfigMeta && Array.isArray(listApiConfigMeta)) {
			// Using type assertion for the id property to avoid implicit any
			const matchingConfig = listApiConfigMeta.find((config: any) => config.id === condensingApiConfigId)
			if (matchingConfig) {
				const profile = await this.providerRef.deref()?.providerSettingsManager.getProfile({
					id: condensingApiConfigId,
				})
				// Ensure profile and apiProvider exist before trying to build handler
				if (profile && profile.apiProvider) {
					condensingApiHandler = buildApiHandler(profile)
				}
			}
		}

		let rateLimitDelay = 0

		// Use the shared timestamp so that subtasks respect the same rate-limit
		// window as their parent tasks.
		if (Task.lastGlobalApiRequestTime) {
			const now = Date.now()
			const timeSinceLastRequest = now - Task.lastGlobalApiRequestTime
			const rateLimit = apiConfiguration?.rateLimitSeconds || 0
			rateLimitDelay = Math.ceil(Math.max(0, rateLimit * 1000 - timeSinceLastRequest) / 1000)
		}

		// Only show rate limiting message if we're not retrying. If retrying, we'll include the delay there.
		if (rateLimitDelay > 0 && retryAttempt === 0) {
			// Show countdown timer
			for (let i = rateLimitDelay; i > 0; i--) {
				const delayMessage = `Rate limiting for ${i} seconds...`
				await this.say("api_req_retry_delayed", delayMessage, undefined, true)
				await delay(1000)
			}
		}

		// Update last request time before making the request so that subsequent
		// requests — even from new subtasks — will honour the provider's rate-limit.
		Task.lastGlobalApiRequestTime = Date.now()

		const systemPrompt = await this.getSystemPrompt()
		const { contextTokens } = this.getTokenUsage()

		if (contextTokens) {
			// Default max tokens value for thinking models when no specific
			// value is set.
			const DEFAULT_THINKING_MODEL_MAX_TOKENS = 16_384

			const modelInfo = this.api.getModel().info

			const maxTokens = modelInfo.supportsReasoningBudget
				? this.apiConfiguration.modelMaxTokens || DEFAULT_THINKING_MODEL_MAX_TOKENS
				: modelInfo.maxTokens

			const contextWindow = modelInfo.contextWindow

			const truncateResult = await truncateConversationIfNeeded({
				messages: this.messageStateHandler.getApiConversationHistory(),
				totalTokens: contextTokens,
				maxTokens,
				contextWindow,
				apiHandler: this.api,
				autoCondenseContext,
				autoCondenseContextPercent,
				systemPrompt,
				taskId: this.taskId,
				customCondensingPrompt,
				condensingApiHandler,
				profileThresholds,
				currentProfileId: state?.currentApiConfigName || "default",
			})
			if (truncateResult.messages !== this.messageStateHandler.getApiConversationHistory()) {
				await this.messageStateHandler.overwriteApiConversationHistory(truncateResult.messages)
			}
			if (truncateResult.error) {
				await this.say("condense_context_error", truncateResult.error)
			} else if (truncateResult.summary) {
				const { summary, cost, prevContextTokens, newContextTokens = 0 } = truncateResult
				const contextCondense: ContextCondense = { summary, cost, newContextTokens, prevContextTokens }
				await this.say(
					"condense_context",
					undefined /* text */,
					undefined /* images */,
					false /* partial */,
					undefined /* checkpoint */,
					undefined /* progressStatus */,
					{ isNonInteractive: true } /* options */,
					contextCondense,
				)
			}
		}

		const messagesSinceLastSummary = getMessagesSinceLastSummary(
			this.messageStateHandler.getApiConversationHistory(),
		)
		const cleanConversationHistory = maybeRemoveImageBlocks(messagesSinceLastSummary, this.api).map(
			({ role, content }) => ({ role, content }),
		)

		// Check if we've reached the maximum number of auto-approved requests
		const maxRequests = state?.allowedMaxRequests || Infinity

		// Increment the counter for each new API request
		this.state.consecutiveAutoApprovedRequestsCount++

		if (this.state.consecutiveAutoApprovedRequestsCount > maxRequests) {
			const { response } = await this.ask("auto_approval_max_req_reached", JSON.stringify({ count: maxRequests }))
			// If we get past the promise, it means the user approved and did not start a new task
			if (response === "yesButtonClicked") {
				this.state.consecutiveAutoApprovedRequestsCount = 0
			}
		}

		const metadata: ApiHandlerCreateMessageMetadata = {
			mode: mode,
			taskId: this.taskId,
		}

		const stream = this.api.createMessage(systemPrompt, cleanConversationHistory, metadata)
		const iterator = stream[Symbol.asyncIterator]()

		try {
			// Awaiting first chunk to see if it will throw an error.
			this.state.isWaitingForFirstChunk = true
			const firstChunk = await iterator.next()
			yield firstChunk.value
			this.state.isWaitingForFirstChunk = false
		} catch (error) {
			this.state.isWaitingForFirstChunk = false
			// note that this api_req_failed ask is unique in that we only present this option if the api hasn't streamed any content yet (ie it fails on the first chunk due), as it would allow them to hit a retry button. However if the api failed mid-stream, it could be in any arbitrary state where some tools may have executed, so that error is handled differently and requires cancelling the task entirely.
			if (autoApprovalEnabled && alwaysApproveResubmit) {
				let errorMsg

				if (error.error?.metadata?.raw) {
					errorMsg = JSON.stringify(error.error.metadata.raw, null, 2)
				} else if (error.message) {
					errorMsg = error.message
				} else {
					errorMsg = "Unknown error"
				}

				const baseDelay = requestDelaySeconds || 5
				let exponentialDelay = Math.ceil(baseDelay * Math.pow(2, retryAttempt))

				// If the error is a 429, and the error details contain a retry delay, use that delay instead of exponential backoff
				if (error.status === 429) {
					const geminiRetryDetails = error.errorDetails?.find(
						(detail: any) => detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
					)
					if (geminiRetryDetails) {
						const match = geminiRetryDetails?.retryDelay?.match(/^(\d+)s$/)
						if (match) {
							exponentialDelay = Number(match[1]) + 1
						}
					}
				}

				// Wait for the greater of the exponential delay or the rate limit delay
				const finalDelay = Math.max(exponentialDelay, rateLimitDelay)

				// Show countdown timer with exponential backoff
				for (let i = finalDelay; i > 0; i--) {
					await this.say(
						"api_req_retry_delayed",
						`${errorMsg}\n\nRetry attempt ${retryAttempt + 1}\nRetrying in ${i} seconds...`,
						undefined,
						true,
					)
					await delay(1000)
				}

				await this.say(
					"api_req_retry_delayed",
					`${errorMsg}\n\nRetry attempt ${retryAttempt + 1}\nRetrying now...`,
					undefined,
					false,
				)

				// Delegate generator output from the recursive call with
				// incremented retry count.
				yield* this.attemptApiRequest(retryAttempt + 1)

				return
			} else {
				const { response } = await this.ask(
					"api_req_failed",
					error.message ?? JSON.stringify(serializeError(error), null, 2),
				)

				if (response !== "yesButtonClicked") {
					// This will never happen since if noButtonClicked, we will
					// clear current task, aborting this instance.
					throw new Error("API request failed")
				}

				await this.say("api_req_retried")

				// Delegate generator output from the recursive call.
				yield* this.attemptApiRequest()
				return
			}
		}

		// No error, so we can continue to yield all remaining chunks.
		// (Needs to be placed outside of try/catch since it we want caller to
		// handle errors not with api_req_failed as that is reserved for first
		// chunk failures only.)
		// This delegates to another generator or iterable object. In this case,
		// it's saying "yield all remaining values from this iterator". This
		// effectively passes along all subsequent chunks from the original
		// stream.
		yield* iterator
	}

	// Checkpoints

	public async checkpointSave(force: boolean = false) {
		return checkpointSave(this, force)
	}

	public async checkpointRestore(options: CheckpointRestoreOptions) {
		return checkpointRestore(this, options)
	}

	public async checkpointDiff(options: CheckpointDiffOptions) {
		return checkpointDiff(this, options)
	}

	// Metrics

	public combineMessages(messages: ClineMessage[]) {
		return combineApiRequests(combineCommandSequences(messages))
	}

	public getTokenUsage(): TokenUsage {
		return getApiMetrics(this.combineMessages(this.messageStateHandler.getClineMessages().slice(1)))
	}

	public recordToolUsage(toolName: ToolName) {
		if (!this.state.toolUsage[toolName]) {
			this.state.toolUsage[toolName] = { attempts: 0, failures: 0 }
		}

		this.state.toolUsage[toolName].attempts++
	}

	public recordToolError(toolName: ToolName, error?: string) {
		if (!this.state.toolUsage[toolName]) {
			this.state.toolUsage[toolName] = { attempts: 0, failures: 0 }
		}

		this.state.toolUsage[toolName].failures++

		if (error) {
			this.emit("taskToolFailed", this.taskId, toolName, error)
		}
	}

	// Getters

	public getTaskInfo() {
		return {
			taskId: this.taskId,
			parentId: this.parentTask?.taskId,
			childTaskIds: this.childTaskIds,
			status: this.state.isComplete
				? "completed"
				: this.state.isPaused
					? "paused"
					: this.state.abort
						? "failed"
						: "running",
			activeChildTaskId: this.activeChildTask?.taskId,
			pendingChildTasks: this.pendingChildTasks,
		}
	}

	public isPaused(): boolean {
		return this.state.isPaused
	}

	// Child Task Management
	public async promotePendingChildToRunning(childId: string): Promise<void> {
		const index = this.pendingChildTasks.findIndex((task) => task.id === childId)
		if (index > -1) {
			this.pendingChildTasks.splice(index, 1)
		}

		if (!this.childTaskIds.includes(childId)) {
			this.childTaskIds.push(childId)
		}

		await this.messageStateHandler.saveClineMessagesAndUpdateHistory()
	}

	public async executeNewChildTaskTool(
		tasks: { prompt: string; files?: string[]; mode?: string }[],
		executeImmediately = false,
	): Promise<Task | void> {
		let stateModified = false
		for (const task of tasks) {
			const newTaskId = crypto.randomUUID()
			this.pendingChildTasks.push({
				id: newTaskId,
				prompt: task.prompt,
				files: task.files ?? [],
				createdAt: Date.now(),
				mode: task.mode,
			})
			this.childTaskIds.push(newTaskId)
			stateModified = true
		}

		if (stateModified) {
			await this.messageStateHandler.saveClineMessagesAndUpdateHistory()
		}

		if (executeImmediately) {
			return await this.startNextChildTask()
		}
	}

	public async startNextChildTaskTool(): Promise<void> {
		if (this.pendingChildTasks.length > 0) {
			await this.startNextChildTask()
		} else {
			await this.say("text", "No pending child tasks to start.")
		}
	}

	public async viewPendingTasksTool(): Promise<void> {
		if (this.pendingChildTasks.length === 0) {
			await this.say("text", "There are no pending tasks.")
			return
		}

		const pendingTaskList = this.pendingChildTasks.map((task, index) => `${index + 1}. ${task.prompt}`).join("\n")

		await this.say("text", `Pending Tasks:\n${pendingTaskList}`)
	}

	private async startNextChildTask(): Promise<Task | void> {
		if (this.activeChildTask || this.pendingChildTasks.length === 0) {
			return
		}

		const nextTaskInfo = this.pendingChildTasks.shift()
		if (!nextTaskInfo) return

		const provider = this.providerRef.deref()
		if (!provider) {
			console.error("Provider not available to start child task")
			return
		}

		const childTask = await provider.initClineWithSubTask(
			this,
			nextTaskInfo.prompt,
			nextTaskInfo.files,
			nextTaskInfo.mode,
			nextTaskInfo.id,
		)
		this.activeChildTask = childTask

		this.state.isPaused = true
		this.state.pausedModeSlug = this.mode
		this.emit("taskPaused")
		return childTask
	}

	private getTaskCreationOptions(): TaskCreationOptions {
		return {
			provider: this.providerRef.deref()!,
			apiConfiguration: this.apiConfiguration,
			enableDiff: this.diffEnabled,
			enableCheckpoints: this.enableCheckpoints,
			fuzzyMatchThreshold: this.fuzzyMatchThreshold,
			consecutiveMistakeLimit: this.consecutiveMistakeLimit,
			globalStoragePath: this.globalStoragePath,
			workspace: this.workspacePath,
		}
	}
}
