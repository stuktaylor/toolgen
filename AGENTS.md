# agents.md — Toolsgen an AI-Powered Internal Tools Builder

## Project Overview

A web application that lets non-technical team members describe a business tool in plain English.
The app uses the @openai/codex-sdk — TypeScript SDK that wraps the Codex
CLI agent — to generate a fully working HTML/JS tool, renders it live in an iframe, and saves it
to a personal library for future use and iteration.

---

## Architecture

index.html          # Single-page app shell (prompt input, preview, library)
app.js              # Front-end logic (UI state, fetch calls to backend)
server.js           # Express backend (routes, Codex calls, DB ops)
db.js               # SQLite helpers (tools, versions, usage_log)
codegen.js          # Codex SDK wrapper — thread lifecycle + HTML extraction
tests/
tests/db.test.js      # Unit tests: database layer
tests/codegen.test.js # Unit tests: prompt builder, HTML extractor, Codex wrapper
tests/server.test.js  # Integration tests: HTTP routes (Codex mocked)
agents.md           # This file

---

## Tech Stack

- Codex agent - `@openai/codex-sdk` - Thread-based code generation; peer requires `@openai/codex` CLI 
- Server - `express` - HTTP routing and middleware 
- Database - `better-sqlite3` - Synchronous SQLite; no external service needed 
- HTTP testing - `supertest` - Tests HTTP routes against the exported Express `app` 
- Test runner - `node:test` - Built-in to Node 18+; no install required 
- Front-end - `react` - React with hooks only
- Front-end - `Tailwind CSS` - no inline styles, no component libraries

---

## Guiding Principles

- **Tests before code.** Write every failing test before writing any implementation. No
   implementation file is created until a test file for it exists and is confirmed to fail.
- **Simple over clever.** Flat, readable code. A junior developer should follow every file
   without tracing layers of indirection.
- **Keep functions simple.** No function longer than 30 lines. Extract helpers if needed.
- **Comments explain why, not what.** Only comment when the reason is non-obvious.
- **SQLite for persistence.** A local `.db` file. No external database service.
- **Errors are user-facing.** Every `catch` block produces a plain-English string.
   Raw stack traces never reach the browser.

---

## Code Style Rules

- Use camelCase throughout
- No inline styles — Tailwind classes only
- Single default export per component file
