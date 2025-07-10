import React, { createContext, useState, useContext, useMemo } from "react"

// Defines the types of message groups available for filtering.
export type MessageGroup =
	| "read"
	| "edit"
	| "command"
	| "flow"
	| "ask"
	| "info"
	| "reasoning"
	| "error"
	| "checkpoint"
	| "task_completion"

export const ALL_MESSAGE_GROUPS: MessageGroup[] = [
	"read",
	"edit",
	"command",
	"flow",
	"ask",
	"info",
	"reasoning",
	"error",
	"checkpoint",
	"task_completion",
]

interface TimelineFilterContextType {
	activeFilters: MessageGroup[]
	setActiveFilters: React.Dispatch<React.SetStateAction<MessageGroup[]>>
	hideTasksWithoutFilteredTypes: boolean
	setHideTasksWithoutFilteredTypes: React.Dispatch<React.SetStateAction<boolean>>
	showCompletedTasks: boolean
	setShowCompletedTasks: React.Dispatch<React.SetStateAction<boolean>>
}

const TimelineFilterContext = createContext<TimelineFilterContextType | undefined>(undefined)

export const TimelineFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [activeFilters, setActiveFilters] = useState<MessageGroup[]>(ALL_MESSAGE_GROUPS)
	const [hideTasksWithoutFilteredTypes, setHideTasksWithoutFilteredTypes] = useState(false)
	const [showCompletedTasks, setShowCompletedTasks] = useState(true)

	const value = useMemo(
		() => ({
			activeFilters,
			setActiveFilters,
			hideTasksWithoutFilteredTypes,
			setHideTasksWithoutFilteredTypes,
			showCompletedTasks,
			setShowCompletedTasks,
		}),
		[activeFilters, hideTasksWithoutFilteredTypes, showCompletedTasks],
	)

	return <TimelineFilterContext.Provider value={value}>{children}</TimelineFilterContext.Provider>
}

export const useTimelineFilter = (): TimelineFilterContextType => {
	const context = useContext(TimelineFilterContext)
	if (context === undefined) {
		throw new Error("useTimelineFilter must be used within a TimelineFilterProvider")
	}
	return context
}
