import React from "react"

interface EditableValueProps {
	value: number | undefined | null
	title: string
	onClick: () => void
	formatValue: (value: number | undefined | null) => string
}

export const EditableValue: React.FC<EditableValueProps> = ({ value, title, onClick, formatValue }) => {
	return (
		<span
			title={title}
			className="block whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer"
			onClick={onClick}>
			{formatValue(value)}
		</span>
	)
}
