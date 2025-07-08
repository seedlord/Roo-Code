import React from "react"

interface EditableValueProps {
	value: number | undefined | null
	title: string
	formatValue: (value: number | undefined | null) => string
	onClick: () => void // New prop to handle click
}

export const EditableValue: React.FC<EditableValueProps> = ({ value, title, formatValue, onClick }) => {
	if (value === undefined || value === null) {
		return (
			<span title={title} className="block whitespace-nowrap overflow-hidden text-ellipsis">
				{formatValue(value)}
			</span>
		)
	}

	return (
		<button
			onClick={onClick} // Use the new onClick prop
			title={title}
			className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer enabled:hover:bg-vscode-list-hoverBackground rounded px-1">
			{formatValue(value)}
		</button>
	)
}
