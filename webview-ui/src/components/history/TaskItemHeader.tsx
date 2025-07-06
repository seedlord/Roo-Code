import React from "react"
import type { HistoryItem } from "@roo-code/types"
import { formatDate } from "@/utils/format"
import { DeleteButton } from "./DeleteButton"
import { cn } from "@/lib/utils"

export interface TaskItemHeaderProps {
	item: HistoryItem
	isSelectionMode: boolean
	onDelete?: (taskId: string) => void
	isTimelineVisible?: boolean
	onToggleTimeline?: () => void
}

const TaskItemHeader: React.FC<TaskItemHeaderProps> = ({
	item,
	isSelectionMode,
	onDelete,
	isTimelineVisible,
	onToggleTimeline,
}) => {
	const handleToggleClick = (e: React.MouseEvent) => {
		e.stopPropagation()
		onToggleTimeline?.()
	}
	return (
		<div
			className={cn("flex justify-between items-center", {
				// this is to balance out the margin when we don't have a delete button
				// because the delete button sorta pushes the date up due to its size
				"mb-1": !onDelete,
			})}>
			<div className="flex items-center flex-wrap gap-x-2 text-xs">
				<span className="text-vscode-descriptionForeground font-medium text-sm uppercase">
					{formatDate(item.ts)}
				</span>
			</div>

			{/* Action Buttons */}
			{!isSelectionMode && (
				<div className="flex flex-row gap-0 items-center opacity-20 group-hover:opacity-50 hover:opacity-100">
					<button onClick={handleToggleClick} className="p-1 rounded hover:bg-vscode-toolbar-hoverBackground">
						<span
							className={cn("codicon", {
								"codicon-chevron-down": !isTimelineVisible,
								"codicon-chevron-up": isTimelineVisible,
							})}
						/>
					</button>
					{onDelete && <DeleteButton itemId={item.id} onDelete={onDelete} />}
				</div>
			)}
		</div>
	)
}

export default TaskItemHeader
