import React from "react"
import { useTranslation } from "react-i18next"
import { ClineMessage } from "@roo-code/types"
import { safeJsonParse } from "@roo/safeJsonParse"

interface NewChildTaskProps {
	message: ClineMessage
}

export const NewChildTask: React.FC<NewChildTaskProps> = ({ message }) => {
	const { t } = useTranslation()
	const tool = safeJsonParse<any>(message.text)

	if (!tool) {
		return null
	}

	const toolIcon = (name: string) => (
		<span
			className={`codicon codicon-${name}`}
			style={{ color: "var(--vscode-foreground)", marginBottom: "-1.5px" }}></span>
	)

	return (
		<>
			<div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
				{toolIcon("split-horizontal")}
				<span style={{ fontWeight: "bold" }}>
					{message.type === "ask" ? t("chat:subtasks.wantsToCreateChild") : t("chat:subtasks.didCreateChild")}
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
					<strong>{t("chat:subtasks.prompt")}:</strong> {tool.prompt}
				</div>
				{tool.files && tool.files.length > 0 && (
					<div style={{ marginBottom: "8px" }}>
						<strong>{t("chat:subtasks.files")}:</strong>
						<ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
							{tool.files.map((file: string, index: number) => (
								<li key={index} style={{ listStyle: "disc" }}>
									<code>{file}</code>
								</li>
							))}
						</ul>
					</div>
				)}
				<div>
					<strong>{t("chat:subtasks.executeImmediately")}:</strong>{" "}
					{tool.execute_immediately === "true" ? t("common:answers.yes") : t("common:answers.no")}
				</div>
			</div>
		</>
	)
}

export default NewChildTask
