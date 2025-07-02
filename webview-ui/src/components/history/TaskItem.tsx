import { memo, useState, useEffect } from "react"
import type { HistoryItem, ClineMessage } from "@roo-code/types"
import { ExtensionMessage } from "@roo/ExtensionMessage"

import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"
import { formatLargeNumber } from "@/utils/format"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { CloudDownload, CloudUpload } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import TaskTimeline from "@/components/common/task-timeline/TaskTimeline"
import { CopyButton } from "./CopyButton"
import { ExportButton } from "./ExportButton"
import TaskItemHeader from "./TaskItemHeader"
import TaskItemFooter from "./TaskItemFooter"

interface DisplayHistoryItem extends HistoryItem {
	highlight?: string
}

interface TaskItemProps {
	item: DisplayHistoryItem
	variant: "compact" | "full"
	showWorkspace?: boolean
	isSelectionMode?: boolean
	isSelected?: boolean
	onToggleSelection?: (taskId: string, isSelected: boolean) => void
	onDelete?: (taskId: string) => void
	className?: string
	isExpanded?: boolean
	onToggleExpansion?: (taskId: string) => void
}

const TaskItem = ({
	item,
	variant,
	showWorkspace = false,
	isSelectionMode = false,
	isSelected = false,
	onToggleSelection,
	onDelete,
	className,
	isExpanded,
	onToggleExpansion,
}: TaskItemProps) => {
	const { t } = useAppTranslation()
	const [taskHistory, setTaskHistory] = useState<ClineMessage[] | null>(null)
	const [isTimelineVisible, setIsTimelineVisible] = useState(false)

	const isControlled = onToggleExpansion !== undefined
	const currentExpandedState = isControlled ? isExpanded : isTimelineVisible

	const toggleTimelineVisibility = (e: React.MouseEvent) => {
		e.stopPropagation()
		if (isControlled) {
			onToggleExpansion(item.id)
		} else {
			setIsTimelineVisible(!isTimelineVisible)
		}
	}

	useEffect(() => {
		if (currentExpandedState && taskHistory === null) {
			vscode.postMessage({ type: "getTaskDetails", taskId: item.id })
		}
	}, [currentExpandedState, taskHistory, item.id])

	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const message = event.data
			if (message.type === "taskDetails" && message.payload?.taskId === item.id) {
				setTaskHistory(message.payload.history)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [item.id])

	const handleClick = () => {
		if (isSelectionMode && onToggleSelection) {
			onToggleSelection(item.id, !isSelected)
		} else {
			vscode.postMessage({ type: "showTaskWithId", text: item.id })
		}
	}

	const isCompact = variant === "compact"

	return (
		<div
			key={item.id}
			data-testid={`task-item-${item.id}`}
			className={cn(
				"cursor-pointer group bg-vscode-editor-background rounded relative overflow-hidden hover:border-vscode-toolbar-hoverBackground/60",
				className,
			)}>
			<div onClick={handleClick} className="flex gap-2 p-3">
				{/* Selection checkbox - only in full variant */}
				{!isCompact && isSelectionMode && (
					<div
						className="task-checkbox mt-1"
						onClick={(e) => {
							e.stopPropagation()
						}}>
						<Checkbox
							checked={isSelected}
							onCheckedChange={(checked: boolean) => onToggleSelection?.(item.id, checked === true)}
							variant="description"
						/>
					</div>
				)}

				<div className="flex-1 min-w-0 flex flex-col">
					{/* Header with metadata */}
					<TaskItemHeader
						item={item}
						isSelectionMode={isSelectionMode}
						onDelete={onDelete}
						isTimelineVisible={currentExpandedState}
					/>

					{/* Task content and expanded details */}
					<div className="mt-1 flex flex-col ml-[-px]">
						<div className="cursor-pointer" onClick={(e) => toggleTimelineVisibility(e)}>
							<div
								className={cn(
									"text-vscode-font-size",
									!currentExpandedState && "text-vscode-foreground/80",
								)}>
								<div className="flex items-start min-w-0 whitespace-pre-wrap break-word text-ellipsis">
									<div className="line-clamp-3">
										<span
											className={`codicon codicon-chevron-${
												currentExpandedState ? "down" : "right"
											} relative top-0.75 ml-[-2px]`}></span>
										<span className="font-bold ml-1.5">
											{t("history:task.title", { defaultValue: "Task" })}
											{!currentExpandedState && ":"}
										</span>
										{!currentExpandedState && <span className="font-normal"> {item.task}</span>}
									</div>
								</div>
							</div>
						</div>
						{currentExpandedState && (
							<div className="gap-x-1 mt-2">
								<div className="min-w-0">
									{taskHistory && (
										<div className="mb-3">
											<TaskTimeline
												messages={taskHistory}
												onBlockClick={(messageTs) => {
													vscode.postMessage({
														type: "openTaskAndScroll",
														taskId: item.id,
														messageTs,
													})
												}}
											/>
										</div>
									)}
									<div
										className="whitespace-pre-wrap text-vscode-foreground text-ellipsis break-word max-h-80 overflow-y-auto text-vscode-font-size"
										data-testid="task-content-expanded"
										{...(item.highlight
											? { dangerouslySetInnerHTML: { __html: item.highlight } }
											: {})}>
										{item.highlight ? undefined : item.task}
									</div>
									<div className="flex justify-between items-end mt-2 text-xs text-vscode-descriptionForeground">
										{/* Details Section */}
										<div className="flex flex-col gap-1">
											{/* Tokens */}
											<div className="flex items-center gap-1 flex-wrap">
												<span className="font-bold">
													{t("history:task.tokens", { defaultValue: "Tokens" })}
												</span>
												{typeof item.tokensIn === "number" && item.tokensIn > 0 && (
													<span className="flex items-center gap-0.5">
														<i className="codicon codicon-arrow-up text-xs font-bold" />
														{formatLargeNumber(item.tokensIn)}
													</span>
												)}
												{typeof item.tokensOut === "number" && item.tokensOut > 0 && (
													<span className="flex items-center gap-0.5">
														<i className="codicon codicon-arrow-down text-xs font-bold" />
														{formatLargeNumber(item.tokensOut)}
													</span>
												)}
											</div>
											{/* Cache */}
											{((typeof item.cacheReads === "number" && item.cacheReads > 0) ||
												(typeof item.cacheWrites === "number" && item.cacheWrites > 0)) && (
												<div className="flex items-center gap-1 flex-wrap">
													<span className="font-bold">
														{t("history:task.cache", { defaultValue: "Cache" })}
													</span>
													{typeof item.cacheWrites === "number" && item.cacheWrites > 0 && (
														<span className="flex items-center gap-0.5">
															<CloudUpload size={12} />
															{formatLargeNumber(item.cacheWrites)}
														</span>
													)}
													{typeof item.cacheReads === "number" && item.cacheReads > 0 && (
														<span className="flex items-center gap-0.5">
															<CloudDownload size={12} />
															{formatLargeNumber(item.cacheReads)}
														</span>
													)}
												</div>
											)}
											{/* Cost */}
											{!!item.totalCost && (
												<div className="flex items-center gap-1">
													<span className="font-bold">
														{t("history:task.apiCost", { defaultValue: "API Cost" })}
													</span>
													<span>${item.totalCost?.toFixed(2)}</span>
												</div>
											)}
										</div>

										{/* Action Buttons Section */}
										<div className="flex flex-row gap-0 items-center opacity-50 hover:opacity-100">
											<CopyButton itemTask={item.task} />
											{variant === "full" && <ExportButton itemId={item.id} />}
										</div>
									</div>
								</div>
							</div>
						)}
					</div>

					{/* Task Item Footer */}
					<TaskItemFooter
						item={item}
						variant={variant}
						isSelectionMode={isSelectionMode}
						isExpanded={currentExpandedState}
					/>

					{/* Workspace info */}
					{showWorkspace && item.workspace && (
						<div className="flex flex-row gap-1 text-vscode-descriptionForeground text-xs mt-1">
							<span className="codicon codicon-folder scale-80" />
							<span>{item.workspace}</span>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

export default memo(TaskItem)
