import { vitest, describe, it, expect, beforeEach } from "vitest"
import type { MockedClass } from "vitest"
import { GeminiEmbedder } from "../gemini"
import { OpenAICompatibleEmbedder } from "../openai-compatible"

// Mock the OpenAICompatibleEmbedder
vitest.mock("../openai-compatible")

// Mock TelemetryService
vitest.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureEvent: vitest.fn(),
		},
	},
}))

const MockedOpenAICompatibleEmbedder = OpenAICompatibleEmbedder as MockedClass<typeof OpenAICompatibleEmbedder>

describe("GeminiEmbedder", () => {
	let embedder: GeminiEmbedder

	beforeEach(() => {
		vitest.clearAllMocks()
	})

	describe("constructor", () => {
		it("should create an instance with default model when no model specified", () => {
			// Arrange
			const apiKey = "test-gemini-api-key"

			// Act
			embedder = new GeminiEmbedder([apiKey])

			// Assert
			// Note: We can't easily test the key rotation here, as createClient is private.
			// The expectation is that the compatible embedder is created with *a* key.
			expect(MockedOpenAICompatibleEmbedder).toHaveBeenCalledWith(
				"https://generativelanguage.googleapis.com/v1beta/openai/",
				apiKey,
				"gemini-embedding-001",
				2048,
				true,
			)
		})

		it("should create an instance with specified model", () => {
			// Arrange
			const apiKey = "test-gemini-api-key"
			const modelId = "text-embedding-004"

			// Act
			embedder = new GeminiEmbedder([apiKey], modelId)

			// Assert
			expect(MockedOpenAICompatibleEmbedder).toHaveBeenCalledWith(
				"https://generativelanguage.googleapis.com/v1beta/openai/",
				apiKey,
				"text-embedding-004",
				2048,
				true,
			)
		})

		it("should throw error when API key is not provided", () => {
			// Act & Assert
			expect(() => new GeminiEmbedder([])).toThrow("validation.apiKeyRequired")
			expect(() => new GeminiEmbedder(null as any)).toThrow("validation.apiKeyRequired")
			expect(() => new GeminiEmbedder(undefined as any)).toThrow("validation.apiKeyRequired")
		})
	})

	describe("embedderInfo", () => {
		it("should return correct embedder info", () => {
			// Arrange
			embedder = new GeminiEmbedder(["test-api-key"])

			// Act
			const info = embedder.embedderInfo

			// Assert
			expect(info).toEqual({
				name: "gemini",
			})
		})

		// Note: The new implementation of createEmbeddings handles retries internally and is harder to mock.
		// These tests are simplified to reflect that the call is made.
		// More detailed testing would require deeper mocking of the retry loop.
		describe("createEmbeddings", () => {
			it("should eventually succeed after rate limit errors", async () => {
				// Arrange
				const apiKeys = ["key1", "key2"]
				embedder = new GeminiEmbedder(apiKeys, "text-embedding-004")
				const texts = ["test text 1"]
				const mockSuccessResponse = { embeddings: [[0.1, 0.2]], usage: { promptTokens: 10, totalTokens: 10 } }

				// Mock the createEmbeddings method to fail on the first key and succeed on the second
				const mockCreateEmbeddings = vitest.fn()
				mockCreateEmbeddings
					.mockRejectedValueOnce({ status: 429, message: "Rate limit exceeded" }) // Fail for key1
					.mockResolvedValueOnce(mockSuccessResponse) // Succeed for key2
				MockedOpenAICompatibleEmbedder.prototype.createEmbeddings = mockCreateEmbeddings

				// Act
				const result = await embedder.createEmbeddings(texts)

				// Assert
				expect(result).toEqual(mockSuccessResponse)
				expect(mockCreateEmbeddings).toHaveBeenCalledTimes(2)
			})

			it("should throw error after all keys and retries fail", async () => {
				// Arrange
				const apiKeys = ["key1", "key2"]
				embedder = new GeminiEmbedder(apiKeys, "text-embedding-004")
				const texts = ["test text 1"]
				const finalError = { status: 429, message: "Rate limit exceeded" }

				// Mock createEmbeddings to always fail
				const mockCreateEmbeddings = vitest.fn().mockRejectedValue(finalError)
				MockedOpenAICompatibleEmbedder.prototype.createEmbeddings = mockCreateEmbeddings

				// Act & Assert
				await expect(embedder.createEmbeddings(texts)).rejects.toThrow(
					"Failed to create embeddings after trying all API keys with retries. Last error: Rate limit exceeded",
				)
				// It will be called once per key per retry attempt
				expect(mockCreateEmbeddings).toHaveBeenCalledTimes(apiKeys.length * 3) // 3 is the MAX_RETRIES in the embedder
			})
		})
	})

	describe("validateConfiguration", () => {
		let mockValidateConfiguration: any

		beforeEach(() => {
			mockValidateConfiguration = vitest.fn()
			MockedOpenAICompatibleEmbedder.prototype.validateConfiguration = mockValidateConfiguration
		})

		it("should delegate validation to OpenAICompatibleEmbedder", async () => {
			// Arrange
			embedder = new GeminiEmbedder(["test-api-key"])
			mockValidateConfiguration.mockResolvedValue({ valid: true })

			// Act
			const result = await embedder.validateConfiguration()

			// Assert
			expect(mockValidateConfiguration).toHaveBeenCalled()
			expect(result).toEqual({ valid: true })
		})

		it("should pass through validation errors from OpenAICompatibleEmbedder", async () => {
			// Arrange
			embedder = new GeminiEmbedder(["test-api-key"])
			mockValidateConfiguration.mockResolvedValue({
				valid: false,
				error: "embeddings:validation.authenticationFailed",
			})

			// Act
			const result = await embedder.validateConfiguration()

			// Assert
			expect(mockValidateConfiguration).toHaveBeenCalled()
			expect(result).toEqual({
				valid: false,
				error: "embeddings:validation.authenticationFailed",
			})
		})

		it("should handle validation exceptions", async () => {
			// Arrange
			embedder = new GeminiEmbedder(["test-api-key"])
			mockValidateConfiguration.mockRejectedValue(new Error("Validation failed"))

			// Act & Assert
			await expect(embedder.validateConfiguration()).rejects.toThrow("Validation failed")
		})
	})
})
