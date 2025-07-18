import * as vscode from "vscode"
import { OpenAICompatibleEmbedder } from "./openai-compatible"
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from "../interfaces/embedder"
import { GEMINI_MAX_ITEM_TOKENS } from "../constants"
import { t } from "../../../i18n"
import { TelemetryEventName } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

/**
 * Gemini embedder implementation that wraps the OpenAI Compatible embedder
 * with configuration for Google's Gemini embedding API.
 *
 * Supported models:
 * - text-embedding-004 (dimension: 768)
 * - gemini-embedding-001 (dimension: 2048)
 */
export class GeminiEmbedder implements IEmbedder {
	private readonly apiKeys: string[]
	private keyIndex = 0
	private static readonly GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
	private static readonly DEFAULT_MODEL = "gemini-embedding-001"
	private readonly modelId: string
	private static readonly MAX_RETRIES = 3
	private static readonly INITIAL_RETRY_DELAY = 500 // ms

	private readonly _onKeyUsage = new vscode.EventEmitter<{ current: number; total: number }>()
	public readonly onKeyUsage = this._onKeyUsage.event

	constructor(apiKeys: string[], modelId?: string) {
		if (!apiKeys || apiKeys.length === 0) {
			throw new Error(t("embeddings:validation.apiKeyRequired"))
		}
		this.apiKeys = apiKeys
		this.modelId = modelId || GeminiEmbedder.DEFAULT_MODEL
	}

	private getNextApiKey(): { key: string; index: number } {
		const currentIndex = this.keyIndex
		const key = this.apiKeys[currentIndex]
		this.keyIndex = (this.keyIndex + 1) % this.apiKeys.length
		return { key, index: currentIndex + 1 } // Return 1-based index for UI
	}

	private createClient(apiKey: string): OpenAICompatibleEmbedder {
		return new OpenAICompatibleEmbedder(
			GeminiEmbedder.GEMINI_BASE_URL,
			apiKey,
			this.modelId,
			GEMINI_MAX_ITEM_TOKENS,
			true, // Disable retries in the compatible embedder
		)
	}

	/**
	 * Creates embeddings for the given texts using Gemini's embedding API
	 * @param texts Array of text strings to embed
	 * @param model Optional model identifier (uses constructor model if not provided)
	 * @param options Optional options for embedding creation, such as dimension
	 * @param cancellationToken Optional cancellation token to support cancellation
	 * @returns Promise resolving to embedding response
	 */
	async createEmbeddings(
		texts: string[],
		model?: string,
		options?: { dimension?: number },
		cancellationToken?: vscode.CancellationToken,
	): Promise<EmbeddingResponse> {
		if (cancellationToken?.isCancellationRequested) {
			throw new vscode.CancellationError()
		}
		const modelToUse = model || this.modelId
		let lastError: any
		const initialKeyIndex = this.keyIndex

		for (let i = 0; i < this.apiKeys.length * GeminiEmbedder.MAX_RETRIES; i++) {
			if (cancellationToken?.isCancellationRequested) {
				throw new vscode.CancellationError()
			}
			const { key: apiKey, index: keyIndexForDisplay } = this.getNextApiKey()
			this._onKeyUsage.fire({ current: keyIndexForDisplay, total: this.apiKeys.length })

			const client = this.createClient(apiKey)

			try {
				const result = await client.createEmbeddings(texts, modelToUse, options, cancellationToken)
				this._onKeyUsage.fire({ current: 0, total: 0 }) // Reset on success
				return result
			} catch (error: any) {
				if (error instanceof vscode.CancellationError) {
					throw error
				}
				lastError = error
				const errorMessage = error.message || ""
				// Immediately cycle to the next key if the current one is invalid
				if (error.status === 400 && errorMessage.includes("API key not valid")) {
					console.warn(
						`Invalid Gemini API key ${keyIndexForDisplay}/${this.apiKeys.length}. Trying next key.`,
					)
					continue // Go to the next key
				}

				// Handle rate limiting with backoff, then try the same key again
				if (error.status === 429 || errorMessage.includes("429")) {
					const delay = GeminiEmbedder.INITIAL_RETRY_DELAY * Math.pow(2, Math.floor(i / this.apiKeys.length))
					console.warn(
						`Rate limit hit on key ${keyIndexForDisplay}/${this.apiKeys.length}. Retrying in ${delay}ms.`,
					)
					await new Promise((resolve) => setTimeout(resolve, delay))
					if (cancellationToken?.isCancellationRequested) {
						throw new vscode.CancellationError()
					}
				}
				// For other errors, we still continue to the next key
			}
		}

		this._onKeyUsage.fire({ current: 0, total: 0 }) // Reset on failure
		TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
			error: lastError instanceof Error ? lastError.message : String(lastError),
			stack: lastError instanceof Error ? lastError.stack : undefined,
			location: "GeminiEmbedder:createEmbeddings",
		})
		throw new Error(
			`Failed to create embeddings after trying all API keys with retries. Last error: ${lastError?.message}`,
		)
	}

	async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
		let lastError: string | undefined

		for (const apiKey of this.apiKeys) {
			const client = this.createClient(apiKey)
			const result = await client.validateConfiguration()
			if (result.valid) {
				return { valid: true } // Found a valid key
			}
			lastError = result.error
		}

		// If no key was valid, return the last error
		return {
			valid: false,
			error: lastError || t("embeddings:validation.allKeysInvalid"),
		}
	}

	/**
	 * Returns information about this embedder
	 */
	get embedderInfo(): EmbedderInfo {
		return {
			name: "gemini",
		}
	}

	dispose(): void {
		this._onKeyUsage.dispose()
	}
}
