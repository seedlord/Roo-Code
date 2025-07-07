import { memo, useState } from "react"
import type { HistoryItem, ClineMessage } from "@roo-code/types"

import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"
import { formatLargeNumber } from "@/utils/format"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { CloudDownload, CloudUpload } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ContextWindowProgress } from "../chat/ContextWindowProgress"
import TaskTimeline from "@/components/common/task-timeline/TaskTimeline"
import { CopyButton } from "./CopyButton"
import { ExportButton } from "./ExportButton"
import TaskItemHeader from "./TaskItemHeader"
import TaskItemFooter from "./TaskItemFooter"
import { Mention } from "../chat/Mention"

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
	taskHistory?: ClineMessage[] | null
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
	taskHistory,
}: TaskItemProps) => {
	const { t } = useAppTranslation()
	const [isTimelineVisible, setIsTimelineVisible] = useState(false)

	const isControlled = onToggleExpansion !== undefined
	const currentExpandedState = isControlled ? isExpanded : isTimelineVisible
	const isLoading = currentExpandedState && !taskHistory

	const toggleTimelineVisibility = (e: React.MouseEvent) => {
		e.stopPropagation()
		if (isControlled) {
			onToggleExpansion(item.id)
		} else {
			setIsTimelineVisible(!isTimelineVisible)
		}
	}

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
				"cursor-pointer group bg-vscode-editor-background rounded relative overflow-hidden",
				!isLoading && "hover:border-vscode-toolbar-hoverBackground/60",
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
					<div className="mt-1 flex flex-col">
						<div className="cursor-pointer" onClick={(e) => toggleTimelineVisibility(e)}>
							<div
								className={cn(
									"text-vscode-font-size",
									!currentExpandedState && "text-vscode-foreground/80",
								)}>
								<div className="flex items-start text-vscode-font-size overflow-y-auto break-words break-anywhere relative">
									<div className="line-clamp-3">
										<span
											className={`codicon codicon-chevron-${
												currentExpandedState ? "down" : "right"
											} relative top-0.75 ml-[-4px]`}></span>
										<span className="font-bold ml-1.5">
											{t("history:task.title", { defaultValue: "Task" })}
											{!currentExpandedState && ":"}
										</span>
										{!currentExpandedState && (
											<span className="font-normal">
												{" "}
												<Mention text={item.task} />
											</span>
										)}
									</div>
								</div>
							</div>
						</div>
						{currentExpandedState && (
							<div className="gap-x-1 mt-2">
								<div className="min-w-0">
									{taskHistory ? (
										<>
											<div className="mb-2">
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
											<div
												className="min-w-0 text-vscode-font-size max-h-80 overflow-y-auto break-words break-anywhere relative"
												data-testid="task-content-expanded">
												{item.highlight ? (
													<div dangerouslySetInnerHTML={{ __html: item.highlight }} />
												) : (
													<Mention text={item.task} />
												)}
											</div>
											{item.contextTokens !== undefined && item.contextWindow !== undefined && (
												<div className="mt-2">
													<ContextWindowProgress
														contextTokens={item.contextTokens}
														contextWindow={item.contextWindow}
													/>
												</div>
											)}
											<div className="flex justify-between items-end mt-2 text-vscode-foreground">
												{/* Details Section */}
												<div className="flex flex-col gap-1">
													{/* Tokens */}
													<div className="flex items-center gap-1 flex-wrap h-[20px]">
														<span className="font-bold">{t("chat:task.tokens")}</span>
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
														(typeof item.cacheWrites === "number" &&
															item.cacheWrites > 0)) && (
														<div className="flex items-center gap-1 flex-wrap h-[20px]">
															<span className="font-bold">{t("chat:task.cache")}</span>
															{typeof item.cacheWrites === "number" &&
																item.cacheWrites > 0 && (
																	<span className="flex items-center gap-0.5">
																		<CloudUpload size={16} />
																		{formatLargeNumber(item.cacheWrites)}
																	</span>
																)}
															{typeof item.cacheReads === "number" &&
																item.cacheReads > 0 && (
																	<span className="flex items-center gap-0.5">
																		<CloudDownload size={16} />
																		{formatLargeNumber(item.cacheReads)}
																	</span>
																)}
														</div>
													)}
													{/* Cost */}
													{!!item.totalCost && (
														<div className="flex items-center gap-1 h-[20px]">
															<span className="font-bold">{t("chat:task.apiCost")}</span>
															<span>${item.totalCost?.toFixed(2)}</span>
														</div>
													)}
												</div>

												{/* Action Buttons Section */}
												<div className="flex flex-row gap-0 items-center opacity-20 group-hover:opacity-50 hover:!opacity-100">
													<CopyButton itemTask={item.task} />
													{variant === "full" && <ExportButton itemId={item.id} />}
												</div>
											</div>
										</>
									) : (
										<div className="flex items-center justify-center p-4">
											<span className="codicon codicon-loading codicon-spin" />
										</div>
									)}
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
