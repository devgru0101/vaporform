'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import {
  AgentMessage,
  AgentState,
  ToolUse,
  ToolStatus,
  AgentConfig,
  ToolExecutionContext,
} from '@/lib/agent/types';
import { AgentToolExecutor, AGENT_TOOLS } from '@/lib/agent/tools';
import { api } from '@/lib/api';
import { parseMarkdown } from './markdown';
import { AgentTerminalMode } from '../terminal/AgentTerminalMode';
import './AgentChatPanel.css';

interface AgentChatPanelProps {
  projectId: string;
  workspaceId?: string;
  onClose?: () => void;
}

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  projectId,
  workspaceId,
  onClose,
}) => {
  const { userId, getToken } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // NEW: Command approval queue system
  const [approvalQueue, setApprovalQueue] = useState<ToolUse[]>([]);
  const [currentApproval, setCurrentApproval] = useState<ToolUse | null>(null);
  const [showApprovalDetails, setShowApprovalDetails] = useState(true);
  const [autoApproveAll, setAutoApproveAll] = useState(false);

  const [agentMode, setAgentMode] = useState<'chat' | 'terminal'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toolExecutorRef = useRef<AgentToolExecutor | null>(null);
  const isProcessingToolRef = useRef<boolean>(false);
  const lastProcessedMessageIdRef = useRef<string | null>(null);
  const toolExecutionCountRef = useRef<Map<string, number>>(new Map()); // Track tool execution counts for loop detection
  const pendingToolExecutionsRef = useRef<Set<string>>(new Set()); // Track tool_use IDs currently being executed

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Load or create chat session and history
  useEffect(() => {
    async function loadChatSession() {
      try {
        setIsLoadingHistory(true);

        // Try to get existing session for this project
        const response = await api.listChatSessions(projectId);
        const sessions = response.sessions || response; // Handle both {sessions: [...]} and [...] formats

        let currentSessionId: string;
        if (sessions && sessions.length > 0) {
          // Use the most recent session
          currentSessionId = sessions[0].id;
        } else {
          // Create a new session
          const newSession = await api.createChatSession(projectId, 'Agent Chat');
          currentSessionId = newSession.session?.id || newSession.id; // Handle both formats
        }

        setSessionId(currentSessionId);

        // Load messages from the session
        const messagesResponse = await api.getChatMessages(currentSessionId);
        const chatMessages = messagesResponse.messages || messagesResponse; // Handle both {messages: [...]} and [...] formats
        if (chatMessages && chatMessages.length > 0) {
          // Transform messages to match AgentMessage format
          const transformedMessages: AgentMessage[] = chatMessages.map((msg: any, index: number) => {
            // Parse content if it's a JSON string (happens when ContentBlock[] was stringified)
            let content = msg.content;
            if (typeof content === 'string' && (content.startsWith('[') || content.startsWith('{'))) {
              try {
                content = JSON.parse(content);
              } catch {
                // If parsing fails, keep as string
              }
            }

            return {
              id: `msg-loaded-${index}-${Date.now()}`,
              role: msg.role,
              content, // Now properly handles both string and parsed array
              timestamp: msg.timestamp instanceof Date ? msg.timestamp.getTime() : (typeof msg.timestamp === 'number' ? msg.timestamp : Date.now()),
              toolUse: msg.metadata?.toolUse, // Extract toolUse from metadata if present
            };
          });

          // Clean loaded messages to fix any corrupted tool_use/tool_result pairing
          // This repairs old sessions that may have broken message history
          console.log('[Session Load] Loaded messages before cleaning:', transformedMessages.length);
          const cleanedMessages = repairMessageHistory(transformedMessages);
          console.log('[Session Load] Messages after cleaning:', cleanedMessages.length);

          setMessages(cleanedMessages);
        }
      } catch (error) {
        console.error('Failed to load chat session:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    }

    if (projectId) {
      loadChatSession();
    }
  }, [projectId]);

  // Initialize tool executor
  useEffect(() => {
    toolExecutorRef.current = new AgentToolExecutor(API_URL);

    // Set token getter function to get fresh tokens on each request
    if (toolExecutorRef.current) {
      toolExecutorRef.current.setTokenGetter(getToken);
    }
  }, [API_URL, getToken]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // NEW: Process approval queue - show next command when current is resolved
  useEffect(() => {
    if (!currentApproval && approvalQueue.length > 0) {
      // Pop the first command from the queue
      const [nextApproval, ...remaining] = approvalQueue;
      setCurrentApproval(nextApproval);
      setApprovalQueue(remaining);
      setShowApprovalDetails(true); // Auto-expand details for new approval
    }
  }, [currentApproval, approvalQueue]);

  // Auto-continuation effect - watches for new tool_result messages
  // IMPROVED: Only auto-continue if there's no pending approval AND all tools have completed
  useEffect(() => {
    // Skip if we're already processing, still loading history, no messages, or there's a pending approval
    if (isProcessingToolRef.current || isLoadingHistory || messages.length === 0 || currentApproval || approvalQueue.length > 0) {
      return;
    }

    // CRITICAL: Check if there are pending tool executions - wait for ALL tools to complete
    if (pendingToolExecutionsRef.current.size > 0) {
      console.log('[Auto-continuation] Waiting for pending tools:', {
        pendingCount: pendingToolExecutionsRef.current.size,
        pendingIds: Array.from(pendingToolExecutionsRef.current)
      });
      return;
    }

    // Find the last message with tool_result content
    const lastMessage = messages[messages.length - 1];

    // Check if it's a user message with tool_result that we haven't processed yet
    const isToolResult =
      lastMessage?.role === 'user' &&
      Array.isArray(lastMessage.content) &&
      lastMessage.content.some((block: any) => block.type === 'tool_result');

    // Don't auto-continue if the second-to-last message is an error
    const previousMessage = messages[messages.length - 2];
    const previousIsError = previousMessage?.role === 'assistant' &&
      typeof previousMessage.content === 'string' &&
      previousMessage.content.startsWith('Error:');

    if (isToolResult && !previousIsError && lastMessage.id !== lastProcessedMessageIdRef.current) {
      console.log('[Auto-continuation] Triggering - all tools completed');
      // Mark this message as processed to prevent duplicate continuations
      lastProcessedMessageIdRef.current = lastMessage.id;
      isProcessingToolRef.current = true;

      // Continue the conversation with the current messages state
      continueChatWithToolResult(messages)
        .finally(() => {
          isProcessingToolRef.current = false;
        });
    }
  }, [messages, isLoadingHistory, currentApproval, approvalQueue]);

  // NEW: Keyboard shortcuts for approval
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle if there's a current approval and input is not focused
      if (!currentApproval || document.activeElement === inputRef.current) {
        return;
      }

      if (e.key === 'Enter' || e.key === 'y') {
        e.preventDefault();
        handleApproveTool();
      } else if (e.key === 'Escape' || e.key === 'n') {
        e.preventDefault();
        handleDenyTool();
      } else if (e.key === 'd') {
        e.preventDefault();
        setShowApprovalDetails(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentApproval]);

  const addMessage = async (role: 'user' | 'assistant', content: string, toolUse?: ToolUse) => {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: Date.now(),
      toolUse,
    };
    setMessages((prev) => [...prev, message]);

    // Save message to backend if we have a session
    if (sessionId) {
      try {
        await api.addChatMessage(sessionId, role, content, toolUse ? { toolUse } : undefined);
      } catch (error) {
        console.error('Failed to save message:', error);
        // Don't block the UI if saving fails
      }
    }

    return message;
  };

  const saveMessage = async (message: AgentMessage) => {
    if (sessionId) {
      try {
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
        // Map 'tool' role to 'user' for API compatibility (tool results are user messages with special content)
        const role = message.role === 'tool' ? 'user' : message.role;
        await api.addChatMessage(sessionId, role, content, message.toolUse ? { toolUse: message.toolUse } : undefined);
      } catch (error) {
        console.error('Failed to save message:', error);
      }
    }
  };

  const updateLastMessage = (updates: Partial<AgentMessage>) => {
    setMessages((prev) => {
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];
      if (lastMessage) {
        Object.assign(lastMessage, updates);
      }
      return newMessages;
    });
  };

  // Repair corrupted message history loaded from database
  // Removes orphaned tool_use and tool_result blocks to fix old sessions
  const repairMessageHistory = (msgs: AgentMessage[]): AgentMessage[] => {
    // Build maps of tool_use and tool_result blocks by ID
    const toolUseMap = new Map<string, number>();
    const toolResultMap = new Map<string, number>();

    msgs.forEach((msg, idx) => {
      if (Array.isArray(msg.content)) {
        msg.content.forEach((block: any) => {
          if (block.type === 'tool_use' && block.id) {
            toolUseMap.set(block.id, idx);
          }
          if (block.type === 'tool_result' && block.tool_use_id) {
            toolResultMap.set(block.tool_use_id, idx);
          }
        });
      }
    });

    console.log('[Repair History] Tool pairing analysis:', {
      totalMessages: msgs.length,
      toolUseCount: toolUseMap.size,
      toolResultCount: toolResultMap.size,
      orphanedToolUse: Array.from(toolUseMap.keys()).filter(id => !toolResultMap.has(id)),
      orphanedToolResult: Array.from(toolResultMap.keys()).filter(id => !toolUseMap.has(id)),
    });

    // Filter out orphaned tool blocks from each message
    const repairedMessages: AgentMessage[] = [];

    for (const msg of msgs) {
      if (!Array.isArray(msg.content)) {
        // Simple text message - keep as-is
        repairedMessages.push(msg);
        continue;
      }

      // Filter blocks to remove orphaned tool_use and tool_result
      const filteredBlocks: any[] = [];

      msg.content.forEach((block: any) => {
        if (block.type === 'tool_use') {
          // Only include if it has a corresponding result
          if (toolResultMap.has(block.id)) {
            filteredBlocks.push(block);
          } else {
            console.warn('[Repair History] Removing orphaned tool_use:', block.id);
          }
        } else if (block.type === 'tool_result') {
          // Only include if it has a corresponding use
          if (toolUseMap.has(block.tool_use_id)) {
            filteredBlocks.push(block);
          } else {
            console.warn('[Repair History] Removing orphaned tool_result:', block.tool_use_id);
          }
        } else {
          // Keep all other blocks (text, image, etc.)
          filteredBlocks.push(block);
        }
      });

      // Only include message if it has content after filtering
      if (filteredBlocks.length > 0) {
        repairedMessages.push({
          ...msg,
          content: filteredBlocks,
        });
      } else {
        console.warn('[Repair History] Skipping empty message:', msg.id);
      }
    }

    console.log('[Repair History] Repair complete:', {
      originalMessages: msgs.length,
      repairedMessages: repairedMessages.length,
      messagesRemoved: msgs.length - repairedMessages.length,
    });

    return repairedMessages;
  };

  // Validate and clean message history for Claude API
  // CRITICAL: Enforces strict adjacency rule - tool_use in message[i] must have tool_result in message[i+1]
  const cleanMessagesForClaude = (msgs: AgentMessage[]) => {
    console.log('[Claude Messages] Starting strict adjacency validation for', msgs.length, 'messages');

    // Step 1: Build adjacency maps - track which tool_use blocks have adjacent tool_result blocks
    const validToolUseIds = new Set<string>();
    const validToolResultIds = new Set<string>();

    // Check each consecutive pair of messages for valid tool_use → tool_result adjacency
    for (let i = 0; i < msgs.length - 1; i++) {
      const currentMsg = msgs[i];
      const nextMsg = msgs[i + 1];

      // Tool_use must be in assistant message, tool_result must be in user message
      if (currentMsg.role === 'assistant' && nextMsg.role === 'user' &&
          Array.isArray(currentMsg.content) && Array.isArray(nextMsg.content)) {

        // Get tool_use IDs from current message
        const toolUseIds = currentMsg.content
          .filter((b: any) => b.type === 'tool_use')
          .map((b: any) => b.id);

        // Get tool_result IDs from next message
        const toolResultIds = nextMsg.content
          .filter((b: any) => b.type === 'tool_result')
          .map((b: any) => b.tool_use_id);

        // Mark tool_use/tool_result pairs that are properly adjacent
        toolUseIds.forEach(id => {
          if (toolResultIds.includes(id)) {
            validToolUseIds.add(id);
            validToolResultIds.add(id);
            console.log('[Claude Messages] Valid adjacent pair found:', { toolUseId: id, msgIndex: i });
          }
        });
      }
    }

    console.log('[Claude Messages] Adjacency validation complete:', {
      validPairs: validToolUseIds.size,
      validToolUseIds: Array.from(validToolUseIds),
      validToolResultIds: Array.from(validToolResultIds),
    });

    // Step 2: Filter messages to only include valid tool blocks
    const cleaned: { role: string; content: any }[] = [];

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];

      if (!Array.isArray(msg.content)) {
        // Simple text message - include as-is
        cleaned.push({ role: msg.role, content: msg.content });
        continue;
      }

      // Filter blocks based on strict adjacency validation
      const filteredBlocks: any[] = [];

      msg.content.forEach((block: any) => {
        if (block.type === 'tool_use') {
          // Only include if this tool_use has an adjacent tool_result
          if (validToolUseIds.has(block.id)) {
            filteredBlocks.push(block);
            console.log('[Claude Messages] Including adjacent tool_use:', block.id);
          } else {
            console.warn('[Claude Messages] Excluding non-adjacent tool_use:', block.id);
          }
        } else if (block.type === 'tool_result') {
          // Only include if this tool_result has an adjacent tool_use
          if (validToolResultIds.has(block.tool_use_id)) {
            filteredBlocks.push(block);
            console.log('[Claude Messages] Including adjacent tool_result for:', block.tool_use_id);
          } else {
            console.warn('[Claude Messages] Excluding non-adjacent tool_result for:', block.tool_use_id);
          }
        } else {
          // Include all other block types (text, image, etc.)
          filteredBlocks.push(block);
        }
      });

      // Only include the message if it has content after filtering
      if (filteredBlocks.length > 0) {
        cleaned.push({
          role: msg.role,
          content: filteredBlocks
        });
      } else {
        console.warn('[Claude Messages] Skipping empty message at index', i);
      }
    }

    console.log('[Claude Messages] Cleaning result:', {
      originalCount: msgs.length,
      cleanedCount: cleaned.length,
      cleaned: cleaned.map((m, i) => ({
        index: i,
        role: m.role,
        contentType: Array.isArray(m.content) ? 'array' : 'string',
        blocks: Array.isArray(m.content) ? m.content.map((b: any) => b.type) : 'text',
      }))
    });

    // CRITICAL: Prevent sending empty messages array to Claude
    if (cleaned.length === 0) {
      console.error('[Claude Messages] Cleaning resulted in empty array! Falling back to original user messages only');

      // Fallback: Keep only user messages with text content
      const fallbackMessages = msgs
        .filter(msg => msg.role === 'user')
        .map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string'
            ? msg.content
            : (Array.isArray(msg.content)
                ? msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
                : String(msg.content))
        }))
        .filter(msg => msg.content && msg.content.trim().length > 0);

      if (fallbackMessages.length > 0) {
        console.warn('[Claude Messages] Using fallback:', fallbackMessages);
        return fallbackMessages;
      }

      // Last resort: Return a single message asking for help
      console.error('[Claude Messages] No valid messages found, returning emergency fallback');
      return [{
        role: 'user',
        content: 'Hello, I need help with this project.'
      }];
    }

    return cleaned;
  };

  // NEW: Add tool to approval queue
  const queueToolForApproval = (toolUse: ToolUse) => {
    // If auto-approve is enabled, execute immediately
    if (autoApproveAll) {
      handleToolExecution(toolUse);
      return;
    }

    if (currentApproval) {
      // There's already an approval pending - add to queue
      setApprovalQueue(prev => [...prev, toolUse]);
    } else {
      // No current approval - make this the current one
      setCurrentApproval(toolUse);
      setShowApprovalDetails(true);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isThinking || !userId) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    // Add user message to the conversation
    const newUserMessage = await addMessage('user', userMessage);

    // Start AI response
    setIsThinking(true);

    try {
      const token = await getToken();

      // Build and clean complete message history
      const allMessages = cleanMessagesForClaude([...messages, newUserMessage]);

      const response = await fetch(`${API_URL}/ai/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId,
          messages: allMessages, // Send full conversation history
          tools: AGENT_TOOLS,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Process AI response
      if (data.content) {
        // Check if response includes tool use
        const toolUseContent = Array.isArray(data.content)
          ? data.content.find((block: any) => block.type === 'tool_use')
          : null;

        if (toolUseContent) {
          // AI wants to use a tool - store the full content array
          const toolUse: ToolUse = {
            id: toolUseContent.id,
            tool: toolUseContent.name,
            params: toolUseContent.input,
            status: 'pending',
          };

          // Store full content array to preserve tool_use blocks for conversation history
          const message: AgentMessage = {
            id: `msg-${Date.now()}-${Math.random()}`,
            role: 'assistant',
            content: data.content, // Store full array with tool_use blocks
            timestamp: Date.now(),
            toolUse,
          };
          setMessages((prev) => [...prev, message]);
          saveMessage(message);

          // ALL tools go through approval queue (respects autoApproveAll toggle)
          queueToolForApproval(toolUse);
        } else {
          // Regular text response
          const textContent = typeof data.content === 'string'
            ? data.content
            : Array.isArray(data.content)
            ? data.content.find((block: any) => block.type === 'text')?.text || ''
            : '';

          addMessage('assistant', textContent);
        }
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);
      addMessage('assistant', `Error: ${error.message}`);
    } finally {
      setIsThinking(false);
    }
  };

  // Helper function to execute a tool (used by both manual and auto-approve)
  const handleToolExecution = async (tool: ToolUse) => {
    if (!toolExecutorRef.current || !userId) return;

    // Loop detection: Track tool execution counts
    const toolKey = `${tool.tool}:${JSON.stringify(tool.params)}`;
    const currentCount = toolExecutionCountRef.current.get(toolKey) || 0;

    if (currentCount >= 3) {
      console.error('[Loop Detection] Tool executed too many times, stopping:', { tool: tool.tool, params: tool.params, count: currentCount });
      addMessage('assistant', `⚠️ Loop detected: "${tool.tool}" was requested ${currentCount} times with same parameters. Stopping execution to prevent infinite loop.`);
      return;
    }

    toolExecutionCountRef.current.set(toolKey, currentCount + 1);

    // Reset counts after 30 seconds (normal usage shouldn't hit this)
    setTimeout(() => {
      toolExecutionCountRef.current.delete(toolKey);
    }, 30000);

    // Track this tool as pending execution
    pendingToolExecutionsRef.current.add(tool.id);
    console.log('[Tool Execution] Started:', { toolId: tool.id, tool: tool.tool, pendingCount: pendingToolExecutionsRef.current.size });

    setIsExecuting(true);

    // Update tool status to executing
    updateLastMessage({
      toolUse: { ...tool, status: 'executing' as ToolStatus },
    });

    try {
      const context: ToolExecutionContext = {
        projectId,
        workspaceId,
        userId,
        cwd: '/',
      };

      const result = await toolExecutorRef.current.executeTool(tool, context);

      // Update tool status to completed
      updateLastMessage({
        toolUse: { ...tool, status: 'completed' as ToolStatus },
      });

      // Add tool result as a user message to maintain conversation history
      const toolResultMessage: AgentMessage = {
        id: `msg-${Date.now()}-${Math.random()}`,
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: tool.id,
          content: result.content,
        }],
        timestamp: Date.now(),
      };

      // Add the tool result to messages
      setMessages((prev) => [...prev, toolResultMessage]);

      // Mark tool as no longer pending
      pendingToolExecutionsRef.current.delete(tool.id);
      console.log('[Tool Execution] Completed:', { toolId: tool.id, pendingCount: pendingToolExecutionsRef.current.size });

      // NOTE: Don't auto-continue here - let the useEffect handle it after ALL tools complete
    } catch (error: any) {
      console.error('Tool execution failed:', error);
      updateLastMessage({
        toolUse: { ...tool, status: 'error' as ToolStatus },
      });
      addMessage('assistant', `Tool execution failed: ${error.message}`);

      // Mark tool as no longer pending even on error
      pendingToolExecutionsRef.current.delete(tool.id);
      console.log('[Tool Execution] Failed:', { toolId: tool.id, pendingCount: pendingToolExecutionsRef.current.size });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleApproveTool = async () => {
    if (!currentApproval) return;

    const tool = currentApproval;
    setCurrentApproval(null); // Clear current approval immediately

    await handleToolExecution(tool);
  };

  const handleDenyTool = () => {
    if (!currentApproval) return;

    const tool = currentApproval;
    setCurrentApproval(null); // Clear current approval immediately

    updateLastMessage({
      toolUse: { ...tool, status: 'denied' as ToolStatus },
    });

    addMessage('assistant', 'Tool use denied. How else can I help you?');
  };

  // NEW: Approve all pending commands
  const handleApproveAll = async () => {
    if (!currentApproval) return;

    // Collect all pending approvals
    const allApprovals = [currentApproval, ...approvalQueue];

    // Clear the queue and current approval
    setCurrentApproval(null);
    setApprovalQueue([]);
    setIsExecuting(true);

    // Execute all tools in sequence
    for (const tool of allApprovals) {
      try {
        // Update status to executing
        updateLastMessage({
          toolUse: { ...tool, status: 'executing' as ToolStatus },
        });

        const context: ToolExecutionContext = {
          projectId,
          workspaceId,
          userId: userId!,
          cwd: '/',
        };

        const result = await toolExecutorRef.current!.executeTool(tool, context);

        // Update status to completed
        updateLastMessage({
          toolUse: { ...tool, status: 'completed' as ToolStatus },
        });

        // Add tool result
        const toolResultMessage: AgentMessage = {
          id: `msg-${Date.now()}-${Math.random()}`,
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: tool.id,
            content: result.content,
          }],
          timestamp: Date.now(),
        };

        setMessages(prev => [...prev, toolResultMessage]);
        saveMessage(toolResultMessage);
      } catch (error: any) {
        console.error('Tool execution failed:', error);
        updateLastMessage({
          toolUse: { ...tool, status: 'error' as ToolStatus },
        });
      }
    }

    setIsExecuting(false);

    // After executing all, continue the conversation
    const finalMessages = messages;
    await continueChatWithToolResult(finalMessages);
  };

  // NEW: Deny all pending commands
  const handleDenyAll = () => {
    // Collect all pending approvals
    const allApprovals = [currentApproval, ...approvalQueue].filter(Boolean) as ToolUse[];

    // Clear the queue and current approval
    setCurrentApproval(null);
    setApprovalQueue([]);

    // Mark all as denied
    allApprovals.forEach(tool => {
      updateLastMessage({
        toolUse: { ...tool, status: 'denied' as ToolStatus },
      });
    });

    addMessage('assistant', `Denied ${allApprovals.length} tool${allApprovals.length > 1 ? 's' : ''}. How else can I help you?`);
  };

  const continueChatWithToolResult = async (messagesToSend: AgentMessage[]) => {
    try {
      setIsThinking(true);
      const token = await getToken();

      console.log('[Agent Chat] Messages BEFORE cleaning:', {
        count: messagesToSend.length,
        messages: messagesToSend.map((m, i) => ({
          index: i,
          role: m.role,
          hasToolUse: Array.isArray(m.content) && m.content.some((b: any) => b.type === 'tool_use'),
          hasToolResult: Array.isArray(m.content) && m.content.some((b: any) => b.type === 'tool_result'),
          toolUseIds: Array.isArray(m.content) ? m.content.filter((b: any) => b.type === 'tool_use').map((b: any) => b.id) : [],
          toolResultIds: Array.isArray(m.content) ? m.content.filter((b: any) => b.type === 'tool_result').map((b: any) => b.tool_use_id) : [],
        }))
      });

      // Clean messages for Claude API compliance
      const cleanedMessages = cleanMessagesForClaude(messagesToSend);

      console.log('[Agent Chat] Sending messages to backend:', {
        messageCount: cleanedMessages.length,
        messages: cleanedMessages,
      });

      // Send all messages to maintain complete conversation context
      const response = await fetch(`${API_URL}/ai/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId,
          messages: cleanedMessages,
          tools: AGENT_TOOLS,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Agent Chat] HTTP error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // Process AI response (may include more tool uses)
      if (data.content) {
        // Check if response includes another tool use
        const toolUseContent = Array.isArray(data.content)
          ? data.content.find((block: any) => block.type === 'tool_use')
          : null;

        if (toolUseContent) {
          // AI wants to use another tool - store the full content array
          const toolUse: ToolUse = {
            id: toolUseContent.id,
            tool: toolUseContent.name,
            params: toolUseContent.input,
            status: 'pending',
          };

          // Store full content array to preserve tool_use blocks for conversation history
          const message: AgentMessage = {
            id: `msg-${Date.now()}-${Math.random()}`,
            role: 'assistant',
            content: data.content, // Store full array with tool_use blocks
            timestamp: Date.now(),
            toolUse,
          };
          setMessages((prev) => [...prev, message]);
          saveMessage(message);

          // ALL tools go through approval queue (respects autoApproveAll toggle)
          queueToolForApproval(toolUse);
        } else {
          // Regular text response
          const textContent = typeof data.content === 'string'
            ? data.content
            : Array.isArray(data.content)
            ? data.content.find((block: any) => block.type === 'text')?.text || ''
            : '';

          if (textContent) {
            addMessage('assistant', textContent);
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to continue chat:', error);
      addMessage('assistant', `Error: ${error.message}`);
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-expand textarea as content grows
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  const formatToolParams = (params: Record<string, any>) => {
    return Object.entries(params)
      .map(([key, value]) => {
        // Pretty format JSON values
        const formattedValue = typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : JSON.stringify(value);
        return `${key}: ${formattedValue}`;
      })
      .join('\n');
  };

  return (
    <div className="agent-chat-panel">
      {agentMode === 'terminal' && workspaceId ? (
        <AgentTerminalMode
          projectId={projectId}
          workspaceId={workspaceId}
          agentMode={agentMode}
          onModeChange={setAgentMode}
        />
      ) : (
        <>
      <div className="agent-chat-messages">
        {messages.length === 0 && (
          <div className="agent-chat-empty">
            <svg className="agent-icon-large" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <h3>AGENTIC CODE ENGINE</h3>
            <p>I can read files, write code, execute commands, and help you build your project.</p>
            <div className="agent-suggestions">
              <button onClick={() => setInputValue('List all files in this project')}>
                List all files
              </button>
              <button onClick={() => setInputValue('Read the main entry file')}>
                Read main file
              </button>
              <button onClick={() => setInputValue('Help me fix any errors')}>
                Fix errors
              </button>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`agent-message agent-message-${message.role}`}>
            <div className="agent-message-avatar">
              {message.role === 'user' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              )}
            </div>
            <div className="agent-message-content">
              <div
                className="agent-message-text"
                dangerouslySetInnerHTML={{
                  __html: parseMarkdown(
                    typeof message.content === 'string'
                      ? message.content
                      : Array.isArray(message.content)
                      ? message.content
                          .filter((block: any) => block.type === 'text')
                          .map((block: any) => block.text)
                          .join('\n')
                      : JSON.stringify(message.content)
                  )
                }}
              />
              {message.toolUse && (
                <div className={`agent-tool-use agent-tool-${message.toolUse.status}`}>
                  <div className="agent-tool-header">
                    <svg className="agent-tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                    <span className="agent-tool-name">{message.toolUse.tool}</span>
                    <span className={`agent-tool-status agent-status-${message.toolUse.status}`}>
                      {message.toolUse.status}
                    </span>
                  </div>
                  <div className="agent-tool-params">
                    <pre>{formatToolParams(message.toolUse.params)}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="agent-message agent-message-assistant">
            <div className="agent-message-avatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="agent-message-content">
              <div className="agent-thinking">
                <span className="agent-thinking-dot"></span>
                <span className="agent-thinking-dot"></span>
                <span className="agent-thinking-dot"></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* NEW: Improved approval bar with queue display */}
      {currentApproval && (
        <div className="agent-approval-bar">
          <div className="agent-approval-header">
            <div className="agent-approval-title">
              <svg className="agent-approval-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Command Approval Required</span>
              {approvalQueue.length > 0 && (
                <span className="agent-queue-badge">{approvalQueue.length + 1} pending</span>
              )}
            </div>
            <button
              className="agent-details-toggle"
              onClick={() => setShowApprovalDetails(!showApprovalDetails)}
              title={showApprovalDetails ? "Hide details (D)" : "Show details (D)"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{
                transform: showApprovalDetails ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s'
              }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          <div className="agent-approval-content">
            <div className="agent-approval-tool-name">
              <strong>{currentApproval.tool}</strong>
            </div>

            {showApprovalDetails && (
              <div className="agent-approval-details">
                <pre>{formatToolParams(currentApproval.params)}</pre>
              </div>
            )}
          </div>

          <div className="agent-approval-actions">
            <div className="agent-approval-actions-left">
              {approvalQueue.length > 0 && (
                <>
                  <button
                    className="agent-btn agent-btn-secondary"
                    onClick={handleApproveAll}
                    disabled={isExecuting}
                    title="Approve all pending commands"
                  >
                    Approve All ({approvalQueue.length + 1})
                  </button>
                  <button
                    className="agent-btn agent-btn-secondary agent-btn-deny-all"
                    onClick={handleDenyAll}
                    disabled={isExecuting}
                    title="Deny all pending commands"
                  >
                    Deny All
                  </button>
                </>
              )}
            </div>
            <div className="agent-approval-actions-right">
              <button
                className="agent-btn agent-btn-deny"
                onClick={handleDenyTool}
                disabled={isExecuting}
                title="Deny this command (N or Esc)"
              >
                Deny
              </button>
              <button
                className="agent-btn agent-btn-approve"
                onClick={handleApproveTool}
                disabled={isExecuting}
                title="Approve this command (Y or Enter)"
              >
                {isExecuting ? 'Executing...' : 'Approve'}
              </button>
            </div>
          </div>

          <div className="agent-approval-hint">
            Keyboard: <kbd>Y</kbd> or <kbd>Enter</kbd> to approve, <kbd>N</kbd> or <kbd>Esc</kbd> to deny, <kbd>D</kbd> to toggle details
          </div>
        </div>
      )}

      {autoApproveAll && (
        <div className="agent-auto-approve-notice">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          <span>Auto-approve enabled - all tools will execute automatically</span>
        </div>
      )}

      <div className="agent-chat-input-container">
        <div className="agent-mode-toggle">
          <button
            className={`agent-mode-button agent-mode-chat ${agentMode === 'chat' ? 'active' : ''}`}
            onClick={() => setAgentMode('chat')}
            aria-label="Chat mode"
            title="Chat Mode"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            className={`agent-mode-button agent-mode-terminal ${agentMode === 'terminal' ? 'active' : ''}`}
            onClick={() => setAgentMode('terminal')}
            aria-label="Terminal mode"
            title="Terminal Mode"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </button>
          <button
            className={`agent-mode-button agent-auto-approve ${autoApproveAll ? 'active' : ''}`}
            onClick={() => setAutoApproveAll(!autoApproveAll)}
            aria-label="Auto-approve all tools"
            title={autoApproveAll ? "Auto-approve: ON (tools execute automatically)" : "Auto-approve: OFF (manual approval required)"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </button>
        </div>
        <div className="agent-input-wrapper">
          <textarea
            ref={inputRef}
            className="agent-chat-input"
            placeholder="Describe what you want to build..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isThinking || isExecuting}
            rows={1}
          />
          <button
            className="agent-send-button-inline"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isThinking || isExecuting}
            aria-label="Send message"
            title="Send"
            >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
