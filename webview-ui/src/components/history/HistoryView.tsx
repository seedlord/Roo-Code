import React, { memo, useState, useCallback, useEffect, useRef, useMemo } from "react"
import { DeleteTaskDialog } from "./DeleteTaskDialog"
import { BatchDeleteTaskDialog } from "./BatchDeleteTaskDialog"
import { Virtuoso } from "react-virtuoso"

import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import {
	Button,
	Checkbox,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	StandardTooltip,
} from "@src/components/ui"
import { useAppTranslation } from "@src/i18n/TranslationContext"

import { Tab, TabContent, TabHeader } from "../common/Tab"
import { useTaskSearch } from "./useTaskSearch"
import TaskItem from "./TaskItem"
import { vscode } from "@src/utils/vscode"
import { ExtensionMessage } from "@roo/ExtensionMessage"
import { ClineMessage } from "@roo-code/types"
import { TimelineFilterControls } from "../common/task-timeline/TimelineFilterControls"
import { useTimelineFilter } from "../common/task-timeline/TimelineFilterContext"
import { getMessageMetadata } from "../common/task-timeline/toolManager"
import {
	getCachedTimeline,
	setCachedTimeline,
	getMultipleCachedTimelines,
	setMultipleCachedTimelines,
} from "@src/lib/idb"

type HistoryViewProps = {
	onDone: () => void
}

type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"

