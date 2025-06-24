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
	const [displayTime, setDisplayTime] = useState(durationMs || 0)
	const [displayRate, setDisplayRate] = useState(thinkingTokensPerSecond || 0)
	const isThinking = typeof startTimeTs === "number" && startTimeTs > 0

	useEffect(() => {
		// If a final duration is provided, it's the source of truth.
		if (durationMs) {
			setDisplayTime(durationMs)
		}
		if (thinkingTokensPerSecond) {
			setDisplayRate(thinkingTokensPerSecond)
		}
		// If we are not thinking and have no final duration, do nothing.
		// This will keep the last `displayTime` from the live timer on screen.
	}, [durationMs, thinkingTokensPerSecond])

	useInterval(
		() => {
			// This runs every 100ms, independent of parent re-renders.
			if (isThinking) {
				const elapsed = Date.now() - startTimeTs
				setDisplayTime(elapsed)
				if (elapsed > 0) {
					setDisplayRate(content.length / (elapsed / 1000))
				}
			}
		},
		isThinking ? 100 : null, // Only run the interval when thinking.
	)

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
									<div className="text-muted-foreground">{`${content.length}/${modelMaxThinkingTokens}`}</div>
								)}
								{displayRate > 0 && (
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
