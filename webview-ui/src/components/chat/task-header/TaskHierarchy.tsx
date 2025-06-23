import React, { useState, useMemo, useEffect } from "react"
import { Checkbox } from "@src/components/ui/checkbox"
import { HistoryItem } from "@roo-code/types"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@src/components/ui/tooltip"
import { ProgressIndicator } from "../ProgressIndicator"

interface TaskHierarchyProps {
	childTasks: HistoryItem[]
	onTaskClick?: (taskId: string) => void
	isTaskExpanded: boolean
}

export const TaskHierarchy: React.FC<TaskHierarchyProps> = ({ childTasks, onTaskClick, isTaskExpanded }) => {
	const COLLAPSE_THRESHOLD = 5
	const COLLAPSED_SHOW_COUNT = 0

	const [isExpanded, setIsExpanded] = useState(() => {
		return childTasks.length <= COLLAPSE_THRESHOLD
	})

	useEffect(() => {
		if (!isTaskExpanded) {
			setIsExpanded(false)
		}
	}, [isTaskExpanded])
	const getStatusIcon = (status?: string) => {
		switch (status) {
			case "running":
			case "paused":
				return <ProgressIndicator />
			case "completed":
				return (
					<Checkbox
						style={{
							transform: "scale(0.9)",
							color: "var(--button-primary-background)",
						}}
						checked={true}
						disabled
						className="h-4 w-4"
					/>
				)
			case "failed":
				return (
					<Checkbox
						style={{
							transform: "scale(0.9)",
							color: "var(--checkbox-foreground)",
						}}
						checked={false}
						disabled
						className="h-4 w-4"
					/>
				)
			case "pending":
			default:
				return (
					<Checkbox
						style={{
							transform: "scale(0.9)",
							color: "var(--checkbox-foreground)",
						}}
						checked={false}
						disabled
						className="h-4 w-4"
					/>
				)
		}
	}

	const getStatusColor = (status?: string) => {
		switch (status) {
			case "running":
				return "var(--checkbox-foreground)"
			case "paused":
				return "var(--vscode-terminal-ansiYellow)"
			case "completed":
				return "var(--button-primary-background)"
			case "failed":
				return "var(--vscode-terminal-ansiRed)"
			default:
				return "var(--vscode-foreground)"
		}
	}

	const displayTasks = isExpanded ? childTasks : childTasks.slice(0, COLLAPSED_SHOW_COUNT)
	const hiddenCount = childTasks.length - COLLAPSED_SHOW_COUNT

	const statusSummary = useMemo(() => {
		const statusCount = childTasks.reduce(
			(acc, task) => {
				const status = task.status || "unknown"
				acc[status] = (acc[status] || 0) + 1
				return acc
			},
			{} as Record<string, number>,
		)

		return Object.entries(statusCount)
			.filter(([, count]) => count > 0)
			.map(([status, count]) => (
				<div
					key={status}
					style={{
						display: "flex",
						alignItems: "center",
						gap: "4px",
						fontSize: "11px",
					}}>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							width: "16px",
							height: "16px",
						}}>
						{getStatusIcon(status)}
					</div>
					<span style={{ color: getStatusColor(status) }}>{count as number}</span>
				</div>
			))
	}, [childTasks])

	const handleToggle = () => {
		setIsExpanded(!isExpanded)
	}
	if (childTasks.length === 0) {
		return null
	}
	const renderListInContainer = (childTask: HistoryItem, children: React.ReactElement): React.ReactElement => {
		if (childTask.status === "pending") {
			return (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>{children}</TooltipTrigger>
						<TooltipContent>
							<p>Task is pending</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			)
		}
		return children
	}

	return (
		<div
			style={{
				marginTop: "12px",
				padding: "12px",
				backgroundColor: "var(--vscode-editor-background)",
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
			}}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					cursor: "pointer",
					padding: "4px 0",
					marginBottom: "8px",
					userSelect: "none",
				}}
				onClick={handleToggle}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "6px",
						fontSize: "13px",
						fontWeight: "bold",
						color: "var(--vscode-foreground)",
					}}>
					<span
						className={`codicon codicon-chevron-${isExpanded ? "down" : "right"}`}
						style={{ fontSize: "12px" }}
					/>
					<span>Child Task ({childTasks.length})</span>
					{!isExpanded && hiddenCount > 0 && (
						<span
							style={{
								fontSize: "11px",
								color: "var(--vscode-descriptionForeground)",
								fontWeight: "normal",
							}}>
							+{hiddenCount} more
						</span>
					)}
				</div>

				<div
					style={{
						display: "flex",
						gap: "8px",
						alignItems: "center",
					}}>
					{statusSummary}
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "6px",
					overflow: "hidden",
					transition: "all 0.2s ease-in-out",
				}}>
				{displayTasks.map((childTask, index) =>
					React.cloneElement(
						renderListInContainer(
							childTask,
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "8px",
									padding: "6px 8px",
									backgroundColor: "var(--vscode-list-hoverBackground)",
									borderRadius: "3px",
									cursor: onTaskClick ? "pointer" : "default",
									fontSize: "12px",
									transition: "background-color 0.1s ease",
								}}
								onClick={(e) => {
									if (childTask.status === "pending") {
										return
									}
									e.stopPropagation()
									onTaskClick?.(childTask.id)
								}}
								onMouseEnter={(e) => {
									if (onTaskClick) {
										e.currentTarget.style.backgroundColor =
											"var(--vscode-list-activeSelectionBackground)"
									}
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor = "var(--vscode-list-hoverBackground)"
								}}>
								<span
									style={{
										minWidth: "16px",
										fontSize: "14px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									{index + 1}.
								</span>

								{childTask.status && (
									<div
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											minWidth: "20px",
											height: "20px",
										}}>
										{getStatusIcon(childTask.status)}
									</div>
								)}

								<span
									style={{
										flex: 1,
										color: "var(--vscode-foreground)",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}>
									<span
										style={{
											fontSize: "10px",
											color: "var(--vscode-descriptionForeground)",
											marginRight: "6px",
											fontStyle: "italic",
										}}>
										[{childTask.status}]
									</span>
									{childTask.task}
								</span>

								<span
									style={{
										fontSize: "10px",
										color: "var(--vscode-descriptionForeground)",
										minWidth: "fit-content",
									}}>
									{new Date(childTask.ts).toLocaleTimeString()}
								</span>
							</div>,
						),
						{ key: childTask.id },
					),
				)}
			</div>
			{!isExpanded && hiddenCount > 0 && (
				<div
					style={{
						marginTop: "8px",
						padding: "4px 8px",
						textAlign: "center",
						fontSize: "11px",
						color: "var(--vscode-descriptionForeground)",
						cursor: "pointer",
						borderRadius: "3px",
						backgroundColor: "var(--vscode-button-secondaryBackground)",
						border: "1px solid var(--vscode-button-border)",
					}}
					onClick={handleToggle}
					onMouseEnter={(e) => {
						e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryHoverBackground)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryBackground)"
					}}>
					Click to expand all tasks ({hiddenCount} hidden)
				</div>
			)}
		</div>
	)
}
