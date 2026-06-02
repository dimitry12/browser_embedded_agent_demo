# React Island Notes

## Embedding bundled UI in plain HTML

The host page stays generic non-React HTML. Anything that needs npm packages, JSX, or bundling lives in `src/react-island.jsx` and is built into one browser script:

```html
<script src="config.local.js"></script>
<script src="dist/react-island.js" defer></script>
```

The bundle mounts React into one normal DOM node:

```html
<section id="react-panel"></section>
```

This lets any plain HTML page "hotlink" the island script and get the bundled React functionality without converting the page to React.

## Endpointless Vercel AI SDK agent loop

`useChat` still uses `DefaultChatTransport`, but we override `fetch`. Therefore `/api/chat` is never called.

Instead, the custom fetch runs AI SDK Core directly in the browser:

1. Parse UI messages from the transport request body.
2. Convert them with `convertToModelMessages`.
3. Call `streamText` with an OpenRouter browser model and `agentTools`.
4. Return `result.toUIMessageStreamResponse()` back to `useChat`.

Tools are attached to the browser-side agent loop, not to the chat UI. Each tool is an AI SDK `tool({ inputSchema, execute })`, so the agent can execute it directly while streaming.

## Framework-agnostic browser interface

The host page exposes game state/actions through plain browser APIs, not React APIs:

- `window.hanoi.getState()`
- `window.hanoi.moveDisk(from, to)`
- `window.hanoi.reset()`
- `hanoi:state-changed` event
- `hanoi:reset-requested` event
- `hanoi:move-requested` event

Agent tools call these APIs or dispatch these events. Because the boundary is just `window` plus `CustomEvent`, the host can be vanilla HTML, React, Vue, Svelte, or anything else.
