import { memo, useState, useEffect } from "react"
import type { HistoryItem, ClineMessage } from "@roo-code/types"
import { ExtensionMessage } from "@roo/ExtensionMessage"

import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import TaskTimeline from "@/components/chat/task-header/TaskTimeline"

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
	const [taskHistory, setTaskHistory] = useState<ClineMessage[] | null>(null)
	const [isTimelineVisible, setIsTimelineVisible] = useState(false)

	const isControlled = onToggleExpansion !== undefined
	const currentExpandedState = isControlled ? isExpanded : isTimelineVisible

	const toggleTimelineVisibility = () => {
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

				<div className="flex-1 min-w-0">
					{/* Header with metadata */}
					<TaskItemHeader
						item={item}
						isSelectionMode={isSelectionMode}
						onDelete={onDelete}
						isTimelineVisible={currentExpandedState}
						onToggleTimeline={toggleTimelineVisibility}
					/>

					{/* Task content */}
					<div
						className={cn("overflow-hidden whitespace-pre-wrap text-vscode-foreground text-ellipsis", {
							"text-base line-clamp-3": !isCompact,
							"line-clamp-2": isCompact,
						})}
						data-testid="task-content"
						{...(item.highlight ? { dangerouslySetInnerHTML: { __html: item.highlight } } : {})}>
						{item.highlight ? undefined : item.task}
					</div>

					{/* Task Item Footer */}
					<TaskItemFooter item={item} variant={variant} isSelectionMode={isSelectionMode} />

					{/* Workspace info */}
					{showWorkspace && item.workspace && (
						<div className="flex flex-row gap-1 text-vscode-descriptionForeground text-xs mt-1">
							<span className="codicon codicon-folder scale-80" />
							<span>{item.workspace}</span>
						</div>
					)}
				</div>
			</div>
			{currentExpandedState && taskHistory && (
				<div className="px-3 pb-2">
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
		</div>
	)
}

export default memo(TaskItem)
