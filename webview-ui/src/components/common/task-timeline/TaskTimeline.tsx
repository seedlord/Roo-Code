import React, { useMemo, useState, useRef, useEffect } from "react"
import { ClineMessage } from "@roo-code/types"
import { TaskTimelineTooltip } from "./TaskTimelineTooltip"
import { getMessageColor, getMessageMetadata } from "./toolManager"
import { useTimelineFilter } from "./TimelineFilterContext"

// Timeline dimensions and spacing
const TIMELINE_HEIGHT = "18px"
const BLOCK_WIDTH = "9px"
const BLOCK_GAP = "3px"
const VERTICAL_OFFSET = 8 // Vertical offset from the timeline block

interface TaskTimelineProps {
	messages: ClineMessage[]
	onBlockClick?: (timestamp: number) => void
}

const TaskTimeline: React.FC<TaskTimelineProps> = ({ messages, onBlockClick }) => {
	const { activeFilters } = useTimelineFilter()
	const [hoveredMessage, setHoveredMessage] = useState<ClineMessage | null>(null)
	const [hoveredElement, setHoveredElement] = useState<HTMLDivElement | null>(null)
	const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({
		opacity: 0,
		pointerEvents: "none",
		position: "fixed",
		zIndex: 1000,
	})

	const containerRef = useRef<HTMLDivElement>(null)
	const scrollableRef = useRef<HTMLDivElement>(null)
	const tooltipRef = useRef<HTMLDivElement>(null)

	const filteredMessages = useMemo(() => {
		return messages
			.filter((message) => message.say !== "api_req_retry_delayed")
			.filter((message) => {
				const metadata = getMessageMetadata(message)
				return metadata ? activeFilters.includes(metadata.group) : true
			})
	}, [messages, activeFilters])

	useEffect(() => {
		if (scrollableRef.current && filteredMessages.length > 0) {
			scrollableRef.current.scrollLeft = scrollableRef.current.scrollWidth
		}
	}, [filteredMessages])

	useEffect(() => {
		if (hoveredMessage && hoveredElement && tooltipRef.current && containerRef.current) {
			const targetRect = hoveredElement.getBoundingClientRect()
			const tooltipRect = tooltipRef.current.getBoundingClientRect()
			const containerRect = containerRef.current.getBoundingClientRect()

			// Determine tooltip width, constrained by the container
			const maxWidth = containerRect.width
			const tooltipWidth = Math.min(tooltipRect.width, maxWidth)

			// Horizontal positioning: center tooltip over the target element, but keep it within the container
			let left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2
			left = Math.max(containerRect.left, left) // Don't go off the left side
			left = Math.min(left, containerRect.right - tooltipWidth) // Don't go off the right side

			// Vertical positioning: try to place it below the timeline, but flip above if not enough space
			let top = targetRect.bottom + VERTICAL_OFFSET
			if (top + tooltipRect.height > window.innerHeight) {
				top = targetRect.top - tooltipRect.height - VERTICAL_OFFSET
			}

			setTooltipStyle((prev) => ({
				...prev,
				opacity: 1,
				pointerEvents: "auto",
				top: `${top}px`,
				left: `${left}px`,
				width: `${maxWidth}px`, // Use container width for consistency
			}))
		}
	}, [hoveredMessage, hoveredElement])

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
	}, [filteredMessages.length])

	if (filteredMessages.length === 0) {
		return null
	}

	const handleMouseEnter = (message: ClineMessage, event: React.MouseEvent<HTMLDivElement>) => {
		setHoveredElement(event.currentTarget)
		setHoveredMessage(message)
	}

	const handleMouseLeave = () => {
		setHoveredMessage(null)
		setHoveredElement(null)
		setTooltipStyle((prev) => ({ ...prev, opacity: 0, pointerEvents: "none" }))
	}

	return (
		<div ref={containerRef} className="relative w-full mt-0 mb-1 overflow-hidden">
			<div
				ref={scrollableRef}
				className="flex w-full overflow-x-auto overflow-y-hidden overscroll-y-contain scrollbar-hide"
				style={{ height: TIMELINE_HEIGHT, gap: BLOCK_GAP }}>
				{filteredMessages.map((message, index) => {
					const handleClick = (e: React.MouseEvent) => {
						e.stopPropagation() // Prevent the click from bubbling up to the parent TaskItem
						if (onBlockClick) {
							onBlockClick(message.ts)
						}
					}
					return (
						<div
							key={`${message.ts}-${index}`}
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

			<div ref={tooltipRef} style={tooltipStyle}>
				{hoveredMessage && <TaskTimelineTooltip message={hoveredMessage} />}
			</div>
		</div>
	)
}

export default TaskTimeline
