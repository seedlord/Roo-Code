import React, { useMemo, useState, useRef, useEffect } from "react"
import { ClineMessage } from "@roo-code/types"
import { TaskTimelineTooltip, SearchResult } from "./TaskTimelineTooltip"
import { getMessageColor, getMessageMetadata, getMessageIcon } from "./toolManager"
import { useTimelineFilter } from "./TimelineFilterContext"
import { safeJsonParse } from "@roo/safeJsonParse"

// Timeline dimensions and spacing
const TIMELINE_HEIGHT = "18px"
const BLOCK_WIDTH = "9px"
const ICON_WIDTH = "11px" // BLOCK_WIDTH (9px) + 2px padding
const BLOCK_GAP = "3px"
const VERTICAL_OFFSET = 8 // Vertical offset from the timeline block

interface TaskTimelineProps {
	messages: ClineMessage[]
	onBlockClick?: (timestamp: number) => void
	enableFilter?: boolean
}

const TaskTimeline: React.FC<TaskTimelineProps> = ({ messages, onBlockClick, enableFilter = false }) => {
	const { activeFilters } = useTimelineFilter()
	const [hoveredMessage, setHoveredMessage] = useState<ClineMessage | null>(null)
	const [hoveredSearchResults, setHoveredSearchResults] = useState<SearchResult[] | undefined>(undefined)
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
	const hideTimeoutRef = useRef<number | null>(null)

	const filteredMessages = useMemo(() => {
		return messages.filter((message) => {
			// Hide the search result message itself, as it's displayed in the tool call tooltip
			if (message.say === "codebase_search_result") {
				return false
			}
			const metadata = getMessageMetadata(message)
			// Hide messages that have no metadata (e.g. non-error api_req_started)
			if (!metadata) {
				return false
			}
			// Explicitly filter out retry_delayed
			if (message.say === "api_req_retry_delayed") {
				return false
			}
			// Apply timeline filters if enabled
			if (enableFilter && !activeFilters.includes(metadata.group)) {
				return false
			}
			return true
		})
	}, [messages, enableFilter, activeFilters])

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

	const handleTooltipMouseEnter = () => {
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current)
			hideTimeoutRef.current = null
		}
	}

	const handleMouseEnter = (
		message: ClineMessage,
		event: React.MouseEvent<HTMLDivElement>,
		searchResults?: SearchResult[],
	) => {
		handleTooltipMouseEnter() // Clear any pending hide timer
		setHoveredElement(event.currentTarget)
		setHoveredMessage(message)
		setHoveredSearchResults(searchResults)
	}

	const handleMouseLeave = () => {
		hideTimeoutRef.current = window.setTimeout(() => {
			setHoveredMessage(null)
			setHoveredElement(null)
			setHoveredSearchResults(undefined)
			setTooltipStyle((prev) => ({ ...prev, opacity: 0, pointerEvents: "none" }))
		}, 200)
	}

	return (
		<div ref={containerRef} className="relative w-full mt-1 mb-1 overflow-hidden">
			<div
				ref={scrollableRef}
				className="flex w-full overflow-x-auto overflow-y-hidden overscroll-y-contain scrollbar-hide"
				style={{ height: TIMELINE_HEIGHT, gap: BLOCK_GAP }}>
				{filteredMessages.map((message, index) => {
					const findCorrespondingSearchResult = (): SearchResult[] | undefined => {
						const tool = safeJsonParse<{ tool?: string }>(message.text)
						if (tool?.tool !== "codebaseSearch") {
							return undefined
						}

						// Find the next `codebase_search_result` message
						const resultMessage = messages.find((m, i) => i > index && m.say === "codebase_search_result")
						if (!resultMessage) return undefined

						const parsedResult = safeJsonParse<{
							content: { results: SearchResult[] }
						}>(resultMessage.text)
						return parsedResult?.content?.results
					}

					const handleClick = (e: React.MouseEvent) => {
						e.stopPropagation() // Prevent the click from bubbling up to the parent TaskItem
						if (onBlockClick) {
							onBlockClick(message.ts)
						}
					}

					const searchResults = findCorrespondingSearchResult()
					const icon = getMessageIcon(message)
					const color = getMessageColor(message)
					const isFirst = index === 0
					const isLast = index === filteredMessages.length - 1

					const getIconStyle = (): React.CSSProperties => {
						const style: React.CSSProperties = {
							width: BLOCK_WIDTH,
							backgroundColor: icon ? "transparent" : color,
						}

						if (icon && icon !== "git-commit") {
							style.width = ICON_WIDTH
							const paddingValue = "1px"
							if (isFirst) {
								style.paddingRight = paddingValue
							} else if (isLast) {
								style.paddingLeft = paddingValue
							}
							// Middle icons don't need padding as ICON_WIDTH handles it
						}
						return style
					}

					const rooLogoUri = (window as any).IMAGES_BASE_URI + "/roo-logo.svg"
					const renderIcon = (name: string) => {
						if (name === "roo") {
							return (
								<div
									className="w-full h-full"
									style={{
										backgroundColor: color,
										WebkitMaskImage: `url('${rooLogoUri}')`,
										WebkitMaskRepeat: "no-repeat",
										WebkitMaskSize: "contain",
										maskImage: `url('${rooLogoUri}')`,
										maskRepeat: "no-repeat",
										maskSize: "contain",
										width: ICON_WIDTH,
									}}
								/>
							)
						}
						return <span className={`codicon codicon-${name}`} style={{ color }}></span>
					}

					return (
						<div
							key={`${message.ts}-${index}`}
							className="h-full flex-shrink-0 cursor-pointer flex items-center justify-center"
							style={getIconStyle()}
							onMouseEnter={(e) => handleMouseEnter(message, e, searchResults)}
							onMouseLeave={handleMouseLeave}
							onClick={handleClick}>
							{icon && renderIcon(icon)}
						</div>
					)
				})}
			</div>

			<div
				ref={tooltipRef}
				style={tooltipStyle}
				onMouseEnter={handleTooltipMouseEnter}
				onMouseLeave={handleMouseLeave}>
				{hoveredMessage && (
					<TaskTimelineTooltip message={hoveredMessage} searchResults={hoveredSearchResults} />
				)}
			</div>
		</div>
	)
}

export default TaskTimeline
