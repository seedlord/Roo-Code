import { memo, useState, useCallback, useEffect } from "react"
import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { ClineMessage } from "@roo-code/types"
import { ExtensionMessage } from "@roo/ExtensionMessage"

import { useTaskSearch } from "./useTaskSearch"
import TaskItem from "./TaskItem"

const HistoryPreview = () => {
	const { tasks } = useTaskSearch()
	const { t } = useAppTranslation()

	const handleViewAllHistory = () => {
		vscode.postMessage({ type: "switchTab", tab: "history" })
	}
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
	}, [])

	const toggleTaskExpansion = useCallback(
		(taskId: string) => {
			const isExpanding = !expandedTaskIds[taskId]
			setExpandedTaskIds((prev) => ({
				...prev,
				[taskId]: isExpanding,
			}))

			if (isExpanding && !timelineData[taskId]) {
				vscode.postMessage({ type: "getTaskDetails", taskId: taskId })
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
			<button
				onClick={handleViewAllHistory}
				className="text-base text-vscode-descriptionForeground hover:text-vscode-textLink-foreground transition-colors cursor-pointer text-center w-full"
				aria-label={t("history:viewAllHistory")}>
				{t("history:viewAllHistory")}
			</button>
		</div>
	)
}

export default memo(HistoryPreview)
