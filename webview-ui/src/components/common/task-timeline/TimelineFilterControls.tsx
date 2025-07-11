import React from "react"
import { useTimelineFilter, ALL_MESSAGE_GROUPS, MessageGroup } from "./TimelineFilterContext"
import { Checkbox } from "@src/components/ui"
import { Label } from "../../../../../apps/web-evals/src/components/ui/label"
import { t } from "i18next"
import * as COLOR from "./colors"
import { cn } from "@src/lib/utils"

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
						const filterIconMap: Record<MessageGroup, string | undefined> = {
							read: "book",
							edit: "edit",
							command: "terminal",
							flow: "arrow-right",
							ask: "question",
							info: "roo",
							reasoning: "history",
							error: "error",
							checkpoint: "git-commit",
							task_completion: "check",
						}

						const filterColorMap: Record<MessageGroup, string> = {
							read: COLOR.YELLOW,
							edit: COLOR.BLUE,
							command: COLOR.PURPLE,
							flow: COLOR.LIGHT_GREEN,
							ask: COLOR.GRAY,
							info: COLOR.GRAY,
							reasoning: COLOR.GRAY,
							error: COLOR.RED,
							checkpoint: COLOR.BLUE,
							task_completion: COLOR.GREEN,
						}
						const color = filterColorMap[group]
						const icon = filterIconMap[group]

						return (
							<div
								key={group}
								className={cn("flex items-center gap-1.5 cursor-pointer transition-opacity", {
									"opacity-40": !activeFilters.includes(group),
								})}
								onClick={() => handleCheckedChange(group)}>
								<div className="w-4.5 h-4.5 flex items-center justify-center">
									{icon ? (
										icon === "roo" ? (
											<div
												className="w-full h-full"
												style={{
													backgroundColor: color,
													WebkitMaskImage: `url(${(window as any).IMAGES_BASE_URI + "/roo-logo.svg"})`,
													WebkitMaskRepeat: "no-repeat",
													WebkitMaskSize: "contain",
													maskImage: `url(${(window as any).IMAGES_BASE_URI + "/roo-logo.svg"})`,
													maskRepeat: "no-repeat",
													maskSize: "contain",
													position: "relative",
													top: "2px",
												}}
											/>
										) : (
											<span
												className={`codicon codicon-${icon}`}
												style={{ color, fontSize: "16px" }}
											/>
										)
									) : (
										<div
											className="w-2.5 h-3 rounded-sm"
											style={{
												backgroundColor: color,
											}}
										/>
									)}
								</div>
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
