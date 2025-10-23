/**
 * Unified LLM Client
 * Supports both Anthropic SDK (direct) and OpenRouter API
 * Provides consistent interface for chat and terminal agents
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ContentBlock } from '@anthropic-ai/sdk/resources/messages';

// ============================================================================
// Types
// ============================================================================

export type LLMProvider = 'anthropic' | 'openrouter';

export interface LLMClientConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl?: string; // For OpenRouter: https://openrouter.ai/api/v1
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  id: string;
  model: string;
  role: 'assistant';
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  // OpenRouter-specific metadata
  metadata?: {
    cost?: number;
    provider?: string;
  };
}

export interface StreamChunk {
  type: 'content_block_delta' | 'content_block_start' | 'content_block_stop' | 'message_start' | 'message_delta' | 'message_stop';
  delta?: any;
  content_block?: ContentBlock;
  message?: any;
}

// ============================================================================
// OpenRouter API Types
// ============================================================================

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string; // For function results
}

interface OpenRouterTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

interface OpenRouterChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    // Legacy format (OpenAI pre-Nov 2023)
    function_call?: {
      name: string;
      arguments: string;
    };
    // Modern format (OpenAI Nov 2023+, used by most models including Qwen, GPT-4, Gemini, DeepSeek)
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  finish_reason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter' | null;
}

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: OpenRouterChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// Unified LLM Client
// ============================================================================

export class UnifiedLLMClient {
  private config: LLMClientConfig;
  private anthropic: Anthropic | null = null;

  constructor(config: LLMClientConfig) {
    this.config = config;

    // Initialize Anthropic client if using direct provider
    if (config.provider === 'anthropic') {
      this.anthropic = new Anthropic({ apiKey: config.apiKey });
    }
  }

  /**
   * Send a message and get a response
   */
  async sendMessage(
    messages: MessageParam[],
    systemPrompt?: string,
    tools?: Tool[],
    stream: boolean = false
  ): Promise<LLMResponse> {
    if (this.config.provider === 'anthropic') {
      return await this.sendAnthropicMessage(messages, systemPrompt, tools, stream);
    } else {
      return await this.sendOpenRouterMessage(messages, systemPrompt, tools, stream);
    }
  }

  /**
   * Send message using Anthropic SDK
   */
  private async sendAnthropicMessage(
    messages: MessageParam[],
    systemPrompt?: string,
    tools?: Tool[],
    stream: boolean = false
  ): Promise<LLMResponse> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized');
    }

    const params: any = {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens || 8192,
      temperature: this.config.temperature || 0.7,
    };

    if (systemPrompt) {
      params.system = systemPrompt;
    }

    if (tools && tools.length > 0) {
      params.tools = tools;
    }

    if (stream) {
      // Streaming not implemented in this version - return non-streamed
      console.warn('[UnifiedLLMClient] Streaming requested but not implemented, using non-streamed response');
    }

    const response = await this.anthropic.messages.create(params);

    return {
      id: response.id,
      model: response.model,
      role: 'assistant',
      content: response.content,
      stop_reason: response.stop_reason,
      usage: response.usage,
    };
  }

  /**
   * Send message using OpenRouter API
   */
  private async sendOpenRouterMessage(
    messages: MessageParam[],
    systemPrompt?: string,
    tools?: Tool[],
    stream: boolean = false
  ): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || 'https://openrouter.ai/api/v1';

    // Convert Anthropic message format to OpenRouter (OpenAI-compatible) format
    const openRouterMessages = this.convertMessagesToOpenRouter(messages, systemPrompt);

    // Convert Anthropic tools to OpenRouter (OpenAI-compatible) format
    const openRouterTools = tools ? this.convertToolsToOpenRouter(tools) : undefined;

    const requestBody: any = {
      model: this.config.model,
      messages: openRouterMessages,
      temperature: this.config.temperature || 0.7,
      max_tokens: this.config.maxTokens || 8192,
    };

    if (openRouterTools && openRouterTools.length > 0) {
      requestBody.tools = openRouterTools;
      requestBody.tool_choice = 'auto';
    }

    if (stream) {
      requestBody.stream = true;
    }

    console.log('[OpenRouter] Sending request:', {
      model: this.config.model,
      messageCount: openRouterMessages.length,
      toolCount: openRouterTools?.length || 0,
      stream
    });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vaporform.dev',
        'X-Title': 'Vaporform',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OpenRouter] API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });

      // Parse OpenRouter error response for better error messages
      let userFriendlyMessage = `OpenRouter API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.message) {
          userFriendlyMessage = errorJson.error.message;

          // Add specific guidance for common errors
          if (response.status === 402) {
            userFriendlyMessage += '\n\nTo fix this:\n1. Add credits to your OpenRouter account at https://openrouter.ai/settings/credits\n2. Or switch to Anthropic provider in Settings > AI';
          } else if (response.status === 401) {
            userFriendlyMessage += '\n\nPlease check your API key in Settings > AI';
          } else if (response.status === 429) {
            userFriendlyMessage += '\n\nPlease wait a moment and try again';
          }
        }
      } catch (parseError) {
        // If JSON parsing fails, use the raw error text
        userFriendlyMessage += ` - ${errorText}`;
      }

      throw new Error(userFriendlyMessage);
    }

    const data: OpenRouterResponse = await response.json();

    console.log('[OpenRouter] Received response:', {
      id: data.id,
      model: data.model,
      usage: data.usage,
      choiceCount: data.choices.length
    });

    // Convert OpenRouter response back to Anthropic format
    return this.convertResponseFromOpenRouter(data, response);
  }

  /**
   * Convert Anthropic messages to OpenRouter (OpenAI-compatible) format
   */
  private convertMessagesToOpenRouter(
    messages: MessageParam[],
    systemPrompt?: string
  ): OpenRouterMessage[] {
    const converted: OpenRouterMessage[] = [];

    // Add system message first if provided
    if (systemPrompt) {
      converted.push({
        role: 'system',
        content: systemPrompt
      });
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        // Convert user message
        if (typeof msg.content === 'string') {
          converted.push({
            role: 'user',
            content: msg.content
          });
        } else if (Array.isArray(msg.content)) {
          // Handle content blocks (text, tool_result, etc.)
          const textParts: string[] = [];
          const toolResults: any[] = [];

          for (const block of msg.content) {
            if (block.type === 'text') {
              textParts.push(block.text);
            } else if (block.type === 'tool_result') {
              toolResults.push(block);
            }
          }

          // Add text content if present
          if (textParts.length > 0) {
            converted.push({
              role: 'user',
              content: textParts.join('\n\n')
            });
          }

          // Add tool results as function messages
          for (const toolResult of toolResults) {
            converted.push({
              role: 'function',
              name: toolResult.tool_use_id || 'function_result',
              content: typeof toolResult.content === 'string'
                ? toolResult.content
                : JSON.stringify(toolResult.content)
            });
          }
        }
      } else if (msg.role === 'assistant') {
        // Convert assistant message
        if (typeof msg.content === 'string') {
          converted.push({
            role: 'assistant',
            content: msg.content
          });
        } else if (Array.isArray(msg.content)) {
          // Extract text and tool_use from content blocks
          const textParts: string[] = [];
          let toolUse: any = null;

          for (const block of msg.content) {
            if (block.type === 'text') {
              textParts.push(block.text);
            } else if (block.type === 'tool_use') {
              toolUse = block;
            }
          }

          // OpenRouter doesn't support mixed content + function_call in same message
          // So we split into separate messages if both present
          if (textParts.length > 0 && !toolUse) {
            converted.push({
              role: 'assistant',
              content: textParts.join('\n\n')
            });
          } else if (toolUse) {
            // For OpenRouter, tool use is represented as assistant message with empty content
            // The actual function call info is in a separate field (but we'll simulate it)
            converted.push({
              role: 'assistant',
              content: textParts.length > 0 ? textParts.join('\n\n') : ''
            });
          }
        }
      }
    }

    return converted;
  }

  /**
   * Convert Anthropic tools to OpenRouter (OpenAI-compatible) format
   */
  private convertToolsToOpenRouter(tools: Tool[]): OpenRouterTool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema
      }
    }));
  }

  /**
   * Convert OpenRouter response back to Anthropic format
   */
  private convertResponseFromOpenRouter(
    data: OpenRouterResponse,
    response: Response
  ): LLMResponse {
    const choice = data.choices[0];
    if (!choice) {
      throw new Error('No choices in OpenRouter response');
    }

    const content: ContentBlock[] = [];

    // Handle MODERN format: tool_calls array (preferred, used by most models)
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      console.log(`[OpenRouter] Processing ${choice.message.tool_calls.length} tool call(s) (modern format)`);

      for (const toolCall of choice.message.tool_calls) {
        let parsedInput: any;
        try {
          parsedInput = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          console.error('[OpenRouter] Failed to parse tool arguments:', toolCall.function.arguments);
          parsedInput = {};
        }

        content.push({
          type: 'tool_use',
          id: toolCall.id || `toolu_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          name: toolCall.function.name,
          input: parsedInput
        });

        console.log(`[OpenRouter] Tool call: ${toolCall.function.name} (id: ${toolCall.id})`);
      }
    }
    // Handle LEGACY format: function_call (backward compatibility)
    else if (choice.message.function_call) {
      console.log('[OpenRouter] Processing function call (legacy format)');

      let parsedInput: any;
      try {
        parsedInput = JSON.parse(choice.message.function_call.arguments);
      } catch (e) {
        console.error('[OpenRouter] Failed to parse function arguments:', choice.message.function_call.arguments);
        parsedInput = {};
      }

      content.push({
        type: 'tool_use',
        id: `toolu_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        name: choice.message.function_call.name,
        input: parsedInput
      });

      console.log(`[OpenRouter] Function call: ${choice.message.function_call.name}`);
    }

    // Add text content if present
    if (choice.message.content) {
      content.push({
        type: 'text',
        text: choice.message.content
      });
    }

    // Extract cost and provider info from response headers (if available)
    const cost = response.headers.get('x-openrouter-cost');
    const provider = response.headers.get('x-openrouter-provider');

    // Map finish reason (support both legacy and modern format)
    let stopReason: LLMResponse['stop_reason'] = null;
    if (choice.finish_reason === 'stop') {
      stopReason = 'end_turn';
    } else if (choice.finish_reason === 'length') {
      stopReason = 'max_tokens';
    } else if (choice.finish_reason === 'function_call' || choice.finish_reason === 'tool_calls') {
      stopReason = 'tool_use';
    }

    // Comprehensive logging for debugging
    console.log('[OpenRouter] Response analysis:', {
      hasModernToolCalls: !!choice.message.tool_calls,
      hasLegacyFunctionCall: !!choice.message.function_call,
      modernToolCount: choice.message.tool_calls?.length || 0,
      finishReason: choice.finish_reason,
      mappedStopReason: stopReason,
      contentBlockCount: content.length,
      hasTextContent: !!choice.message.content
    });

    return {
      id: data.id,
      model: data.model,
      role: 'assistant',
      content,
      stop_reason: stopReason,
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens
      },
      metadata: {
        cost: cost ? parseFloat(cost) : undefined,
        provider: provider || undefined
      }
    };
  }
}
