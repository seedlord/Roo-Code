import { Anthropic } from "@anthropic-ai/sdk"
import { AssistantMessageContent } from "../assistant-message"
import { ClineAskResponse } from "../../shared/WebviewMessage"
import { ToolUsage } from "@roo-code/types"
import { defaultModeSlug } from "../../shared/modes"

export class TaskState {
	// Streaming flags
	isStreaming = false
	isWaitingForFirstChunk = false
	didCompleteReadingStream = false

	// Content processing
	currentStreamingContentIndex = 0
	assistantMessageContent: AssistantMessageContent[] = []
	userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
	userMessageContentReady = false

	// Presentation locks
	presentAssistantMessageLocked = false
	presentAssistantMessageHasPendingUpdates = false

	// Claude 4 experimental JSON streaming
	// streamingJsonReplacer?: StreamingJsonReplacer
	// lastProcessedJsonLength: number = 0

	// Ask/Response handling
	askResponse?: ClineAskResponse
	askResponseText?: string
	askResponseImages?: string[]
	askResponseFiles?: string[]
	lastMessageTs?: number

	// Plan mode specific state
	isAwaitingPlanResponse = false
	didRespondToPlanAskBySwitchingMode = false

	// Tool execution flags
	didRejectTool = false
	didAlreadyUseTool = false
	didEditFile: boolean = false

	// Consecutive request tracking
	consecutiveAutoApprovedRequestsCount: number = 0

	// Error tracking
	consecutiveMistakeCount: number = 0
	didAutomaticallyRetryFailedApiRequest = false
	checkpointTrackerErrorMessage?: string

	// Task Initialization
	isInitialized = false

	// Task Abort / Cancellation
	abort: boolean = false
	didFinishAbortingStream = false
	abandoned = false
	isComplete: boolean = false

	// Pause state
	isPaused: boolean = false
	pausedModeSlug: string = defaultModeSlug
	pauseInterval: NodeJS.Timeout | undefined

	// Tool usage
	toolUsage: ToolUsage = {}
}
