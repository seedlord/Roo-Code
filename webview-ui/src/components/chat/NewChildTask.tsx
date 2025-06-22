import React from "react"
import { ClineMessage } from "@roo-code/types"
import { safeJsonParse } from "@roo/safeJsonParse"
import { ClineSayTool } from "@roo/ExtensionMessage"

interface NewChildTaskProps {
	message: ClineMessage
}

export const NewChildTask: React.FC<NewChildTaskProps> = ({ message }) => {
	const tool = safeJsonParse<ClineSayTool>(message.text)

	if (!tool) {
		return null
	}

	const toolIcon = (name: string) => (
		<span
			className={`codicon codicon-${name}`}
			style={{ color: "var(--vscode-foreground)", marginBottom: "-1.5px" }}></span>
	)

	const headerStyle: React.CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: "10px",
		marginBottom: "10px",
		wordBreak: "break-word",
	}

	return (
		<>
			<div style={headerStyle}>
				{toolIcon("split-horizontal")}
				<span style={{ fontWeight: "bold" }}>
					{message.type === "ask" ? "Cline wants to create a child task:" : "Cline created a child task:"}
				</span>
			</div>
			<div
				style={{
					borderRadius: 3,
					backgroundColor: "var(--vscode-input-background)",
					padding: "12px",
					border: "1px solid var(--vscode-editorGroup-border)",
				}}>
				<div style={{ marginBottom: "8px" }}>
					<strong>Task:</strong> {tool.prompt}
				</div>
				{tool.files && tool.files.length > 0 && (
					<div style={{ marginBottom: "8px" }}>
						<strong>Files:</strong>
						<ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
							{tool.files.map((file, index) => (
								<li key={index} style={{ listStyle: "disc" }}>
									<code>{file}</code>
								</li>
							))}
						</ul>
					</div>
				)}
				<div>
					<strong>Execute immediately:</strong> {tool.executeImmediately ? "Yes" : "No"}
				</div>
			</div>
		</>
	)
}
