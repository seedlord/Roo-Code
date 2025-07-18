import { Event } from "vscode"
/**
 * Interface for code index embedders.
 * This interface is implemented by both OpenAI and Ollama embedders.
 */
export interface IEmbedder {
	/**
	 * Event that fires when an API key is used, particularly for multi-key embedders.
	 * Carries the current key index (1-based) and the total number of keys.
	 * A value of 0 for `current` indicates the process is resetting/finished.
	 */
	readonly onKeyUsage?: Event<{ current: number; total: number }>

	/**
	 * Creates embeddings for the given texts.
	 * @param texts Array of text strings to create embeddings for
	 * @param model Optional model ID to use for embeddings
	 * @returns Promise resolving to an EmbeddingResponse
	 */
	createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse>

	/**
	 * Validates the embedder configuration by testing connectivity and credentials.
	 * @returns Promise resolving to validation result with success status and optional error message
	 */
	validateConfiguration(): Promise<{ valid: boolean; error?: string }>

	/**
	 * Disposes of any resources used by the embedder, such as event listeners.
	 */
	dispose?(): void

	get embedderInfo(): EmbedderInfo
}

export interface EmbeddingResponse {
	embeddings: number[][]
	usage?: {
		promptTokens: number
		totalTokens: number
	}
}

export type AvailableEmbedders = "openai" | "ollama" | "openai-compatible" | "gemini"

export interface EmbedderInfo {
	name: AvailableEmbedders
}
