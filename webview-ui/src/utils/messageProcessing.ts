import { ClineMessage } from "@roo-code/types"
import { combineApiRequests } from "@roo/combineApiRequests"
import { combineCommandSequences } from "@roo/combineCommandSequences"
import { getMessageColor } from "../components/common/task-timeline/messageUtils"
import * as COLOR from "../components/common/task-timeline/colors"

/**
 * Processes a list of ClineMessages for display in the UI.
 * This function centralizes the logic for combining and filtering messages,
 * ensuring consistency between the ChatView and the TaskTimeline.
 *
 * The processing pipeline includes:
 * 1. Combining consecutive command sequences.
 * 2. Combining related API request messages.
 * 3. Filtering out messages that should not be displayed in the timeline.
 *
 * @param messages The raw array of ClineMessage objects from the task history.
 * @returns A new array of processed and filtered ClineMessage objects.
 */
export function processMessagesForDisplay(messages: ClineMessage[]): ClineMessage[] {
	if (messages.length <= 1) return []

	// The message processing pipeline MUST be identical to the one used in ChatView
	// to ensure that the indices align correctly for the click-to-scroll functionality.
	const processed = combineApiRequests(combineCommandSequences(messages.slice(1)))

	// Filter messages based on their assigned color.
	// Messages with DARK_GRAY are considered "hidden" or "unimportant" for the timeline.
	// This centralizes the filtering logic within messageUtils.ts.
	const filtered = processed.filter((msg) => {
		// Explicitly filter out empty text messages, as they have a color but no content.
		if (msg.type === "say" && msg.say === "text" && (!msg.text || msg.text.trim() === "")) {
			return false
		}

		// This is the crucial fix: After a user answers a follow-up question,
		// a completion_result 'ask' message is sent. This message is hidden in the main
		// chat view IF it has no text, so it MUST also be hidden here to keep the indices synchronized.
		if (msg.type === "ask" && msg.ask === "completion_result" && !msg.text) {
			return false
		}

		return getMessageColor(msg) !== COLOR.DARK_GRAY
	})

	return filtered
}
