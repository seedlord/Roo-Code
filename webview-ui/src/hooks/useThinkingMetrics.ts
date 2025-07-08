import { useState, useEffect, useRef } from "react"
import { useInterval } from "react-use"

interface UseThinkingMetricsProps {
	startTimeTs?: number
	content: string
	durationMs?: number
	thinkingUsedTokens?: number
	thinkingTokensPerSecond?: number
}

export function useThinkingMetrics({
	startTimeTs,
	durationMs,
	thinkingUsedTokens,
	thinkingTokensPerSecond,
}: UseThinkingMetricsProps) {
	const [liveTime, setLiveTime] = useState(0)
	const isLive = !!startTimeTs

	const latestMetrics = useRef({
		time: 0,
		rate: 0,
		contentLength: 0,
	})

	useEffect(() => {
		if (isLive) {
			const initialElapsed = startTimeTs ? Date.now() - startTimeTs : 0
			setLiveTime(initialElapsed)
			latestMetrics.current = {
				time: initialElapsed,
				rate: thinkingTokensPerSecond ?? 0,
				contentLength: thinkingUsedTokens ?? 0,
			}
		}
	}, [isLive, startTimeTs, thinkingTokensPerSecond, thinkingUsedTokens])

	useInterval(
		() => {
			if (isLive && startTimeTs) {
				const newLiveTime = Date.now() - startTimeTs
				setLiveTime(newLiveTime)
				latestMetrics.current = {
					time: newLiveTime,
					rate: thinkingTokensPerSecond ?? 0,
					contentLength: thinkingUsedTokens ?? 0,
				}
			}
		},
		isLive ? 100 : null,
	)

	const displayTime = !isLive ? (durationMs ?? latestMetrics.current.time) : liveTime
	const displayRate = !isLive
		? (thinkingTokensPerSecond ?? latestMetrics.current.rate)
		: (thinkingTokensPerSecond ?? 0)
	const displayContentLength = !isLive
		? (thinkingUsedTokens ?? latestMetrics.current.contentLength)
		: (thinkingUsedTokens ?? 0)

	return { displayTime, displayRate, displayContentLength }
}
