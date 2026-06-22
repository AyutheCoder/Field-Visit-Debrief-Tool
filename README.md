# Field Visit Debrief Tool 🌍

A lightweight, highly resilient field intelligence system designed for humanitarian and development operations. Field officers can capture site visits (notes, photos, GPS, stakeholders) on a mobile-friendly, installable PWA that works entirely offline. 

The application automatically transforms field data into structured AI **debriefs** (key findings, blockers, sentiment analysis, and follow-up actions) and provides managers with real-time dashboards, cross-visit semantic search, early-warning alerts, and a Retrieval-Augmented Generation (RAG) assistant.

> **💡 100% Free AI Tier Support:** The backend has been custom-tailored to run AI operations at zero cost. Text and JSON generation routes through [OpenRouter](https://openrouter.ai/) using a highly-available fallback chain of the best free models (Llama 3.3, Qwen 3, Gemma). Semantic search embeddings are powered completely locally using `@xenova/transformers` (`all-MiniLM-L6-v2`), requiring zero API credits!

---

## 🚀 Key Features

- **Offline-First Capture:** Log visits deep in the field with zero connectivity. Visits are queued in IndexedDB and automatically sync to the server the moment you regain connection. Installable as a native PWA on iOS/Android.
- **Auto-Generating AI Debriefs:** The system structures raw notes into actionable findings, blockers, and follow-ups.
- **100% Free AI Backend:**
  - **Generation:** Uses OpenRouter's free tier with exponential backoff and automatic failover across 5 different frontier models.
  - **Embeddings:** Runs Xenova Transformers locally on the Node server, saving thousands of API calls for semantic search.
- **Manager Dashboard:** Real-time sentiment trends, blocker categorization, interactive maps, and recurring issue detection.
- **RAG Chat Assistant:** Ask questions about past visits in natural language and get sourced, intelligent answers.
- **Early-Warning Alerts:** Detects and flags anomalous spikes of identical blockers occurring in a specific region.
- **Role-Based Access:** Built-in `field_officer`, `manager`, and `admin` roles with distinct navigation patterns.

---

## 🛠 Tech Stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Leaflet Maps, Recharts, Vite PWA Plugin.
- **Backend:** Node.js 22+, Express, TypeScript, native `node:sqlite`.
- **AI Integration:** Official `openai` Node SDK pointing to OpenRouter API.
- **Local ML:** `@xenova/transformers` for zero-cost semantic clustering and embeddings.

---

## 💻 Quick Start Guide

### Prerequisites
- **Node.js 22+** (Required for the native `node:sqlite` module)
- `npm`

### 1. Installation

```bash
# Install dependencies for both the root, client, and server
npm run install:all
```

### 2. Configuration & Seeding

```bash
# Create the environment file
cp server/.env.example server/.env

# Seed the database with demo users and realistic historical visits
npm run db:seed
```

### 3. Start the Application

```bash
# Starts both the Express server (port 4000) and Vite client (port 5173) concurrently
npm run dev
```

Open your browser to `http://localhost:5173`. 

---

## 🔑 Environment Variables (`server/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | API server port |
| `DATABASE_URL` | `file:./data/dev.db` | SQLite database location |
| `CLIENT_ORIGIN` | `http://localhost:5173,http://localhost:5174` | Allowed CORS origins |
| `AUTH_SECRET` | `dev-local-secret-7f3a9c2e1b` | Secret used to sign JWT session tokens |
| `AUTH_DEMO_PASSWORD` | `demo1234` | Shared password for the seeded demo users |
| `OPENAI_API_KEY` | _(Your OpenRouter Key)_ | Your free OpenRouter API key (`sk-or-v1-...`) |
| `OPENAI_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` | The primary chat model to use on OpenRouter |

---

## 👥 Demo Accounts

The database comes pre-seeded with three demo accounts for testing different permission levels. 
All users share the password: **`demo1234`**

| Email | Role | Accessible Views |
| --- | --- | --- |
| `asha@fieldteam.org` | `field_officer` | Capture, Actions, Search |
| `priya@fieldteam.org` | `manager` | Capture, Review, Dashboard, Insights, Actions, Search, Assistant |
| `admin@fieldteam.org` | `admin` | Full System Access |

---
## Demo Video
🎥 [Click here to watch the demo](## Demo Video
🎥 [Click here to watch the demo](https://raw.githubusercontent.com/AyutheCoder/Field-Visit-Debrief-Tool/main/C%20Field%20Visit%20Debrief.mp4))

## 📚 Documentation

For a deep dive into the system architecture, database schema, offline synchronization flow, and AI pipelines, please see [documentation.md](./documentation.md).
