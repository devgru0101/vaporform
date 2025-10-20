'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  projectId: string;
  sessionId?: string;
}

export function ChatPanel({ projectId, sessionId }: ChatPanelProps) {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat history when sessionId changes
  useEffect(() => {
    if (!sessionId) return;

    async function loadMessages() {
      try {
        const token = await getToken();
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

        console.log('[ChatPanel] Loading messages for session:', sessionId);

        const response = await fetch(`${API_URL}/ai/messages/${sessionId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.error('[ChatPanel] Failed to load messages:', response.status);
          return;
        }

        const data = await response.json();
        console.log('[ChatPanel] Loaded messages:', data.messages?.length || 0);

        if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages.map((m: any) => ({
            role: m.role,
            content: m.content,
          })));
        }
      } catch (error) {
        console.error('[ChatPanel] Error loading messages:', error);
      }
    }

    loadMessages();
  }, [sessionId, getToken]);

  async function sendMessage() {
    if (!input.trim() || streaming || !sessionId) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setStreaming(true);

    let assistantMessage = '';

    try {
      const token = await getToken();
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

      const response = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'token' && data.content) {
                  assistantMessage += data.content;
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage?.role === 'assistant') {
                      lastMessage.content = assistantMessage;
                    } else {
                      newMessages.push({ role: 'assistant', content: assistantMessage });
                    }
                    return newMessages;
                  });
                } else if (data.type === 'done') {
                  break;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error: Failed to get response from AI'
      }]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="h-full w-full border-2 border-white flex flex-col bg-black">
      {/* Header */}
      <div className="border-b-2 border-white p-2">
        <h3 className="font-bold text-sm">KILOCODE AI</h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-[#00D9FF] text-sm">
            Ask KiloCode anything about your project...
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
            <div
              className={`inline-block p-2 border-2 ${
                msg.role === 'user'
                  ? 'border-[#00FF41] bg-[#00FF41] bg-opacity-10'
                  : 'border-[#00D9FF] bg-[#00D9FF] bg-opacity-10'
              }`}
            >
              <div className="text-xs font-bold mb-1">
                {msg.role === 'user' ? 'YOU' : 'KILOCODE'}
              </div>
              <div className="text-sm font-mono whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t-2 border-white p-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message..."
            disabled={streaming || !sessionId}
            className="flex-1 bg-black border-2 border-white p-2 text-white placeholder-gray-500 focus:outline-none focus:border-[#00FF41]"
          />
          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim() || !sessionId}
            className="px-4 py-2 border-2 border-white hover:bg-[#00FF41] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed font-bold"
          >
            {streaming ? '...' : 'SEND'}
          </button>
        </div>
      </div>
    </div>
  );
}
