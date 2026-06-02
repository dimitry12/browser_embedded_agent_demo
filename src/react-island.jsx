'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
} from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';

const DEFAULT_MODEL = window.HANOI_AGENT_CONFIG?.model ?? 'deepseek/deepseek-v4-pro';
const DEFAULT_OPENROUTER_API_KEY = window.HANOI_AGENT_CONFIG?.openRouterApiKey ?? '';
const DEFAULT_AGENT_STEPS = window.HANOI_AGENT_CONFIG?.agentSteps ?? 6;

function buildBrowserModel(byokConfig) {
  const openrouter = createOpenRouter({
    apiKey: byokConfig.apiKey.trim(),
    appName: 'Browser Embedded Agent Demo',
    appUrl: window.location.origin,
  });

  return openrouter.chat(byokConfig.model);
}

const agentTools = {
  getGameState: tool({
    description: 'Read the current Tower of Hanoi game state.',
    inputSchema: z.object({}),
    execute: async () => window.hanoi.getState(),
  }),

  resetGame: tool({
    description: 'Reset the Tower of Hanoi game to its starting state.',
    inputSchema: z.object({}),
    execute: async () => {
      window.dispatchEvent(new CustomEvent('hanoi:reset-requested'));
      return window.hanoi.getState();
    },
  }),

  moveDisk: tool({
    description: 'Move the top disk from one tower to another. Towers are numbered 1, 2, and 3.',
    inputSchema: z.object({
      from: z.number().int().min(1).max(3).describe('Source tower number, from 1 to 3.'),
      to: z.number().int().min(1).max(3).describe('Destination tower number, from 1 to 3.'),
    }),
    execute: async ({ from, to }) => {
      const before = window.hanoi.getState();
      window.dispatchEvent(new CustomEvent('hanoi:move-requested', {
        detail: { from: from - 1, to: to - 1 },
      }));
      const after = window.hanoi.getState();

      return {
        moved: after.moves > before.moves,
        before,
        after,
      };
    },
  }),
};

async function runBrowserStream({ init, byokConfig }) {
  if (!byokConfig.apiKey.trim()) {
    return new Response('OpenRouter API key is required for browser-side AI calls.', {
      status: 401,
    });
  }

  const requestBody = JSON.parse(init?.body ?? '{}');
  const uiMessages = requestBody.messages ?? [];

  const result = streamText({
    model: buildBrowserModel(byokConfig),
    system: [
      'You are an embedded Tower of Hanoi agent running inside the browser page.',
      'You can explain the game, inspect the game state, reset it, and make legal moves using tools.',
      'If a requested move is illegal, explain why and suggest a legal move.',
      'Do not use Markdown formatting in responses. Reply in plain text only.',
    ].join(' '),
    messages: await convertToModelMessages(uiMessages, {
      tools: agentTools,
      ignoreIncompleteToolCalls: true,
    }),
    tools: agentTools,
    stopWhen: stepCountIs(byokConfig.agentSteps),
  });

  return result.toUIMessageStreamResponse();
}

function HanoiStatus() {
  const [state, setState] = useState(() => window.hanoi.getState());

  useEffect(() => {
    function onStateChanged(event) {
      setState(event.detail);
    }

    window.addEventListener('hanoi:state-changed', onStateChanged);
    return () => window.removeEventListener('hanoi:state-changed', onStateChanged);
  }, []);

  function requestReset() {
    window.dispatchEvent(new CustomEvent('hanoi:reset-requested'));
  }

  return (
    <div className="hanoi-status">
      <strong>React + browser agent island</strong>
      <span>Moves: {state.moves}</span>
      <span>{state.won ? 'Solved' : 'Playing'}</span>
      <button type="button" onClick={requestReset}>Reset</button>
    </div>
  );
}

function renderMessagePart(part, index) {
  if (part.type === 'text') {
    return <span key={index}>{part.text}</span>;
  }

  if (part.type?.startsWith('tool-')) {
    return <span key={index} className="tool-part">[{part.type}]</span>;
  }

  return null;
}

function Chat({ byokConfig }) {
  const byokConfigRef = useRef(byokConfig);

  useEffect(() => {
    byokConfigRef.current = byokConfig;
  }, [byokConfig]);

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    fetch: async (_input, init) => runBrowserStream({
      init,
      byokConfig: byokConfigRef.current,
    }),
  }), []);

  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState('');

  function submitMessage(event) {
    event.preventDefault();
    if (!input.trim()) return;

    sendMessage({ text: input });
    setInput('');
  }

  return (
    <div className="chat-panel">
      <div className="messages">
        {messages.map(message => (
          <div key={message.id}>
            {message.role === 'user' ? 'User: ' : 'AI: '}
            {message.parts.map(renderMessagePart)}
          </div>
        ))}
      </div>

      <form onSubmit={submitMessage}>
        <input
          value={input}
          onChange={event => setInput(event.target.value)}
          disabled={status !== 'ready'}
          placeholder="Ask the browser agent about the game"
        />
      </form>

      <small>Status: {status}</small>
      {error ? <small className="error">Chat error: {error.message}</small> : null}
    </div>
  );
}

function ReactIsland() {
  const [apiKey, setApiKey] = useState(DEFAULT_OPENROUTER_API_KEY);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [agentSteps, setAgentSteps] = useState(DEFAULT_AGENT_STEPS);
  const [collapsed, setCollapsed] = useState(false);
  const byokConfig = useMemo(() => ({ apiKey, model, agentSteps }), [apiKey, model, agentSteps]);

  return (
    <div className={`react-island${collapsed ? ' collapsed' : ''}`}>
      <div className="island-header">
        <strong>Hanoi agent</strong>
        <button
          type="button"
          onClick={() => setCollapsed(value => !value)}
          aria-expanded={!collapsed}
        >
          {collapsed ? 'Open' : 'Hide'}
        </button>
      </div>

      {!collapsed ? (
        <>
          <HanoiStatus />

          <div className="byok-config">
            <label>
              OpenRouter API key, used only in this browser tab
              <input
                type="password"
                value={apiKey}
                onChange={event => setApiKey(event.target.value)}
                placeholder="sk-or-..."
                autoComplete="off"
              />
            </label>

            <label>
              OpenRouter model
              <input
                value={model}
                onChange={event => setModel(event.target.value)}
                placeholder={DEFAULT_MODEL}
              />
            </label>

            <label>
              Agent steps per turn
              <input
                type="number"
                min="1"
                max="20"
                step="1"
                value={agentSteps}
                onChange={event => {
                  const value = Number(event.target.value) || 1;
                  setAgentSteps(Math.max(1, Math.min(20, value)));
                }}
              />
            </label>
          </div>

          <Chat byokConfig={byokConfig} />
        </>
      ) : null}
    </div>
  );
}

createRoot(document.querySelector('#react-panel')).render(<ReactIsland />);
