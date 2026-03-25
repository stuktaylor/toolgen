# Build Toolsgen From an Empty Repo

## Summary
Implement the app in the prompt's required file order, using test-first for every testable module and a commit after each source file is stabilized. The app will be a no-bundler React SPA served by Express, backed by SQLite, with Codex-driven HTML generation, cookie-based sessions, and a library that shows both owned tools and globally shared tools.

## Key Changes
- **Delivery model**
  - `index.html` is the single SPA shell.
  - `app.js` is a browser module that uses React hooks only.
  - Express serves `index.html`, `app.js`, and local React/ReactDOM browser bundles from `node_modules`; Tailwind is loaded via CDN in `index.html`.
  - No inline styles; all UI styling is via Tailwind classes.

- **Authentication and session behavior**
  - Use `POST /api/session/login` with `{ email, password }`.
  - Login auto-creates the user if the email does not exist; otherwise it verifies the password.
  - Store passwords as salted hashes using Node `crypto.scrypt`, not plaintext.
  - Persist login state with an HTTP-only session cookie via Express session middleware.
  - Use `POST /api/session/logout` to destroy the session.
  - Use `GET /api/session` to bootstrap the current user on page load.

- **Database shape and behaviors**
  - `db.js` initializes SQLite tables for `users`, `tools`, `tool_versions`, and `usage_log`.
  - `tools` stores: `id`, `ownerId`, `name`, `prompt`, `html`, `isShared`, timestamps.
  - `tool_versions` stores historical saved versions on publish/update.
  - `usage_log` records generate/publish events for auditability.
  - Shared tools are single records visible in every user's library; they are not copied into per-user rows.
  - Only the owner can update a tool; non-owners can see shared tools but do not get an edit action.

- **Codex wrapper**
  - `codegen.js` exposes a small API:
    - build the Codex prompt from the user's natural-language request
    - call `@openai/codex-sdk`
    - extract one full HTML document from the model response
    - extract a fallback tool name from `<title>`, otherwise derive it from the prompt
  - Generated output must be a self-contained HTML page with embedded JS/CSS suitable for iframe `srcDoc`.

- **HTTP API**
  - `GET /api/tools` returns the current user's visible library with `id`, `name`, truncated-ready `prompt`, `isOwned`, `isShared`, timestamps.
  - `GET /api/tools/:id` returns a single visible tool for editing/view state.
  - `POST /api/tools/generate` accepts `{ prompt }`, requires auth, calls `codegen.js`, logs usage, and returns `{ name, html }` without saving.
  - `POST /api/tools/publish` accepts `{ toolId?, prompt, html, isShared, name }`.
  - If `toolId` is present, update only if owned by the current user; otherwise create a new tool row.
  - All API errors return plain-English JSON messages.

- **Frontend behavior**
  - App state has two main screens: `library` and `builder`.
  - Library shows:
    - prior visible tools as cards
    - tool name
    - truncated prompt
    - `Edit` button only when `isOwned === true`
    - `Generate New Tool` and `Logout` controls
  - Builder shows:
    - prompt textarea
    - `Generate Tool` button
    - `Share Application` checkbox
    - `Publish` button
    - iframe live preview using `srcDoc`
    - `Open in new tab` for current draft HTML via blob URL
    - `Return to library` button top-right
  - Editing an owned tool preloads its saved prompt/html into the builder.

- **Execution order and commit cadence**
  - Create and fail `tests/db.test.js`, then implement `db.js`, run its tests, commit.
  - Create and fail `tests/codegen.test.js`, then implement `codegen.js`, run its tests, commit.
  - Create and fail `tests/server.test.js`, then implement `server.js`, run its tests, commit.
  - Add `index.html`, verify via server/integration flow as applicable, commit.
  - Add `app.js`, verify end-to-end behavior through server tests plus any lightweight browser-facing assertions feasible without a browser runner, commit.
  - Add `package.json`, install dependencies, run full test suite, commit.
  - Add `.env.example`, verify env documentation matches runtime reads, commit.

## Public Interfaces
- `db.js`
  - initialization function for schema setup
  - user lookup/create helpers
  - tool list/get/create/update helpers
  - version logging helper
  - usage logging helper
- `codegen.js`
  - prompt builder
  - HTML extractor
  - async tool-generation function
- `server.js`
  - exports Express `app`
  - starts listening only when run directly
  - serves SPA shell and JSON APIs listed above

## Test Plan
- `tests/db.test.js`
  - initializes schema on a temporary SQLite file or in-memory DB
  - creates and retrieves users
  - stores hashed passwords, not raw passwords
  - creates owned and shared tools
  - lists visible tools correctly for different users
  - updates only owner-owned tools
  - records tool versions and usage logs

- `tests/codegen.test.js`
  - builds a prompt that requests a full self-contained HTML document
  - extracts HTML correctly from mixed model output
  - rejects responses with no valid HTML document
  - returns a stable tool name from `<title>` or prompt fallback
  - mocks Codex SDK calls rather than making real network/API requests

- `tests/server.test.js`
  - auto-creates a user on first login
  - logs in an existing user with the correct password
  - rejects incorrect passwords
  - requires auth for generate, list, get, publish, and logout-sensitive flows
  - returns own plus shared tools in library results
  - allows owner edit/publish update and blocks non-owner updates
  - publishes shared tools visible to another logged-in user
  - clears session on logout
  - mocks `codegen.js` for deterministic generate responses

## Assumptions
- The prompt's "share to all other users' libraries" means global visibility via `isShared`, not per-user duplicated rows.
- Cookie-backed sessions do not need to survive server restarts.
- Tailwind may be loaded from CDN, but React/ReactDOM should be served locally to avoid making the app fully CDN-dependent.
- Because the prompt forces `package.json` late, implementation should still preserve the requested repo file creation order; full dependency-backed test execution may need to be completed once `package.json` exists and dependencies are installed, then rerun the whole suite before finishing.
