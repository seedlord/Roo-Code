import { useCallback, useEffect, useRef, useState } from "react"
import { CounterClockwiseClockIcon } from "@radix-ui/react-icons"
import { useTranslation } from "react-i18next"
import { useMount } from "react-use"

import MarkdownBlock from "../common/MarkdownBlock"

// Custom hook for a declarative, stable interval
function useInterval(callback: () => void, delay: number | null) {
	const savedCallback = useRef<() => void>()

	useEffect(() => {
		savedCallback.current = callback
	}, [callback])

	useEffect(() => {
		function tick() {
			savedCallback.current?.()
		}
		if (delay !== null) {
			const id = setInterval(tick, delay)
			return () => clearInterval(id)
		}
	}, [delay])
}

interface ReasoningBlockProps {
	content: string
	durationMs?: number // Final duration in ms
	startTimeTs?: number // Start timestamp for a live timer
	thinkingTokensPerSecond?: number
	isCollapsed?: boolean
	onToggleCollapse?: () => void
	modelMaxThinkingTokens?: number
}

export const ReasoningBlock = ({
	content,
	durationMs,
	startTimeTs,
	thinkingTokensPerSecond,
	isCollapsed = false,
	onToggleCollapse,
	modelMaxThinkingTokens,
}: ReasoningBlockProps) => {
	const contentRef = useRef<HTMLDivElement>(null)
	const { t } = useTranslation("chat")

	// Animation logic
	const [thought, setThought] = useState<string>()
	const [prevThought, setPrevThought] = useState<string>(t("chat:reasoning.thinking"))
	const [isTransitioning, setIsTransitioning] = useState<boolean>(false)
	const cursorRef = useRef<number>(0)
	const queueRef = useRef<string[]>([])

	// Timer logic
	const startTimeRef = useRef<number | null>(null)
	const [liveTime, setLiveTime] = useState(0)
	const [liveRate, setLiveRate] = useState(0)
	const liveRateRef = useRef(0)
	const [liveContentLength, setLiveContentLength] = useState(0)
	const [animatedContentLength, setAnimatedContentLength] = useState(0)
	const [isFinal, setIsFinal] = useState(false)
	const lastMetrics = useRef({ time: 0, rate: 0, contentLength: 0 })

	// Effect to manage the timer and final state
	useEffect(() => {
		if (startTimeTs) {
			if (startTimeRef.current === null) {
				startTimeRef.current = Date.now()
			}
			setIsFinal(false) // Reset final state if we start thinking again
		} else {
			// If we were thinking and now we are not, finalize the state.
			if (startTimeRef.current !== null) {
				setIsFinal(true)
			}
		}
	}, [startTimeTs])

	// Fast interval for updating the live timer and rate.
	useInterval(
		() => {
			if (startTimeTs && !isFinal && startTimeRef.current) {
				const elapsedTime = Date.now() - startTimeRef.current
				setLiveTime(elapsedTime)

				// Update rate calculation within the same interval tick
				if (elapsedTime > 0) {
					const newRate = content.length / (elapsedTime / 1000)
					setLiveRate(newRate)
					liveRateRef.current = newRate
					setLiveContentLength(content.length)
				}

				// Animate the content length based on the live rate
				if (liveRateRef.current > 0) {
					const newAnimatedLength = Math.floor((elapsedTime / 1000) * liveRateRef.current)
					setAnimatedContentLength(newAnimatedLength)
				} else if (content.length > 0) {
					// If rate is not yet calculated but we have content, start animating towards it
					setAnimatedContentLength((prev) => {
						if (prev < content.length) {
							const diff = content.length - prev
							const step = Math.max(1, Math.ceil(diff / 5))
							return prev + step
						}
						return content.length
					})
				}
			}
		},
		startTimeTs && !isFinal ? 100 : null,
	)

	// Store the last known metrics before the thinking process ends to prevent flickering.
	if (startTimeTs && !isFinal) {
		lastMetrics.current = {
			time: liveTime,
			rate: liveRate,
			contentLength: liveContentLength,
		}
	}

	// Determine the final values to display.
	const hasStreamed = startTimeRef.current !== null
	const displayTime =
		startTimeTs && !isFinal
			? liveTime
			: hasStreamed
				? lastMetrics.current.time
				: (durationMs ?? lastMetrics.current.time)
	const displayRate =
		startTimeTs && !isFinal
			? liveRate
			: hasStreamed
				? lastMetrics.current.rate
				: (thinkingTokensPerSecond ?? lastMetrics.current.rate)
	const displayContentLength =
		startTimeTs && !isFinal
			? Math.min(animatedContentLength, modelMaxThinkingTokens ?? Infinity)
			: content.length || lastMetrics.current.contentLength

	useEffect(() => {
		if (contentRef.current && !isCollapsed) {
			contentRef.current.scrollTop = contentRef.current.scrollHeight
		}
	}, [content, isCollapsed])

	// Animation logic effects
	const processNextTransition = useCallback(() => {
		const nextThought = queueRef.current.pop()
		queueRef.current = []

		if (nextThought) {
			setIsTransitioning(true)
		}

		setTimeout(() => {
			if (nextThought) {
				setPrevThought(nextThought)
				setIsTransitioning(false)
			}

			setTimeout(() => processNextTransition(), 500)
		}, 200)
	}, [])

	useMount(() => {
		processNextTransition()
	})

	useEffect(() => {
		if (content.length - cursorRef.current > 160) {
			setThought("... " + content.slice(cursorRef.current))
			cursorRef.current = content.length
		}
	}, [content])

	useEffect(() => {
		if (thought && thought !== prevThought) {
			queueRef.current.push(thought)
		}
	}, [thought, prevThought])

	return (
		<div className="bg-vscode-editor-background border border-vscode-border rounded-xs overflow-hidden">
			<div
				className="flex items-center justify-between gap-1 pl-3 pr-[8px] cursor-pointer text-muted-foreground"
				onClick={onToggleCollapse}>
				<div className="flex items-center flex-1 gap-2 overflow-hidden">
					<div
						className={`truncate flex-1 transition-opacity duration-200 py-2 ${isTransitioning ? "opacity-0" : "opacity-100"}`}>
						{prevThought}
					</div>
					<div className="flex items-center">
						<div className="flex flex-row items-center">
							<div className="flex flex-col items-end text-xs">
								{modelMaxThinkingTokens && (
									<div className="text-muted-foreground">{`${displayContentLength}/${modelMaxThinkingTokens}`}</div>
								)}
								{displayTime > 0 && (
									<div>
										{t("reasoning.tokens_per_second", {
											rate: displayRate.toFixed(1),
										})}
									</div>
								)}
							</div>
							{displayTime > 0 && (
								<div className="flex items-center text-xs ml-2">
									<CounterClockwiseClockIcon className="scale-80" />
									<div>
										{t("reasoning.seconds_short", {
											time: (displayTime / 1000).toFixed(1),
										})}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
				<span className={`codicon codicon-chevron-${isCollapsed ? "down" : "up"}`}></span>
			</div>
			{!isCollapsed && (
				<div ref={contentRef} className="px-3 max-h-[160px] overflow-y-auto">
					<MarkdownBlock markdown={content} />
				</div>
			)}
		</div>
	)
}
