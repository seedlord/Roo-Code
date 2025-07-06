import React, { useMemo, useState, useRef, useEffect } from "react"
import { ClineMessage } from "@roo-code/types"
import { combineApiRequests } from "@roo/combineApiRequests"
import { combineCommandSequences } from "@roo/combineCommandSequences"
import TaskTimelineTooltip from "./TaskTimelineTooltip"
import * as COLOR from "../colors"
import { readTools, editTools, commandTools, flowTools, askTools } from "./toolCategories"

// Timeline dimensions and spacing
const TIMELINE_HEIGHT = "18px"
const BLOCK_WIDTH = "9px"
const BLOCK_GAP = "3px"
const TOOLTIP_MARGIN = 32 // 32px margin on each side

interface TaskTimelineProps {
	messages: ClineMessage[]
	onBlockClick?: (messageId: number) => void
}

const getBlockColor = (message: ClineMessage): string => {
	const getColorFromTool = (toolName: string): string => {
		if (readTools.includes(toolName)) return COLOR.YELLOW
		if (editTools.includes(toolName)) return COLOR.BLUE
		if (commandTools.includes(toolName)) return COLOR.PURPLE
		if (flowTools.includes(toolName)) return COLOR.LIGHTGREEN
		if (askTools.includes(toolName)) return COLOR.GRAY

		return COLOR.DARK_GRAY // Default for uncategorized tools
	}

	// First, try to determine color based on the tool being used
	if (message.text) {
		try {
			const toolData = JSON.parse(message.text)
			if (toolData.tool) {
				return getColorFromTool(toolData.tool)
			}
		} catch (_e) {
			// Not a tool call, continue to the logic below
		}
	}

	// Fallback logic for non-tool messages
	if (message.type === "say") {
		switch (message.say) {
			case "user_feedback":
				return COLOR.WHITE
			case "text":
				return COLOR.GRAY // Regular assistant text
			case "api_req_started":
				if (message.text) {
					try {
						const info = JSON.parse(message.text)
						if (info.streamingFailedMessage) {
							return COLOR.RED
						}
					} catch (_e) {
						// ignore
					}
				}
				return COLOR.DARK_GRAY // Should be filtered out
			case "command_output":
				return COLOR.RED
			case "browser_action":
			case "browser_action_result":
				return COLOR.PURPLE // Purple for command/browser results
			case "subtask_result":
				return COLOR.LIGHTGREEN
			case "completion_result":
				return COLOR.GREEN
			case "error":
			case "rooignore_error":
			case "diff_error":
			case "condense_context_error":
			case "api_req_deleted":
				return COLOR.RED // Red for all error types
			default:
				return COLOR.DARK_GRAY
		}
	} else if (message.type === "ask") {
		switch (message.ask) {
			case "followup":
				return COLOR.GRAY // User message asking for input
			case "command":
			case "browser_action_launch":
				return COLOR.PURPLE // Approval for command/browser
			case "tool":
				// This case is hit when a tool approval is asked, but the tool name can't be parsed.
				// Default to a neutral color.
				return COLOR.YELLOW
			case "mistake_limit_reached":
			case "api_req_failed":
				return COLOR.RED // Red for error-related asks
			default:
				return COLOR.DARK_GRAY
		}
	}

	return COLOR.WHITE // Default color for any other case
}

