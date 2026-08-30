# DeckPlanner

A small full-stack app for planning presentation slide decks. Create decks, add
slides with speaker notes, reorder them, and keep everything organized.

## Stack

- **Client** — React + TypeScript + Vite (`client/`)
- **Server** — Express + TypeScript REST API with a file-backed JSON store (`server/`)
- **Monorepo** — npm workspaces

No external services (databases, queues, etc.) are required; the server persists
to `data/decks.json`.

## Getting started

```bash
npm ci          # install all workspace dependencies
npm run dev      # start the API (:3001) and web UI (:5173) together
```

Then open http://localhost:5173. The Vite dev server proxies `/api/*` requests to
the backend on port 3001.

### Run services individually

```bash
npm run dev:server   # Express API on http://localhost:3001
npm run dev:client   # Vite dev server on http://localhost:5173
```

## Useful commands

| Command | Description |
| --- | --- |
| `npm run typecheck` | Type-check both workspaces |
| `npm test` | Run the server test suite (Vitest + Supertest) |
| `npm run build` | Type-check and build server + client for production |

## API overview

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/decks` | List decks |
| `POST` | `/api/decks` | Create a deck |
| `GET` | `/api/decks/:id` | Get one deck |
| `PATCH` | `/api/decks/:id` | Update deck title/description |
| `DELETE` | `/api/decks/:id` | Delete a deck |
| `POST` | `/api/decks/:id/slides` | Add a slide |
| `PATCH` | `/api/decks/:id/slides/:slideId` | Update a slide |
| `DELETE` | `/api/decks/:id/slides/:slideId` | Delete a slide |
| `PUT` | `/api/decks/:id/slides/order` | Reorder slides |

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Server port |
| `DATA_FILE` | `../data/decks.json` | JSON store location (relative to `server/`) |
| `VITE_API_TARGET` | `http://localhost:3001` | API target the Vite dev proxy forwards to |

## Cloud Agent environment

`.cursor/environment.json` installs dependencies with `npm ci` and runs the API
and web UI as two persistent terminals.
