import { memo, useMemo, useRef, useState } from "react"
import { useWindowSize } from "react-use"
import { useTranslation } from "react-i18next"
import { VSCodeBadge } from "@vscode/webview-ui-toolkit/react"
import { CloudUpload, CloudDownload, FoldVertical } from "lucide-react"

import type { ClineMessage, HistoryItem } from "@roo-code/types"

import { getModelMaxOutputTokens } from "@roo/api"

import { formatLargeNumber } from "@src/utils/format"
import { cn } from "@src/lib/utils"
import { Button } from "@src/components/ui"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useSelectedModel } from "@/components/ui/hooks/useSelectedModel"
// import { TaskServiceClient } from "@src/services/grpc-client"

import Thumbnails from "../../common/Thumbnails"
import HeroTooltip from "../../common/HeroTooltip"

import { TaskActions } from "../TaskActions"
import { ContextWindowProgress } from "../ContextWindowProgress"
import { Mention } from "../Mention"
import TaskTimeline from "./TaskTimeline"
import { TaskHierarchy } from "./TaskHierarchy"

export interface TaskHeaderProps {
	task: ClineMessage
	tokensIn: number
	tokensOut: number
	doesModelSupportPromptCache: boolean
	cacheWrites?: number
	cacheReads?: number
	totalCost: number
	contextTokens: number
	buttonsDisabled: boolean
	handleCondenseContext: (taskId: string) => void
	onClose: () => void
	onScrollToMessage?: (messageIndex: number) => void
	currentTaskItem?: HistoryItem
}