const TaskTimeline: React.FC<TaskTimelineProps> = ({ messages, onBlockClick }) => {
	const [hoveredMessage, setHoveredMessage] = useState<ClineMessage | null>(null)
	const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const scrollableRef = useRef<HTMLDivElement>(null)

	const taskTimelinePropsMessages = useMemo(() => {
		if (messages.length <= 1) return []

		const processed = combineApiRequests(combineCommandSequences(messages.slice(1)))

		const filtered = processed.filter((msg) => {
			// Filter out standard "say" events we don't want to show
			if (msg.type === "say") {
				if (msg.say === "api_req_started") {
					if (msg.text) {
						try {
							const info = JSON.parse(msg.text)
							if (info.streamingFailedMessage) {
								// It's a failed request, so we DON'T filter it.
							} else {
								return false // It's a normal start, filter it.
							}
						} catch (_e) {
							return false // Parse error, filter it.
						}
					} else {
						return false // No text, filter it.
					}
				} else if (
					msg.say === "api_req_finished" ||
					msg.say === "api_req_retried" ||
					(msg.say as string) === "deleted_api_reqs" ||
					(msg.say as string) === "checkpoint_created" ||
					(msg.say === "text" && (!msg.text || msg.text.trim() === ""))
				) {
					return false
				}
			}

			// Filter out "ask" events we don't want to show, including the duplicate completion_result
			if (
				msg.type === "ask" &&
				(msg.ask === "resume_task" || msg.ask === "resume_completed_task" || msg.ask === "completion_result") // Filter out the duplicate completion_result "ask" message
			) {
				return false
			}
			return true
		})
		return filtered
	}, [messages])

	useEffect(() => {
		if (scrollableRef.current && taskTimelinePropsMessages.length > 0) {
			scrollableRef.current.scrollLeft = scrollableRef.current.scrollWidth
		}
	}, [taskTimelinePropsMessages])

	useEffect(() => {
		const scrollableElement = scrollableRef.current
		if (!scrollableElement) return

		const handleWheel = (event: WheelEvent) => {
			if (!scrollableElement) return

			const { deltaY } = event
			const { scrollLeft, scrollWidth, clientWidth } = scrollableElement

			// If there's no horizontal overflow, don't interfere with vertical scrolling.
			if (scrollWidth <= clientWidth) {
				return
			}

			// If scrolling right (deltaY > 0) and we're at the end, allow page scroll down.
			if (deltaY > 0 && scrollLeft + clientWidth >= scrollWidth - 1) {
				// Subtract 1 for pixel-perfect comparison
				return
			}

			// If scrolling left (deltaY < 0) and we're at the beginning, allow page scroll up.
			if (deltaY < 0 && scrollLeft === 0) {
				return
			}

			// Otherwise, prevent page scroll and scroll the timeline horizontally.
			event.preventDefault()
			scrollableElement.scrollLeft += deltaY
		}

		scrollableElement.addEventListener("wheel", handleWheel)

		return () => {
			scrollableElement.removeEventListener("wheel", handleWheel)
		}
	}, [taskTimelinePropsMessages.length])

	if (taskTimelinePropsMessages.length === 0) {
		return null
	}

	const handleMouseEnter = (message: ClineMessage, event: React.MouseEvent<HTMLDivElement>) => {
		setHoveredMessage(message)

		const viewportWidth = window.innerWidth
		const _tooltipWidth = viewportWidth - TOOLTIP_MARGIN * 2

		// Center the tooltip horizontally in the viewport
		const x = TOOLTIP_MARGIN

		setTooltipPosition({ x, y: event.clientY })
	}

	const handleMouseLeave = () => {
		setHoveredMessage(null)
		setTooltipPosition(null)
	}

	return (
		<div
			ref={containerRef}
			style={{
				position: "relative",
				width: "100%",
				marginTop: "4px",
				marginBottom: "4px",
				overflow: "hidden",
			}}>
			<div
				ref={scrollableRef}
				style={{
					display: "flex",
					height: TIMELINE_HEIGHT,
					overflowX: "auto",
					scrollbarWidth: "none",
					msOverflowStyle: "none",
					width: "100%",
					WebkitOverflowScrolling: "touch",
					gap: BLOCK_GAP, // Using flexbox gap instead of marginRight
				}}>
				<style>
					{`
	           /* Hide scrollbar for Chrome, Safari and Opera */
	           div::-webkit-scrollbar {
	             display: none;
	           }
	         `}
				</style>
				{taskTimelinePropsMessages.map((message, index) => {
					const handleClick = () => {
						if (onBlockClick) {
							onBlockClick(message.ts)
						}
					}
					return (
						<div
							key={index}
							style={{
								width: BLOCK_WIDTH,
								height: "100%",
								backgroundColor: getBlockColor(message),
								flexShrink: 0,
								cursor: "pointer",
							}}
							onMouseEnter={(e) => handleMouseEnter(message, e)}
							onMouseLeave={handleMouseLeave}
							onClick={handleClick}
						/>
					)
				})}
			</div>

			{hoveredMessage && containerRef.current && tooltipPosition && (
				<div
					style={{
						position: "fixed",
						left: `${tooltipPosition.x}px`,
						top: `${tooltipPosition.y + 20}px`,
						zIndex: 1000,
						pointerEvents: "none",
						width: `calc(100% - ${TOOLTIP_MARGIN * 2}px)`,
					}}>
					<TaskTimelineTooltip message={hoveredMessage} />
				</div>
			)}
		</div>
	)
}

export default TaskTimeline
