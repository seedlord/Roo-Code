import React from "react"

interface SafeHighlightProps {
	text: string
	highlight: string
}

export const SafeHighlight: React.FC<SafeHighlightProps> = ({ text, highlight }) => {
	if (!highlight.trim()) {
		return <>{text}</>
	}
	const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")
	const parts = text.split(regex)

	return (
		<>
			{parts.map((part, i) =>
				regex.test(part) ? (
					<mark key={i} className="bg-transparent text-inherit font-bold p-0">
						{part}
					</mark>
				) : (
					<span key={i}>{part}</span>
				),
			)}
		</>
	)
}
