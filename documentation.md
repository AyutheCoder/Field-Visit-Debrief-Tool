# Field Visit Debrief Tool - Technical Documentation

This document provides a deep dive into the architecture, data models, offline synchronization flows, and AI integration systems of the Field Visit Debrief application.

---

## 1. System Architecture

The project follows a standard decoupled Client-Server architecture:

- **Client (`/client`)**: A React 18 Single Page Application (SPA) built with Vite and TypeScript. It leverages `vite-plugin-pwa` to register service workers and enable fully offline capabilities. State is largely handled by React component state and local storage mechanisms.
- **Server (`/server`)**: A Node.js 22+ Express API written in TypeScript. It provides a RESTful interface for the client.
- **Database**: SQLite, implemented using the native `node:sqlite` module (introduced in Node 22). The database file is stored locally at `server/data/dev.db`.

---

## 2. Directory Structure

```text
LLM_Project/
├── client/
│   ├── public/              # Static assets and PWA icons
│   └── src/
│       ├── components/      # React UI components (Dashboard, Forms, Maps)
│       │   └── ui/          # Reusable low-level UI elements (Spinners, Toasts)
│       ├── lib/             # Client-side services (API fetching, Offline Sync, Auth)
│       ├── App.tsx          # Main React Application Router and Layout
│       └── types.ts         # Shared TypeScript interfaces
├── server/
│   ├── data/                # SQLite database storage (dev.db)
│   ├── src/
│   │   ├── db/              # SQLite initialization, schema, and seeding scripts
│   │   ├── lib/             # Server utilities (AI orchestration, HTTP helpers, Auth)
│   │   ├── repositories/    # Data Access Layer (CRUD operations for SQLite)
│   │   ├── routes/          # Express API route handlers
│   │   ├── services/        # Business logic (AI processing, Search, RAG Chat)
│   │   ├── index.ts         # Express server entry point
│   │   └── types.ts         # Shared TypeScript interfaces
│   └── uploads/             # Locally stored media assets (photos, voice memos)
└── README.md
```

---

## 3. Data Model (SQLite)

The database schema is defined in `server/src/db/schema.sql` and consists of the following core entities:

- **User**: Represents staff members. Defines roles (`field_officer`, `manager`, `admin`) which dictate application access.
- **Visit**: The core entity representing a single field visit. Stores metadata like location, coordinates, program area, and raw field notes.
- **Stakeholder**: Individuals or organizations interacted with during a visit.
- **MediaAsset**: Photos or audio clips attached to a visit. Includes local file URLs and transcriptions for audio.
- **Debrief**: A 1-to-1 extension of a Visit, containing the AI-generated structured analysis (Key Findings, Blockers, Sentiment, Follow-ups).
- **ActionItem**: Extracted from a Debrief's "Follow-ups". Tracks specific tasks, assignees, priorities, and statuses.
- **Embedding**: Stores the mathematical vector representations of Visits (generated via local Xenova models) used for Semantic Search.
- **Pattern**: Aggregated data tracking recurring blockers or topics across multiple visits, used for Insight generation.

*Note: For simplicity, complex JSON objects (like arrays of findings) are stored as JSON-encoded `TEXT` columns and parsed at the application layer.*

---

## 4. Offline Synchronization Flow

The application is built to handle complete network loss gracefully.

1. **Service Worker (`vite-plugin-pwa`)**: Caches all HTML, JS, CSS, and static assets, allowing the app to load instantly even without an internet connection.
2. **IndexedDB Local Queue (`client/src/lib/offline.ts`)**: 
   - When a user submits a field visit while offline, the payload (including base64-encoded media) is saved to an IndexedDB store named `field_visit_offline_db`.
   - The UI immediately navigates the user away, giving the illusion of a successful submission.
3. **Background Sync (`client/src/lib/sync.ts`)**:
   - The app listens for the browser's `online` event (via `window.addEventListener('online')`).
   - Upon reconnection, it reads all pending visits from IndexedDB and POSTs them sequentially to the `/api/intake` endpoint.
   - On success, the items are cleared from IndexedDB and a success Toast is displayed to the user.

---

## 5. AI & NLP Pipelines

The AI integration is handled in `server/src/lib/openai.ts` and `server/src/services/ai.ts`. It has been highly optimized to run on a 100% free tier.

### 5.1 Chat & JSON Generation (OpenRouter)
All generative tasks (Drafting Debriefs, RAG Chat Assistant) are routed through **OpenRouter**, an OpenAI-compatible API proxy.
- **Automatic Fallback:** The system maintains a list of the top 5 free models (e.g., Llama 3.3, Qwen 3 Coder, Gemma). If a model returns a `429 Rate Limit` error, the `callWithRetry` wrapper automatically intercepts the error, applies an exponential backoff, and seamlessly attempts the prompt on the next available model.
- **JSON Coercion:** Some free models occasionally wrap JSON output in markdown fences (````json ... ````). The `generateJson` function automatically strips these fences to prevent parsing crashes.

### 5.2 Semantic Embeddings & Search (Local Xenova)
To avoid paying for embedding API calls, the server uses `@xenova/transformers` (`all-MiniLM-L6-v2`) to generate vector embeddings entirely locally.
- **Vector Storage:** When a visit is created, its text content is embedded into a 384-dimensional vector and saved to the `Embedding` table.
- **Cosine Similarity:** When a user queries the semantic search (`server/src/services/search.ts`), their query is embedded using the same local model, and visits are ranked based on Cosine Similarity.
- **Clustering:** The `server/src/services/patterns.ts` service uses these embeddings and greedy single-link clustering to group similar "Blockers" together to find recurring trends across different visits.

### 5.3 Voice Transcription
Voice transcription inherently requires large acoustic models. Because OpenRouter does not support free Audio endpoints natively:
- The `transcribeAudioBuffer` function currently catches audio payloads and gracefully falls back to a warning message, advising the user that text generation is working but voice processing requires an active OpenAI paid tier key.
- If a paid OpenAI key is provided in the future, the code can easily be reverted to use the `openai.audio.transcriptions.create` endpoint.

---

## 6. RAG Chat Assistant

The Assistant (`server/src/services/chat.ts`) uses Retrieval-Augmented Generation to answer questions about historical visits.
1. **Query Processing:** The user's question is stripped of stopwords.
2. **Retrieval:** The semantic search engine retrieves the top 6 most relevant visits from the SQLite database.
3. **Context Injection:** The data from these 6 visits (Location, Blockers, Findings) is injected into a strict System Prompt.
4. **Generation:** The OpenRouter LLM processes the prompt and returns a concise, grounded answer.

If no AI key is configured, the system gracefully falls back to a deterministic, rule-based keyword search and returns a hardcoded summary of the found visits.
