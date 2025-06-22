import React from "react"
import * as Tooltip from "@radix-ui/react-tooltip"

interface HeroTooltipProps {
	content: React.ReactNode
	children: React.ReactNode
	className?: string
	delay?: number
	placement?: "top" | "bottom" | "left" | "right"
}

/**
 * HeroTooltip component that wraps the Radix UI tooltip with styling
 * similar to TaskTimelineTooltip
 */
const HeroTooltip: React.FC<HeroTooltipProps> = ({ content, children, className, delay = 0, placement = "top" }) => {
	// If content is a simple string, wrap it in the tailwind styled divs
	const formattedContent =
		typeof content === "string" ? (
			<div
				className={`bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]
      border border-[var(--vscode-widget-border)] rounded p-2 w-full shadow-md text-xs max-w-[250px] ${className}`}>
				<div
					className="whitespace-pre-wrap break-words max-h-[150px] overflow-y-auto text-[11px]
        font-[var(--vscode-editor-font-family)]  p-1 rounded">
					{content}
				</div>
			</div>
		) : (
			// If content is already a React node, assume it's pre-formatted
			content
		)

	return (
		<Tooltip.Provider>
			<Tooltip.Root delayDuration={delay}>
				<Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Content
						side={placement}
						className="hero-tooltip-content pointer-events-none z-50"
						sideOffset={5}>
						{formattedContent}
						<Tooltip.Arrow className="fill-current text-[var(--vscode-widget-border)]" />
					</Tooltip.Content>
				</Tooltip.Portal>
			</Tooltip.Root>
		</Tooltip.Provider>
	)
}

export default HeroTooltip
