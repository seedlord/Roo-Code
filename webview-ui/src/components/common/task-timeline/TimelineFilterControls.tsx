import React from "react"
import { useTimelineFilter, ALL_MESSAGE_GROUPS, MessageGroup } from "./TimelineFilterContext"
import { Checkbox } from "@src/components/ui"
import { Label } from "../../../../../apps/web-evals/src/components/ui/label"
import { t } from "i18next"
import { getMessageMetadata } from "./toolManager"
import { cn } from "@src/lib/utils"
import { ClineMessage } from "@roo-code/types"

export const TimelineFilterControls: React.FC = () => {
	const { activeFilters, setActiveFilters, hideTasksWithoutFilteredTypes, setHideTasksWithoutFilteredTypes } =
		useTimelineFilter()

	const handleCheckedChange = (group: MessageGroup) => {
		setActiveFilters((prev) => {
			const newFilters = new Set(prev)
			if (newFilters.has(group)) {
				newFilters.delete(group)
			} else {
				newFilters.add(group)
			}
			return Array.from(newFilters)
		})
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				<p className="text-xs font-medium text-vscode-descriptionForeground">{t("chat:timeline.filterBy")}</p>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					{ALL_MESSAGE_GROUPS.map((group) => {
						const representativeMessages: Record<MessageGroup, Partial<ClineMessage>> = {
							read: { say: "codebase_search_result" },
							edit: { say: "user_feedback_diff" },
							command: { ask: "command" },
							flow: { say: "subtask_result" },
							ask: { ask: "followup" },
							info: { say: "text" },
							error: { say: "api_req_started", text: "[ERROR]" },
							checkpoint: { say: "checkpoint_saved" },
							task_completion: { say: "completion_result" },
						}
						const representativeMessage = representativeMessages[group]
						const metadata = getMessageMetadata(representativeMessage as any)
						const color = metadata?.color
						const icon = metadata?.icon

						return (
							<div
								key={group}
								className={cn("flex items-center gap-1.5 cursor-pointer transition-opacity", {
									"opacity-40": !activeFilters.includes(group),
								})}
								onClick={() => handleCheckedChange(group)}>
								{icon ? (
									<span className={`codicon codicon-${icon}`} style={{ color }} />
								) : (
									<div
										className="w-2.5 h-3 rounded-sm"
										style={{
											backgroundColor: color,
										}}
									/>
								)}
								<span className="text-xs capitalize">{t(`chat:timeline.filterGroups.${group}`)}</span>
							</div>
						)
					})}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Checkbox
					id="hide-tasks-filter"
					checked={hideTasksWithoutFilteredTypes}
					onCheckedChange={(checked) => setHideTasksWithoutFilteredTypes(checked === true)}
				/>
				<Label htmlFor="hide-tasks-filter" className="text-xs">
					{t("chat:timeline.onlyShowTasksWithFilteredTypes")}
				</Label>
			</div>
		</div>
	)
}
