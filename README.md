# Collaborative Canvas — Frontend
# Collaborative Canvas — Frontend + Minimal Server

This repository contains a vanilla JavaScript frontend and a minimal Node.js WebSocket server to demonstrate a real-time collaborative drawing canvas.

What you'll find here:
- `client/` — the frontend (Vanilla JS, HTML5 Canvas)
- `server/` — a minimal Express + WebSocket (ws) server that sequences operations and broadcasts events

Frontend features implemented:
- Brush + eraser tools
- Color picker and stroke width
- Pointer/touch support
- Remote cursor indicators
- Local history (undo/redo) and hooks to emit undo/redo to a server
- Simple WebSocket client (connects by default to `ws://localhost:3000`)

Notes / limitations:
- The server included is intentionally minimal and keeps state in memory (no DB). It's suitable for local testing and demos.
- Global undo/redo is supported conceptually via server-assigned "undo" ops; clients replay the server-ordered log. The UI currently emits undo/redo intents and the server records and broadcasts them.
- For performance, the frontend redraws history on pointermove; this is simple and correct but not optimal for very large histories.

Quick start (developer):

1. Install dependencies and start the server (PowerShell):

```pwsh
cd "d:\Frontend flame project-Real-Time Collaborative Drawing Canvas\collaborative-canvas"
npm install
npm start
```

2. Open the frontend in your browser (recommended to use the static server provided by the Node server):

- Open http://localhost:3000 in multiple tabs/windows to simulate multiple users. The server serves the static client and accepts WebSocket connections on the same origin.

Testing multi-user:
- Open two or more browser tabs pointing to http://localhost:3000 and draw — strokes should be broadcast to other clients in real time. Cursor positions are broadcast as `pointer_move` messages.

Developer notes:
- To run the server in development with auto-restart, install `nodemon` (`npm i -D nodemon`) and run `npm run start:dev`.
- Server logs to console; check for received messages and broadcast events.

Time spent: ~3.5 hours implementing the frontend and a minimal server prototype.

Next steps (recommended):
- Persist session logs to a database and implement rooms that can be restored.
- Improve client performance using an overlay canvas for live strokes and flattening committed layers periodically.
- Add authentication and user management policies for undo/redo permissions.

