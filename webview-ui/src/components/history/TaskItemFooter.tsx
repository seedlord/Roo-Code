import React from "react"
import type { HistoryItem } from "@roo-code/types"
import { Coins, TextSelect } from "lucide-react"
import { formatLargeNumber } from "@src/utils/format"
import { CopyButton } from "./CopyButton"
import { ExportButton } from "./ExportButton"

export interface TaskItemFooterProps {
	item: HistoryItem
	variant: "compact" | "full"
	isSelectionMode?: boolean
	isExpanded?: boolean
}

const TaskItemFooter: React.FC<TaskItemFooterProps> = ({
	item,
	variant,
	isSelectionMode = false,
	isExpanded = false,
}) => {
	return (
		<div className="text-xs text-vscode-descriptionForeground flex justify-between items-center mt-1">
			<div className="flex gap-2">
				{!isExpanded && (
					<>
						{!!(item.cacheReads || item.cacheWrites) && (
							<span className="flex items-center" data-testid="cache-compact">
								<i className="mr-1 codicon codicon-cloud-upload text-sm! text-vscode-descriptionForeground" />
								<span className="inline-block mr-1">{formatLargeNumber(item.cacheWrites || 0)}</span>
								<i className="mr-1 codicon codicon-cloud-download text-sm! text-vscode-descriptionForeground" />
								<span>{formatLargeNumber(item.cacheReads || 0)}</span>
							</span>
						)}
						{/* Full Tokens */}
						{!!(item.tokensIn || item.tokensOut) && (
							<span className="flex items-center gap-1">
								<span data-testid="tokens-in-footer-compact">
									↑ {formatLargeNumber(item.tokensIn || 0)}
								</span>
								<span data-testid="tokens-out-footer-compact">
									↓ {formatLargeNumber(item.tokensOut || 0)}
								</span>
							</span>
						)}

						{/* Full Cost */}
						{!!item.totalCost && (
							<span className="flex items-center">
								<Coins className="inline-block size-[1em] mr-1" />
								<span data-testid="cost-footer-compact">{"$" + item.totalCost.toFixed(2)}</span>
							</span>
						)}
						{item.contextTokens !== undefined && item.contextWindow !== undefined && (
							<span className="flex items-center gap-1">
								<TextSelect className="inline-block size-[1em]" />
								{formatLargeNumber(item.contextTokens)}
							</span>
						)}
					</>
				)}
			</div>

			{/* Action Buttons for non-compact view */}
			{!isSelectionMode && !isExpanded && (
				<div className="flex flex-row gap-0 items-center opacity-50 hover:opacity-100">
					<CopyButton itemTask={item.task} />
					{variant === "full" && <ExportButton itemId={item.id} />}
				</div>
			)}
		</div>
	)
}

export default TaskItemFooter
