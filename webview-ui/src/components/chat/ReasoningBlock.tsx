import { useCallback, useEffect, useRef, useState } from "react"
import { CounterClockwiseClockIcon } from "@radix-ui/react-icons"
import { useTranslation } from "react-i18next"
import { useMount } from "react-use"

import { cn } from "@src/lib/utils"
import { useThinkingMetrics } from "@src/hooks/useThinkingMetrics"

import MarkdownBlock from "../common/MarkdownBlock"

interface ReasoningBlockProps {
	content: string
	durationMs?: number
	startTimeTs?: number
	isCollapsed?: boolean
	onToggleCollapse?: () => void
	modelMaxThinkingTokens?: number
	thinkingUsedTokens?: number
	thinkingTokensPerSecond?: number
}

export const ReasoningBlock = ({
	content,
	durationMs,
	startTimeTs,
	isCollapsed = false,
	onToggleCollapse,
	modelMaxThinkingTokens,
	thinkingUsedTokens,
	thinkingTokensPerSecond,
}: ReasoningBlockProps) => {
	const contentRef = useRef<HTMLDivElement>(null)
	const { t } = useTranslation("chat")

	const { displayTime, displayRate, displayContentLength } = useThinkingMetrics({
		startTimeTs,
		content,
		durationMs,
		thinkingUsedTokens,
		thinkingTokensPerSecond,
	})

	// Animation logic for the "thought" text
	const [thought, setThought] = useState<string>()
	const [prevThought, setPrevThought] = useState<string>(t("chat:reasoning.thinking"))
	const [isTransitioning, setIsTransitioning] = useState<boolean>(false)
	const cursorRef = useRef<number>(0)
	const queueRef = useRef<string[]>([])

	useEffect(() => {
		if (contentRef.current && !isCollapsed) {
			contentRef.current.scrollTop = contentRef.current.scrollHeight
		}
	}, [content, isCollapsed])

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
						className={`truncate flex-1 transition-opacity duration-200 py-2 ${
							isTransitioning ? "opacity-0" : "opacity-100"
						}`}>
						{prevThought}
					</div>
					<div className="flex items-center">
						<div className="flex flex-row items-center">
							<div className="flex flex-col items-end text-xs">
								{modelMaxThinkingTokens && (
									<div
										className={cn(
											"text-muted-foreground",
											displayContentLength > modelMaxThinkingTokens &&
												"text-vscode-errorForeground",
										)}>
										{`${Math.floor(displayContentLength)}/${modelMaxThinkingTokens}`}
									</div>
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
