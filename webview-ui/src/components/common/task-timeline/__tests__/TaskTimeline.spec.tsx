import { render } from "@testing-library/react"
import { ClineMessage } from "@roo-code/types"
import TaskTimeline from "../TaskTimeline"

const mockMessages: ClineMessage[] = [
	{ ts: 1, type: "say", say: "text", text: "info message" },
	{ ts: 2, type: "ask", ask: "command", text: "command message" },
	{ ts: 3, type: "say", say: "error", text: "error message" },
]

import { useTimelineFilter } from "../TimelineFilterContext"

vi.mock("../TimelineFilterContext")

const mockedUseTimelineFilter = vi.mocked(useTimelineFilter)

describe("TaskTimeline", () => {
	it("should render all messages when filtering is disabled", () => {
		mockedUseTimelineFilter.mockReturnValue({
			activeFilters: [],
			setActiveFilters: () => {},
			hideTasksWithoutFilteredTypes: false,
			setHideTasksWithoutFilteredTypes: () => {},
			showCompletedTasks: true,
			setShowCompletedTasks: () => {},
		})
		const { container } = render(<TaskTimeline messages={mockMessages} enableFilter={false} />)
		const blocks = container.querySelectorAll("div.h-full.flex-shrink-0")
		expect(blocks).toHaveLength(mockMessages.length)
	})

	it("should filter messages based on the active filter", () => {
		mockedUseTimelineFilter.mockReturnValue({
			activeFilters: ["info"],
			setActiveFilters: () => {},
			hideTasksWithoutFilteredTypes: false,
			setHideTasksWithoutFilteredTypes: () => {},
			showCompletedTasks: true,
			setShowCompletedTasks: () => {},
		})
		const { container } = render(<TaskTimeline messages={mockMessages} enableFilter={true} />)
		const blocks = container.querySelectorAll("div.h-full.flex-shrink-0")
		expect(blocks).toHaveLength(1)
	})

	it("should render no messages if filtering is enabled but no filters are active", () => {
		mockedUseTimelineFilter.mockReturnValue({
			activeFilters: [],
			setActiveFilters: () => {},
			hideTasksWithoutFilteredTypes: false,
			setHideTasksWithoutFilteredTypes: () => {},
			showCompletedTasks: true,
			setShowCompletedTasks: () => {},
		})
		const { container } = render(<TaskTimeline messages={mockMessages} enableFilter={true} />)
		const blocks = container.querySelectorAll("div.h-full.flex-shrink-0")
		expect(blocks).toHaveLength(0)
	})
})
