import { memo, useState, useCallback, useEffect } from "react"
import { ClineMessage } from "@roo-code/types"
import { ExtensionMessage } from "@roo/ExtensionMessage"
import { vscode } from "@/utils/vscode"

import { useTaskSearch } from "./useTaskSearch"
import TaskItem from "./TaskItem"

const HistoryPreview = () => {
	const { tasks } = useTaskSearch()
	const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({})
	const [timelineData, setTimelineData] = useState<Record<string, ClineMessage[]>>({})

	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const message = event.data
			if (message.type === "taskDetails" && message.payload?.taskId) {
				setTimelineData((prev) => ({
					...prev,
					[message.payload.taskId]: message.payload.history,
				}))
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [setTimelineData])

	const toggleTaskExpansion = useCallback(
		(taskId: string) => {
			const isExpanding = !expandedTaskIds[taskId]
			setExpandedTaskIds((prev) => ({
				...prev,
				[taskId]: isExpanding,
			}))

			if (isExpanding && !timelineData[taskId]) {
				vscode.postMessage({ type: "getTaskDetails", text: taskId })
			}
		},
		[expandedTaskIds, timelineData],
	)

	const recentTasks = tasks.slice(0, 3)

	return (
		<div className="flex flex-col gap-3">
			{recentTasks.map((item) => (
				<TaskItem
					key={item.id}
					item={item}
					variant="compact"
					isExpanded={expandedTaskIds[item.id] ?? false}
					onToggleExpansion={toggleTaskExpansion}
					taskHistory={timelineData[item.id]}
				/>
			))}
		</div>
	)
}

export default memo(HistoryPreview)
