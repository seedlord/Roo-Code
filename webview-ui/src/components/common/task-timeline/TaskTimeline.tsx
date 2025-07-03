import React, { useMemo, useState, useRef, useEffect } from "react"
import { ClineMessage } from "@roo-code/types"
import { combineApiRequests } from "@roo/combineApiRequests"
import { combineCommandSequences } from "@roo/combineCommandSequences"
import TaskTimelineTooltip from "./TaskTimelineTooltip"
import { getMessageColor } from "./messageUtils"

// Timeline dimensions and spacing
const TIMELINE_HEIGHT = "18px"
const BLOCK_WIDTH = "9px"
const BLOCK_GAP = "3px"
const TOOLTIP_MARGIN = 32 // 32px margin on each side
const TOOLTIP_VERTICAL_OFFSET = 20 // 20px vertical offset from the cursor

interface TaskTimelineProps {
	messages: ClineMessage[]
	onBlockClick?: (messageIndex: number) => void
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
				}
				// Filter out other standard "say" events
				else if (
					msg.say === "api_req_finished" ||
					msg.say === "api_req_retried" ||
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

		let isHovering = false

		const handleMouseEnter = () => {
			isHovering = true
		}
		const handleMouseLeave = () => {
			isHovering = false
		}

		const handleWheel = (event: WheelEvent) => {
			if (!scrollableElement || !isHovering) return

			const { scrollWidth, clientWidth } = scrollableElement
			// If there's no horizontal overflow, let the default behavior happen.
			// Since the listener is passive, the page will scroll.
			if (scrollWidth <= clientWidth) {
				return
			}

			// With a passive listener, we cannot call `preventDefault`.
			// The vertical scroll is prevented by `overflow-y: hidden` and
			// `overscroll-behavior-y: contain` on the element's style.
			const { deltaY } = event
			scrollableElement.scrollLeft += deltaY
		}

		scrollableElement.addEventListener("mouseenter", handleMouseEnter)
		scrollableElement.addEventListener("mouseleave", handleMouseLeave)
		scrollableElement.addEventListener("wheel", handleWheel, { passive: true })

		return () => {
			scrollableElement.removeEventListener("mouseenter", handleMouseEnter)
			scrollableElement.removeEventListener("mouseleave", handleMouseLeave)
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
		<div ref={containerRef} className="relative w-full mt-0 mb-1 overflow-hidden">
			<div
				ref={scrollableRef}
				className="flex w-full overflow-x-auto overflow-y-hidden overscroll-y-contain scrollbar-hide"
				style={{ height: TIMELINE_HEIGHT, gap: BLOCK_GAP }}>
				{taskTimelinePropsMessages.map((message, index) => {
					const handleClick = (e: React.MouseEvent) => {
						e.stopPropagation() // Prevent the click from bubbling up to the parent TaskItem
						if (onBlockClick) {
							// Find the original index of the message in the unfiltered `messages` array
							const originalIndex = messages.findIndex((m) => m.ts === message.ts)
							if (originalIndex !== -1) {
								onBlockClick(originalIndex - 1)
							}
						}
					}
					return (
						<div
							key={index}
							className="h-full flex-shrink-0 cursor-pointer"
							style={{
								width: BLOCK_WIDTH,
								backgroundColor: getMessageColor(message),
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
						top: `${tooltipPosition.y + TOOLTIP_VERTICAL_OFFSET}px`,
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
