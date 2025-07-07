import React from "react"
import type { HistoryItem } from "@roo-code/types"
import { formatDate } from "@src/utils/format"
import { DeleteButton } from "./DeleteButton"
import { cn } from "@src/lib/utils"
import { FileIcon } from "lucide-react"
import prettyBytes from "pretty-bytes"

export interface TaskItemHeaderProps {
	item: HistoryItem
	isSelectionMode: boolean
	onDelete?: (taskId: string) => void
	isTimelineVisible?: boolean
}

const TaskItemHeader: React.FC<TaskItemHeaderProps> = ({ item, isSelectionMode, onDelete }) => {
	return (
		<div
			className={cn("flex justify-between items-center", {
				"mb-1": !onDelete,
			})}>
			<span className="text-vscode-descriptionForeground font-medium text-sm uppercase">
				{formatDate(item.ts)}
			</span>

			{/* Action Buttons */}
			{!isSelectionMode && (
				<div className="flex flex-row gap-2 items-center">
					{!!item.size && (
						<span className="flex items-center text-xs text-vscode-descriptionForeground">
							<FileIcon className="inline-block size-[1em] mr-1" />
							<span>{prettyBytes(item.size)}</span>
						</span>
					)}
					<div className="opacity-20 group-hover:opacity-50 hover:!opacity-100">
						{onDelete && <DeleteButton itemId={item.id} onDelete={onDelete} />}
					</div>
				</div>
			)}
		</div>
	)
}

export default TaskItemHeader
