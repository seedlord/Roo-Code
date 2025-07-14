import React, { useState, useEffect, useMemo } from "react"
import { Database } from "lucide-react"
import { cn } from "@src/lib/utils"
import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { CodeIndexPopover } from "./CodeIndexPopover"
import type { IndexingStatus, IndexingStatusUpdateMessage } from "@roo/ExtensionMessage"

interface IndexingStatusBadgeProps {
	className?: string
}

export const IndexingStatusBadge: React.FC<IndexingStatusBadgeProps> = ({ className }) => {
	const { t } = useAppTranslation()
	const [indexingStatus, setIndexingStatus] = useState<IndexingStatus>({
		systemStatus: "Standby",
		processedItems: 0,
		totalItems: 0,
		currentItemUnit: "items",
	})

	useEffect(() => {
		// Request initial indexing status
		vscode.postMessage({ type: "requestIndexingStatus" })

		// Set up message listener for status updates
		const handleMessage = (event: MessageEvent<IndexingStatusUpdateMessage>) => {
			if (event.data.type === "indexingStatusUpdate") {
				const status = event.data.values
				setIndexingStatus(status)
			}
		}

		window.addEventListener("message", handleMessage)

		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [])

	// Calculate progress percentage with memoization
	const progressPercentage = useMemo(
		() =>
			indexingStatus.totalItems > 0
				? Math.round((indexingStatus.processedItems / indexingStatus.totalItems) * 100)
				: 0,
		[indexingStatus.processedItems, indexingStatus.totalItems],
	)

	// Get tooltip text with internationalization
	const getTooltipText = () => {
		switch (indexingStatus.systemStatus) {
			case "Standby":
				return t("chat:indexingStatus.ready")
			case "Indexing":
				return t("chat:indexingStatus.indexing", { percentage: progressPercentage })
			case "Indexed":
				return t("chat:indexingStatus.indexed")
			case "Error":
				return t("chat:indexingStatus.error")
			default:
				return t("chat:indexingStatus.status")
		}
	}

	// Get status color classes for the badge dot
	const getStatusColorClass = () => {
		const statusColors = {
			Standby: "bg-vscode-descriptionForeground/60",
			Indexing: "bg-yellow-500 animate-pulse",
			Indexed: "bg-green-500",
			Error: "bg-red-500",
		}

		return statusColors[indexingStatus.systemStatus as keyof typeof statusColors] || statusColors.Standby
	}

	return (
		<div className={cn("relative inline-block", className)}>
			<CodeIndexPopover indexingStatus={indexingStatus} tooltip={getTooltipText()}>
				<button
					className={cn(
						"relative inline-flex items-center justify-center",
						"bg-transparent border-none p-1.5",
						"rounded-md min-w-[28px] min-h-[28px]",
						"opacity-85 text-vscode-foreground",
						"transition-all duration-150",
						"hover:opacity-100 hover:bg-vscode-toolbar-hoverBackground",
						"focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder",
						"active:bg-[rgba(255,255,255,0.1)]",
						"cursor-pointer",
						className,
					)}
					aria-label={getTooltipText()}>
					{/* File search icon */}
					<Database className="w-4 h-4 text-vscode-foreground" />

					{/* Status dot badge */}
					<span
						className={cn(
							"absolute top-1 right-1 w-1.5 h-1.5 rounded-full transition-colors duration-200",
							getStatusColorClass(),
						)}
					/>
				</button>
			</CodeIndexPopover>
		</div>
	)
}
