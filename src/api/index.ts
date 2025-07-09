import { Anthropic } from "@anthropic-ai/sdk"

import type { ProviderSettings, ModelInfo } from "@roo-code/types"

import { ApiStream } from "./transform/stream"

import {
	GlamaHandler,
	AnthropicHandler,
	AwsBedrockHandler,
	OpenRouterHandler,
	VertexHandler,
	AnthropicVertexHandler,
	OpenAiHandler,
	OllamaHandler,
	LmStudioHandler,
	GeminiHandler,
	OpenAiNativeHandler,
	DeepSeekHandler,
	MistralHandler,
	VsCodeLmHandler,
	UnboundHandler,
	RequestyHandler,
	HumanRelayHandler,
	FakeAIHandler,
	XAIHandler,
	GroqHandler,
	ChutesHandler,
	LiteLLMHandler,
	ClaudeCodeHandler,
} from "./providers"

export interface SingleCompletionHandler {
	completePrompt(prompt: string): Promise<string>
}

export interface ApiHandlerCreateMessageMetadata {
	mode?: string
	taskId: string
}

export interface ApiHandler {
	createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream

	getModel(): { id: string; info: ModelInfo }

	/**
	 * Counts tokens for content blocks
	 * All providers extend BaseProvider which provides a default tiktoken implementation,
	 * but they can override this to use their native token counting endpoints
	 *
	 * @param content The content to count tokens for
	 * @returns A promise resolving to the token count
	 */
	countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number>
}

export function buildApiHandler(configuration: ProviderSettings): ApiHandler {
	switch (configuration.apiProvider) {
		case "anthropic":
			return new AnthropicHandler(configuration)
		case "claude-code":
			return new ClaudeCodeHandler(configuration)
		case "glama":
			return new GlamaHandler(configuration)
		case "openrouter":
			return new OpenRouterHandler(configuration)
		case "bedrock":
			return new AwsBedrockHandler(configuration)
		case "vertex":
			return configuration.apiModelId?.startsWith("claude")
				? new AnthropicVertexHandler(configuration)
				: new VertexHandler(configuration)
		case "openai":
			return new OpenAiHandler(configuration)
		case "ollama":
			return new OllamaHandler(configuration)
		case "lmstudio":
			return new LmStudioHandler(configuration)
		case "gemini":
			return new GeminiHandler(configuration)
		case "openai-native":
			return new OpenAiNativeHandler(configuration)
		case "deepseek":
			return new DeepSeekHandler(configuration)
		case "vscode-lm":
			return new VsCodeLmHandler(configuration)
		case "mistral":
			return new MistralHandler(configuration)
		case "unbound":
			return new UnboundHandler(configuration)
		case "requesty":
			return new RequestyHandler(configuration)
		case "human-relay":
			return new HumanRelayHandler()
		case "fake-ai":
			return new FakeAIHandler(configuration)
		case "xai":
			return new XAIHandler(configuration)
		case "groq":
			return new GroqHandler(configuration)
		case "chutes":
			return new ChutesHandler(configuration)
		case "litellm":
			return new LiteLLMHandler(configuration)
		default:
			return new AnthropicHandler(configuration)
	}
}
