import { Button } from "../ui/button"
import { useExtensionState, usePostMessage } from "@src/context/ExtensionStateContext"

const headerStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "10px",
	marginBottom: "12px",
}
export default function BackToParent() {
	const { currentTaskItem } = useExtensionState()
	const postMessage = usePostMessage()

	const handleBackToParent = () => {
		if (currentTaskItem?.parentId) {
			postMessage({
				type: "showTaskWithId",
				taskId: currentTaskItem.parentId,
			})
		}
	}

	return (
		currentTaskItem?.parentId && (
			<>
				<div
					style={{
						...headerStyle,
						marginBottom: "10px",
					}}>
					<div style={{ marginTop: 10 }}>
						<Button variant="secondary" onClick={handleBackToParent}>
							<span className="codicon codicon-arrow-left" style={{ marginRight: 6 }} />
							Back to parent Task
						</Button>
					</div>
				</div>
			</>
		)
	)
}
