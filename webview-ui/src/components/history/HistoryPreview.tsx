import { memo, useState, useCallback, useEffect, useRef } from "react"
import { ClineMessage } from "@roo-code/types"
import { ExtensionMessage } from "@roo/ExtensionMessage"
import { vscode } from "@src/utils/vscode"

import { useTaskSearch } from "./useTaskSearch"
import TaskItem from "./TaskItem"
import { useMemo } from "react"

const HistoryPreview = () => {
	const { tasks } = useTaskSearch()
	const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({})
	const [timelineData, setTimelineData] = useState<Record<string, ClineMessage[]>>({})
	const requestedDetailsRef = useRef(new Set<string>())

	const recentTasks = useMemo(() => tasks.slice(0, 3), [tasks])

	useEffect(() => {
		const idsToFetch = recentTasks
			.map((task) => task.id)
			.filter((id) => !timelineData[id] && !requestedDetailsRef.current.has(id))

		if (idsToFetch.length > 0) {
			idsToFetch.forEach((id) => requestedDetailsRef.current.add(id))
			vscode.postMessage({ type: "getTaskDetailsBatch", taskIds: idsToFetch })
		}
	}, [recentTasks, timelineData])

	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const message = event.data
			if (message.type === "taskDetails" && message.payload?.taskId) {
				setTimelineData((prev) => ({
					...prev,
					[message.payload.taskId]: message.payload.history,
				}))
			} else if (message.type === "taskDetailsBatch" && message.payload) {
				const newTimelineData = { ...timelineData }
				let updated = false
				for (const taskId in message.payload) {
					if (Object.prototype.hasOwnProperty.call(message.payload, taskId)) {
						newTimelineData[taskId] = message.payload[taskId].history
						updated = true
					}
				}
				if (updated) {
					setTimelineData(newTimelineData)
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [setTimelineData, timelineData])

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
