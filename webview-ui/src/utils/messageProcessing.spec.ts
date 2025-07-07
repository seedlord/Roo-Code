import { describe, it, expect } from "vitest"
import { processChatHistory } from "./messageProcessing"
import { ClineMessage } from "@roo-code/types"
import { LRUCache } from "lru-cache"

// Mock the LRUCache
const createMockCache = () => new LRUCache({ max: 100 })

describe("processChatHistory", () => {
	it("should return an empty array if no messages are provided", () => {
		const messages: ClineMessage[] = []
		const everVisibleMessagesTsRef = { current: createMockCache() }
		const result = processChatHistory(messages, false, everVisibleMessagesTsRef)
		expect(result).toEqual([])
	})

	it("should remove the first message", () => {
		const messages: ClineMessage[] = [
			{ type: "say", say: "api_req_deleted", ts: 1 }, // This message should be skipped
			{ type: "say", say: "text", text: "Hello", ts: 2 },
		]
		const everVisibleMessagesTsRef = { current: createMockCache() }
		const result = processChatHistory(messages, false, everVisibleMessagesTsRef)
		expect(result).toHaveLength(1)
		// @ts-expect-error - result[0] is a ClineMessage here
		expect(result[0].text).toBe("Hello")
	})

	it("should filter out empty text messages", () => {
		const messages: ClineMessage[] = [
			{ type: "say", say: "api_req_deleted", ts: 1 },
			{ type: "say", say: "text", text: "", ts: 2 },
		]
		const everVisibleMessagesTsRef = { current: createMockCache() }
		const result = processChatHistory(messages, false, everVisibleMessagesTsRef)
		expect(result).toHaveLength(0)
	})

	it("should filter out always hidden messages", () => {
		const messages: ClineMessage[] = [
			{ type: "say", say: "api_req_deleted", ts: 1 },
			{ type: "say", say: "api_req_finished", ts: 2 },
			{ type: "ask", ask: "resume_task", ts: 3 },
			{ type: "say", say: "text", text: "Visible", ts: 4 },
		]
		const everVisibleMessagesTsRef = { current: createMockCache() }
		const result = processChatHistory(messages, false, everVisibleMessagesTsRef)
		expect(result).toHaveLength(1)
		// @ts-expect-error - result[0] is a ClineMessage here
		expect(result[0].text).toBe("Visible")
	})

	it("should show api_req_retry_delayed only when it is the last message", () => {
		const messages: ClineMessage[] = [
			{ type: "say", say: "api_req_deleted", ts: 1 },
			{ type: "say", say: "api_req_retry_delayed", ts: 2 },
		]
		const everVisibleMessagesTsRef = { current: createMockCache() }
		const result = processChatHistory(messages, false, everVisibleMessagesTsRef)
		expect(result).toHaveLength(1)
		// @ts-expect-error - result[0] is a ClineMessage here
		expect(result[0].say).toBe("api_req_retry_delayed")
	})

	it("should hide api_req_retry_delayed when it is not the last message", () => {
		const messages: ClineMessage[] = [
			{ type: "say", say: "api_req_deleted", ts: 1 },
			{ type: "say", say: "api_req_retry_delayed", ts: 2 },
			{ type: "say", say: "text", text: "Another message", ts: 3 },
		]
		const everVisibleMessagesTsRef = { current: createMockCache() }
		const result = processChatHistory(messages, false, everVisibleMessagesTsRef)
		expect(result).toHaveLength(1)
		// @ts-expect-error - result[0] is a ClineMessage here
		expect(result[0].text).toBe("Another message")
	})

	describe("Browser Session Grouping", () => {
		it("should group messages within a browser session", () => {
			const messages: ClineMessage[] = [
				{ type: "say", say: "api_req_deleted", ts: 1 },
				{ type: "ask", ask: "browser_action_launch", ts: 2 },
				{ type: "say", say: "text", text: "Inside session", ts: 3 },
			]
			const everVisibleMessagesTsRef = { current: createMockCache() }
			const result = processChatHistory(messages, false, everVisibleMessagesTsRef)
			expect(result).toHaveLength(1)
			expect(Array.isArray(result[0])).toBe(true)
			const group = result[0] as ClineMessage[]
			expect(group).toHaveLength(2)
			expect(group[0].ask).toBe("browser_action_launch")
			expect(group[1].text).toBe("Inside session")
		})

		it("should end a browser session on a close action", () => {
			const messages: ClineMessage[] = [
				{ type: "say", say: "api_req_deleted", ts: 1 },
				{ type: "ask", ask: "browser_action_launch", ts: 2 },
				{ type: "say", say: "text", text: "Inside session", ts: 3 },
				{ type: "say", say: "browser_action", text: JSON.stringify({ action: "close" }), ts: 4 },
				{ type: "say", say: "text", text: "Outside session", ts: 5 },
			]
			const everVisibleMessagesTsRef = { current: createMockCache() }
			const result = processChatHistory(messages, false, everVisibleMessagesTsRef)
			expect(result).toHaveLength(2)
			expect(Array.isArray(result[0])).toBe(true)
			expect(result[1]).not.toBeInstanceOf(Array)
			// @ts-expect-error - result[1] is a ClineMessage here
			expect(result[1].text).toBe("Outside session")
		})

		it("should end a browser session on a non-session message", () => {
			const messages: ClineMessage[] = [
				{ type: "say", say: "api_req_deleted", ts: 1 },
				{ type: "ask", ask: "browser_action_launch", ts: 2 },
				{ type: "say", say: "text", text: "Inside session", ts: 3 },
				{ type: "ask", ask: "command", text: "/unrelated", ts: 4 }, // This should break the session
			]
			const everVisibleMessagesTsRef = { current: createMockCache() }
			const result = processChatHistory(messages, false, everVisibleMessagesTsRef)
			expect(result).toHaveLength(2)
			expect(Array.isArray(result[0])).toBe(true)
			expect(result[1]).not.toBeInstanceOf(Array)
			// @ts-expect-error - result[1] is a ClineMessage here
			expect(result[1].text).toBe("/unrelated")
		})

		it("should handle multiple browser sessions", () => {
			const messages: ClineMessage[] = [
				{ type: "say", say: "api_req_deleted", ts: 1 },
				{ type: "ask", ask: "browser_action_launch", ts: 2 },
				{ type: "say", say: "browser_action", text: JSON.stringify({ action: "close" }), ts: 3 },
				{ type: "ask", ask: "browser_action_launch", ts: 4 },
				{ type: "say", say: "text", text: "Second session", ts: 5 },
			]
			const everVisibleMessagesTsRef = { current: createMockCache() }
			const result = processChatHistory(messages, false, everVisibleMessagesTsRef)
			expect(result).toHaveLength(2)
			expect(Array.isArray(result[0])).toBe(true)
			expect(Array.isArray(result[1])).toBe(true)
			const group1 = result[0] as ClineMessage[]
			const group2 = result[1] as ClineMessage[]
			expect(group1).toHaveLength(2)
			expect(group2).toHaveLength(2)
			expect(group2[1].text).toBe("Second session")
		})
	})
})