const HistoryView = ({ onDone }: HistoryViewProps) => {
	const {
		tasks,
		searchQuery,
		setSearchQuery,
		sortOption,
		setSortOption,
		setLastNonRelevantSort,
		showAllWorkspaces,
		setShowAllWorkspaces,
	} = useTaskSearch()
	const { t } = useAppTranslation()
	const { activeFilters, hideTasksWithoutFilteredTypes } = useTimelineFilter()

	const [areAllExpanded, setAreAllExpanded] = useState(false)
	const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
	const [isSelectionMode, setIsSelectionMode] = useState(false)
	const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
	const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState<boolean>(false)
	const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({})
	const [timelineData, setTimelineData] = useState<Record<string, ClineMessage[]>>({})
	const requestedDetailsRef = useRef(new Set<string>())
	const timelineDataBuffer = useRef<Record<string, ClineMessage[]>>({})
	const timelineUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null)

	const filteredTasks = useMemo(() => {
		if (!hideTasksWithoutFilteredTypes) {
			return tasks
		}
		return tasks.filter((task) => {
			const history = timelineData[task.id]
			if (!history) return true // Keep it visible if not loaded
			return history.some((message) => {
				const metadata = getMessageMetadata(message)
				return metadata ? activeFilters.includes(metadata.group) : false
			})
		})
	}, [tasks, timelineData, hideTasksWithoutFilteredTypes, activeFilters])

	const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const initialCacheLoadRef = useRef(false)

	// Load all available timelines from cache on initial load
	useEffect(() => {
		const loadInitialCache = async () => {
			const allTaskIds = tasks.map((t) => t.id)
			if (allTaskIds.length > 0) {
				const cachedData = await getMultipleCachedTimelines(allTaskIds)
				if (Object.keys(cachedData).length > 0) {
					Object.assign(timelineDataBuffer.current, cachedData)
					if (timelineUpdateTimeoutRef.current) clearTimeout(timelineUpdateTimeoutRef.current)
					timelineUpdateTimeoutRef.current = setTimeout(() => {
						setTimelineData((prev) => ({ ...prev, ...timelineDataBuffer.current }))
						timelineDataBuffer.current = {}
					}, 50)
				}
			}
		}

		if (!initialCacheLoadRef.current && tasks.length > 0) {
			initialCacheLoadRef.current = true
			loadInitialCache()
		}
	}, [tasks])

	const prefetchVisibleTaskTimelines = useCallback(
		({ startIndex, endIndex }: { startIndex: number; endIndex: number }) => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current)
			}

			debounceTimeoutRef.current = setTimeout(async () => {
				const potentialIdsToFetch: string[] = []
				for (let i = startIndex; i <= endIndex; i++) {
					const task = filteredTasks[i]
					if (task && !timelineData[task.id] && !requestedDetailsRef.current.has(task.id)) {
						potentialIdsToFetch.push(task.id)
					}
					// Also add for backfill
					if (
						task &&
						task.contextWindow === undefined &&
						!requestedDetailsRef.current.has(task.id) &&
						!potentialIdsToFetch.includes(task.id)
					) {
						potentialIdsToFetch.push(task.id)
					}
				}

				if (potentialIdsToFetch.length > 0) {
					const cachedData = await getMultipleCachedTimelines(potentialIdsToFetch)
					if (Object.keys(cachedData).length > 0) {
						Object.assign(timelineDataBuffer.current, cachedData)
					}

					const idsToFetch = potentialIdsToFetch.filter((id) => !cachedData[id])
					if (idsToFetch.length > 0) {
						idsToFetch.forEach((id) => requestedDetailsRef.current.add(id))
						vscode.postMessage({ type: "getTaskDetailsBatch", taskIds: idsToFetch })
					}
				}
			}, 50)
		},
		[filteredTasks, timelineData],
	)

	// Background fetching when idle
	useEffect(() => {
		let isCancelled = false
		let timeoutId: NodeJS.Timeout

		const processBatch = async () => {
			if (isCancelled) return

			const potentialIdsToFetch = filteredTasks
				.map((task) => task.id)
				.filter((id) => !timelineData[id] && !requestedDetailsRef.current.has(id))
				.slice(0, 5)

			if (potentialIdsToFetch.length > 0) {
				const cachedData = await getMultipleCachedTimelines(potentialIdsToFetch)
				if (Object.keys(cachedData).length > 0) {
					Object.assign(timelineDataBuffer.current, cachedData)
				}

				const idsToFetch = potentialIdsToFetch.filter((id) => !cachedData[id])
				if (idsToFetch.length > 0) {
					idsToFetch.forEach((id) => requestedDetailsRef.current.add(id))
					vscode.postMessage({ type: "getTaskDetailsBatch", taskIds: idsToFetch })
				}

				if (!isCancelled) {
					timeoutId = setTimeout(processBatch, 100)
				}
			}
		}

		// Start the process
		timeoutId = setTimeout(processBatch, 200) // Initial delay

		return () => {
			isCancelled = true
			clearTimeout(timeoutId)
		}
	}, [filteredTasks, timelineData])

	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const message = event.data
			let dataToProcess: Record<string, { history: ClineMessage[] }> | null = null

			if (message.type === "taskDetails" && message.payload?.taskId) {
				const { taskId, history } = message.payload
				dataToProcess = { [taskId]: { history } }
				setCachedTimeline(taskId, history)
			} else if (message.type === "taskDetailsBatch" && message.payload) {
				dataToProcess = message.payload
				setMultipleCachedTimelines(message.payload)
			}

			if (dataToProcess) {
				let updated = false
				for (const taskId in dataToProcess) {
					if (Object.prototype.hasOwnProperty.call(dataToProcess, taskId)) {
						timelineDataBuffer.current[taskId] = dataToProcess[taskId].history
						updated = true
					}
				}

				if (updated) {
					if (timelineUpdateTimeoutRef.current) {
						clearTimeout(timelineUpdateTimeoutRef.current)
					}
					timelineUpdateTimeoutRef.current = setTimeout(() => {
						setTimelineData((prev) => ({ ...prev, ...timelineDataBuffer.current }))
						timelineDataBuffer.current = {}
					}, 50) // Debounce updates
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			if (timelineUpdateTimeoutRef.current) {
				clearTimeout(timelineUpdateTimeoutRef.current)
			}
			window.removeEventListener("message", handleMessage)
		}
	}, [setTimelineData])

	const toggleTaskExpansion = useCallback(
		async (taskId: string) => {
			const isExpanding = !expandedTaskIds[taskId]
			setExpandedTaskIds((prev) => ({
				...prev,
				[taskId]: isExpanding,
			}))

			if (isExpanding && !timelineData[taskId]) {
				const cached = await getCachedTimeline(taskId)
				if (cached) {
					timelineDataBuffer.current[taskId] = cached
					if (timelineUpdateTimeoutRef.current) clearTimeout(timelineUpdateTimeoutRef.current)
					timelineUpdateTimeoutRef.current = setTimeout(() => {
						setTimelineData((prev) => ({ ...prev, ...timelineDataBuffer.current }))
						timelineDataBuffer.current = {}
					}, 50)
				} else {
					vscode.postMessage({ type: "getTaskDetails", text: taskId })
				}
			}
		},
		[expandedTaskIds, timelineData],
	)

	const toggleAllExpanded = () => {
		const newExpandedState = !areAllExpanded
		setAreAllExpanded(newExpandedState)

		if (newExpandedState) {
			// Proactively fetch all missing timelines
			const fetchAllMissing = async () => {
				const idsToFetch = filteredTasks
					.map((task) => task.id)
					.filter((id) => !timelineData[id] && !requestedDetailsRef.current.has(id))

				if (idsToFetch.length === 0) return

				const cachedData = await getMultipleCachedTimelines(idsToFetch)
				if (Object.keys(cachedData).length > 0) {
					Object.assign(timelineDataBuffer.current, cachedData)
					if (timelineUpdateTimeoutRef.current) clearTimeout(timelineUpdateTimeoutRef.current)
					timelineUpdateTimeoutRef.current = setTimeout(() => {
						setTimelineData((prev) => ({ ...prev, ...timelineDataBuffer.current }))
						timelineDataBuffer.current = {}
					}, 50)
				}

				const remainingIds = idsToFetch.filter((id) => !cachedData[id])
				if (remainingIds.length > 0) {
					remainingIds.forEach((id) => requestedDetailsRef.current.add(id))
					vscode.postMessage({ type: "getTaskDetailsBatch", taskIds: remainingIds })
				}
			}
			fetchAllMissing()
		}
	}

	// Toggle selection mode
	const toggleSelectionMode = () => {
		setIsSelectionMode(!isSelectionMode)
		if (isSelectionMode) {
			setSelectedTaskIds([])
		}
	}

	// Toggle selection for a single task
	const toggleTaskSelection = (taskId: string, isSelected: boolean) => {
		if (isSelected) {
			setSelectedTaskIds((prev) => [...prev, taskId])
		} else {
			setSelectedTaskIds((prev) => prev.filter((id) => id !== taskId))
		}
	}

	// Toggle select all tasks
	const toggleSelectAll = (selectAll: boolean) => {
		if (selectAll) {
			setSelectedTaskIds(tasks.map((task) => task.id))
		} else {
			setSelectedTaskIds([])
		}
	}

	// Handle batch delete button click
	const handleBatchDelete = () => {
		if (selectedTaskIds.length > 0) {
			setShowBatchDeleteDialog(true)
		}
	}

	return (
		<Tab>
			<TabHeader className="flex flex-col gap-2">
				<div className="flex justify-between items-center">
					<h3 className="text-vscode-foreground m-0">{t("history:history")}</h3>
					<div className="flex gap-2">
						<StandardTooltip content={areAllExpanded ? "Collapse All" : "Expand All"}>
							<Button variant="secondary" onClick={toggleAllExpanded}>
								<span
									className={`codicon ${areAllExpanded ? "codicon-collapse-all" : "codicon-expand-all"}`}
								/>
							</Button>
						</StandardTooltip>
						<StandardTooltip
							content={
								isSelectionMode
									? `${t("history:exitSelectionMode")}`
									: `${t("history:enterSelectionMode")}`
							}>
							<Button
								variant={isSelectionMode ? "default" : "secondary"}
								onClick={toggleSelectionMode}
								data-testid="toggle-selection-mode-button">
								<span
									className={`codicon ${isSelectionMode ? "codicon-check-all" : "codicon-checklist"} mr-1`}
								/>
								{isSelectionMode ? t("history:exitSelection") : t("history:selectionMode")}
							</Button>
						</StandardTooltip>
						<Button onClick={onDone}>{t("history:done")}</Button>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<VSCodeTextField
						className="w-full"
						placeholder={t("history:searchPlaceholder")}
						value={searchQuery}
						data-testid="history-search-input"
						onInput={(e) => {
							const newValue = (e.target as HTMLInputElement)?.value
							setSearchQuery(newValue)
							if (newValue && !searchQuery && sortOption !== "mostRelevant") {
								setLastNonRelevantSort(sortOption)
								setSortOption("mostRelevant")
							}
						}}>
						<div slot="start" className="codicon codicon-search mt-0.5 opacity-80 text-sm!" />
						{searchQuery && (
							<div
								className="input-icon-button codicon codicon-close flex justify-center items-center h-full"
								aria-label="Clear search"
								onClick={() => setSearchQuery("")}
								slot="end"
							/>
						)}
					</VSCodeTextField>
					<div className="flex gap-2">
						<Select
							value={showAllWorkspaces ? "all" : "current"}
							onValueChange={(value) => setShowAllWorkspaces(value === "all")}>
							<SelectTrigger className="flex-1">
								<SelectValue>
									{t("history:workspace.prefix")}{" "}
									{t(`history:workspace.${showAllWorkspaces ? "all" : "current"}`)}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="current">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-folder" />
										{t("history:workspace.current")}
									</div>
								</SelectItem>
								<SelectItem value="all">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-folder-opened" />
										{t("history:workspace.all")}
									</div>
								</SelectItem>
							</SelectContent>
						</Select>
						<Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
							<SelectTrigger className="flex-1">
								<SelectValue>
									{t("history:sort.prefix")} {t(`history:sort.${sortOption}`)}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="newest" data-testid="select-newest">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-arrow-down" />
										{t("history:newest")}
									</div>
								</SelectItem>
								<SelectItem value="oldest" data-testid="select-oldest">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-arrow-up" />
										{t("history:oldest")}
									</div>
								</SelectItem>
								<SelectItem value="mostExpensive" data-testid="select-most-expensive">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-credit-card" />
										{t("history:mostExpensive")}
									</div>
								</SelectItem>
								<SelectItem value="mostTokens" data-testid="select-most-tokens">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-symbol-numeric" />
										{t("history:mostTokens")}
									</div>
								</SelectItem>
								<SelectItem
									value="mostRelevant"
									disabled={!searchQuery}
									data-testid="select-most-relevant">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-search" />
										{t("history:mostRelevant")}
									</div>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="my-2">
						<TimelineFilterControls />
					</div>

					{/* Select all control in selection mode */}
					{isSelectionMode && filteredTasks.length > 0 && (
						<div className="flex items-center py-1">
							<div className="flex items-center gap-2">
								<Checkbox
									checked={
										filteredTasks.length > 0 && selectedTaskIds.length === filteredTasks.length
									}
									onCheckedChange={(checked) => toggleSelectAll(checked === true)}
									variant="description"
								/>
								<span className="text-vscode-foreground">
									{selectedTaskIds.length === filteredTasks.length
										? t("history:deselectAll")
										: t("history:selectAll")}
								</span>
								<span className="ml-auto text-vscode-descriptionForeground text-xs">
									{t("history:selectedItems", {
										selected: selectedTaskIds.length,
										total: filteredTasks.length,
									})}
								</span>
							</div>
						</div>
					)}
				</div>
			</TabHeader>

			<TabContent className="p-0">
				<Virtuoso
					className="flex-1 overflow-y-scroll"
					data={filteredTasks}
					data-testid="virtuoso-container"
					initialTopMostItemIndex={0}
					rangeChanged={prefetchVisibleTaskTimelines}
					components={{
						List: React.forwardRef((props, ref) => (
							<div {...props} ref={ref} data-testid="virtuoso-item-list" />
						)),
					}}
					itemContent={(_index, item) => (
						<TaskItem
							key={item.id}
							item={item}
							variant="full"
							showWorkspace={showAllWorkspaces}
							isSelectionMode={isSelectionMode}
							isSelected={selectedTaskIds.includes(item.id)}
							onToggleSelection={toggleTaskSelection}
							onDelete={setDeleteTaskId}
							className="m-2 mr-0"
							isExpanded={areAllExpanded || (expandedTaskIds[item.id] ?? false)}
							onToggleExpansion={toggleTaskExpansion}
							taskHistory={timelineData[item.id]}
							enableFilter
						/>
					)}
				/>
			</TabContent>

			{/* Fixed action bar at bottom - only shown in selection mode with selected items */}
			{isSelectionMode && selectedTaskIds.length > 0 && (
				<div className="fixed bottom-0 left-0 right-0 bg-vscode-editor-background border-t border-vscode-panel-border p-2 flex justify-between items-center">
					<div className="text-vscode-foreground">
						{t("history:selectedItems", { selected: selectedTaskIds.length, total: tasks.length })}
					</div>
					<div className="flex gap-2">
						<Button variant="secondary" onClick={() => setSelectedTaskIds([])}>
							{t("history:clearSelection")}
						</Button>
						<Button variant="default" onClick={handleBatchDelete}>
							{t("history:deleteSelected")}
						</Button>
					</div>
				</div>
			)}

			{/* Delete dialog */}
			{deleteTaskId && (
				<DeleteTaskDialog taskId={deleteTaskId} onOpenChange={(open) => !open && setDeleteTaskId(null)} open />
			)}

			{/* Batch delete dialog */}
			{showBatchDeleteDialog && (
				<BatchDeleteTaskDialog
					taskIds={selectedTaskIds}
					open={showBatchDeleteDialog}
					onOpenChange={(open) => {
						if (!open) {
							setShowBatchDeleteDialog(false)
							setSelectedTaskIds([])
							setIsSelectionMode(false)
						}
					}}
				/>
			)}
		</Tab>
	)
}

export default memo(HistoryView)