const TaskHeader = ({
	task,
	tokensIn,
	tokensOut,
	doesModelSupportPromptCache,
	cacheWrites,
	cacheReads,
	totalCost,
	contextTokens,
	buttonsDisabled,
	handleCondenseContext,
	onClose,
	onScrollToMessage,
}: TaskHeaderProps) => {
	const { t } = useTranslation()
	const { apiConfiguration, currentTaskItem, clineMessages, taskHistory } = useExtensionState()
	const { id: modelId, info: model } = useSelectedModel(apiConfiguration)
	const [isTaskExpanded, setIsTaskExpanded] = useState(false)

	const childTasks = useMemo(() => {
		if (!currentTaskItem) {
			return []
		}

		// 1. Create a map of all tasks for quick O(1) access.
		const taskMap = new Map<string, HistoryItem>()
		taskHistory.forEach((task) => {
			taskMap.set(task.id, task)
		})

		// 2. Get the list of child IDs directly from the parent task. This is the "source of truth".
		const childIds = currentTaskItem.childTaskIds || []

		// 3. Reconstruct the list of initialized children by looking up the IDs.
		const childrenFromIds = childIds.map((id) => taskMap.get(id)).filter((task): task is HistoryItem => !!task)

		// 4. Add pending children and deduplicate.
		const finalTaskMap = new Map<string, HistoryItem>()
		childrenFromIds.forEach((task) => finalTaskMap.set(task.id, task))

		const pendingChildren = currentTaskItem.pendingChildTasks || []
		pendingChildren.forEach((pendingTaskInfo) => {
			if (!finalTaskMap.has(pendingTaskInfo.id)) {
				finalTaskMap.set(pendingTaskInfo.id, {
					id: pendingTaskInfo.id,
					ts: pendingTaskInfo.createdAt,
					task: pendingTaskInfo.prompt,
					status: "pending" as const,
					parentId: currentTaskItem.id,
					tokensIn: 0,
					tokensOut: 0,
					totalCost: 0,
					number: 0,
				} as HistoryItem)
			}
		})

		// 5. Convert the map back to an array and sort with status priority.
		const statusOrder: Record<string, number> = {
			running: 1,
			paused: 2,
			pending: 3,
			completed: 4,
			failed: 5,
			unknown: 6,
		}

		return Array.from(finalTaskMap.values()).sort((a, b) => {
			const statusA = a.status || "unknown"
			const statusB = b.status || "unknown"
			const orderA = statusOrder[statusA] || 99
			const orderB = statusOrder[statusB] || 99

			if (orderA !== orderB) {
				return orderA - orderB
			}

			// If statuses are the same, sort by timestamp (oldest first)
			return a.ts - b.ts
		})
	}, [taskHistory, currentTaskItem])

	const textContainerRef = useRef<HTMLDivElement>(null)
	const textRef = useRef<HTMLDivElement>(null)
	const contextWindow = model?.contextWindow || 1

	const { width: windowWidth } = useWindowSize()

	const condenseButton = (
		<button
			title={t("chat:task.condenseContext")}
			disabled={buttonsDisabled}
			onClick={() => currentTaskItem && handleCondenseContext(currentTaskItem.id)}
			className="shrink-0 min-h-[20px] min-w-[20px] p-[2px] cursor-pointer disabled:cursor-not-allowed opacity-85 hover:opacity-100 bg-transparent border-none rounded-md">
			<FoldVertical size={16} />
		</button>
	)

	const shouldShowPromptCacheInfo = () => {
		return (
			doesModelSupportPromptCache &&
			((cacheReads !== undefined && cacheReads > 0) || (cacheWrites !== undefined && cacheWrites > 0))
		)
	}

	return (
		<div className="py-2 px-3">
			<div
				className={cn(
					"rounded-xs p-2.5 flex flex-col gap-1.5 relative z-1 border",
					isTaskExpanded
						? "border-vscode-panel-border text-vscode-foreground"
						: "border-vscode-panel-border/80 text-vscode-foreground/80",
				)}>
				<div className="flex justify-between items-center gap-2">
					<div
						className="flex items-center cursor-pointer -ml-0.5 select-none grow min-w-0"
						onClick={() => setIsTaskExpanded(!isTaskExpanded)}>
						<div className="flex items-center shrink-0">
							<span className={`codicon codicon-chevron-${isTaskExpanded ? "down" : "right"}`}></span>
						</div>
						<div className="ml-1.5 whitespace-nowrap overflow-hidden text-ellipsis grow min-w-0">
							<span className="font-bold">
								{t("chat:task.title")}
								{!isTaskExpanded && ":"}
							</span>
							{!isTaskExpanded && (
								<span className="ml-1">
									<Mention text={task.text} />
								</span>
							)}
						</div>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={onClose}
						title={t("chat:task.closeAndStart")}
						className="shrink-0 w-5 h-5">
						<span className="codicon codicon-close" />
					</Button>
				</div>
				{/* Collapsed state: Track context and cost if we have any */}
				{!isTaskExpanded && contextWindow > 0 && (
					<div className={`w-full flex flex-row items-center gap-1 h-auto`}>
						<ContextWindowProgress
							contextWindow={contextWindow}
							contextTokens={contextTokens || 0}
							maxTokens={
								model
									? getModelMaxOutputTokens({ modelId, model, settings: apiConfiguration })
									: undefined
							}
						/>
						{condenseButton}
						{!!totalCost && <VSCodeBadge>${totalCost.toFixed(2)}</VSCodeBadge>}
					</div>
				)}
				{/* Expanded state: Show task text and images */}
				{isTaskExpanded && (
					<>
						<div
							ref={textContainerRef}
							className="-mt-0.5 text-vscode-font-size overflow-y-auto break-words break-anywhere relative">
							<div
								ref={textRef}
								className="overflow-auto max-h-80 whitespace-pre-wrap break-words break-anywhere"
								style={{
									display: "-webkit-box",
									WebkitLineClamp: "unset",
									WebkitBoxOrient: "vertical",
								}}>
								<Mention text={task.text} />
							</div>
						</div>
						{task.images && task.images.length > 0 && <Thumbnails images={task.images} />}

						<div className="flex flex-col gap-1">
							{isTaskExpanded && contextWindow > 0 && (
								<div
									className={`w-full flex ${windowWidth < 400 ? "flex-col" : "flex-row"} gap-1 h-auto`}>
									<div className="flex items-center gap-1 flex-shrink-0">
										<span className="font-bold" data-testid="context-window-label">
											{t("chat:task.contextWindow")}
										</span>
									</div>
									<ContextWindowProgress
										contextWindow={contextWindow}
										contextTokens={contextTokens || 0}
										maxTokens={
											model
												? getModelMaxOutputTokens({
														modelId,
														model,
														settings: apiConfiguration,
													})
												: undefined
										}
									/>
									{condenseButton}
								</div>
							)}
							<div className="flex justify-between items-center h-[20px]">
								<div className="flex items-center gap-1 flex-wrap">
									<span className="font-bold">{t("chat:task.tokens")}</span>
									{typeof tokensIn === "number" && tokensIn > 0 && (
										<HeroTooltip content="Prompt Tokens">
											<span className="flex items-center gap-0.5 cursor-pointer">
												<i className="codicon codicon-arrow-up text-xs font-bold" />
												{formatLargeNumber(tokensIn)}
											</span>
										</HeroTooltip>
									)}
									{typeof tokensOut === "number" && tokensOut > 0 && (
										<HeroTooltip content="Completion Tokens">
											<span className="flex items-center gap-0.5 cursor-pointer">
												<i className="codicon codicon-arrow-down text-xs font-bold" />
												{formatLargeNumber(tokensOut)}
											</span>
										</HeroTooltip>
									)}
								</div>
								{!totalCost && <TaskActions item={currentTaskItem} buttonsDisabled={buttonsDisabled} />}
							</div>
							<div className="flex flex-col">
								<TaskTimeline messages={clineMessages} onBlockClick={onScrollToMessage} />
								{currentTaskItem && (
									<TaskHierarchy childTasks={childTasks} isTaskExpanded={isTaskExpanded} />
								)}
							</div>
							{/* {checkpointTrackerErrorMessage && (
								<div className="text-vscode-errorForeground text-xs">{checkpointTrackerErrorMessage}</div>
							)} */}
							{shouldShowPromptCacheInfo() && (
								<div className="flex justify-between items-center h-[20px]">
									<div className="flex items-center gap-1 flex-wrap">
										<span className="font-bold">{t("chat:task.cache")}</span>
										{typeof cacheWrites === "number" && cacheWrites > 0 && (
											<HeroTooltip content="Tokens written to cache">
												<span className="flex items-center gap-0.5 cursor-pointer">
													<CloudUpload size={16} />
													{formatLargeNumber(cacheWrites)}
												</span>
											</HeroTooltip>
										)}
										{typeof cacheReads === "number" && cacheReads > 0 && (
											<HeroTooltip content="Tokens read from cache">
												<span className="flex items-center gap-0.5 cursor-pointer">
													<CloudDownload size={16} />
													{formatLargeNumber(cacheReads)}
												</span>
											</HeroTooltip>
										)}
									</div>
									<TaskActions item={currentTaskItem} buttonsDisabled={buttonsDisabled} />
								</div>
							)}

							{!!totalCost && (
								<div className="flex justify-between items-center h-[20px]">
									<div className="flex items-center gap-1">
										<span className="font-bold">{t("chat:task.apiCost")}</span>
										<span>${totalCost?.toFixed(2)}</span>
									</div>
									<TaskActions item={currentTaskItem} buttonsDisabled={buttonsDisabled} />
								</div>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	)
}

export default memo(TaskHeader)
