# Project Build Note: Field Visit Debrief Tool

## 1. Overview of the Build
The **Field Visit Debrief Tool** is a robust, mobile-friendly web application designed to solve a critical problem for humanitarian, development, and field-operations teams: capturing and analyzing intelligence in remote, low-connectivity environments. 

Field officers often struggle to document complex site visits while out in the field. This application allows them to quickly log visits using voice memos, raw notes, and photos. Once synced, the system uses AI to automatically parse this unstructured data into a structured **Debrief**—extracting key findings, categorizing blockers, analyzing community sentiment, and generating actionable follow-ups. For managers, the application aggregates this data into real-time dashboards, provides semantic cross-visit search, flags early-warning anomalies (e.g., a sudden spike in infrastructure issues in a specific region), and offers a natural language RAG (Retrieval-Augmented Generation) chat assistant to query historical field data.

## 2. Core Architecture Walkthrough
The application follows a decoupled Client-Server architecture, optimized for resilience and low overhead:

### Frontend (Client)
- **PWA & Offline-First:** Built as a Progressive Web App (PWA) using React 18, Vite, and the `vite-plugin-pwa` module. Service workers cache the application shell, allowing it to load instantly without the internet.
- **Background Syncing:** When a user is offline, new visits (including base64 media) are serialized and queued locally in the browser's **IndexedDB**. A background sync listener detects when the network is restored and automatically POSTs the queue to the server.
- **UI/UX:** Tailwind CSS for responsive, mobile-first styling, Leaflet for geospatial mapping of visits, and Recharts for dashboard analytics.

### Backend (Server)
- **Runtime:** Node.js 22+ with Express.js.
- **Database:** Relies entirely on the newly introduced, native `node:sqlite` module. This provides a zero-dependency, ultra-fast embedded database that requires no external infrastructure.
- **Schema:** A relational structure linking `Users` -> `Visits` -> `Debriefs` -> `ActionItems`. Complex arrays (like specific findings) and vector embeddings are stored as JSON-encoded strings parsed at the application layer.

## 3. Tools and LLMs Used
To ensure the application remains powerful yet accessible, the AI pipeline was custom-tailored to utilize a **100% Free AI Tier**:

- **Generative LLMs (OpenRouter):** Text and JSON generation (for structuring debriefs and answering RAG chat queries) is routed through OpenRouter. The primary model utilized is **`meta-llama/llama-3.3-70b-instruct:free`**, chosen for its excellent instruction-following capabilities. Fallback models include `qwen/qwen3-coder:free` and `google/gemma-4-31b-it:free`.
- **Semantic Embeddings (Local ML):** Instead of relying on paid vector APIs (like OpenAI's `text-embedding-3`), semantic embeddings are generated entirely locally on the Node server using **`@xenova/transformers`** running the `all-MiniLM-L6-v2` model.
- **Core Tooling:** TypeScript (full-stack type safety), Vite, Express, Tailwind CSS.

## 4. Most Significant Technical & Design Decisions

### 1. The Zero-Cost, High-Availability AI Pipeline
A major design pivot was transitioning the system from a paid OpenAI/Gemini dependency to a completely free architecture without sacrificing reliability. Because free-tier APIs (like OpenRouter's free models) are prone to `429 Rate Limit` errors, a custom **Multi-Model Fallback Chain** was engineered. If the primary Llama 3.3 model is rate-limited, the system automatically catches the error, applies an exponential backoff, and seamlessly routes the request to the next available free model (e.g., Qwen 3). Furthermore, running Xenova vector embeddings locally on the server entirely eliminated the financial cost of the Semantic Search and Pattern Clustering features.

### 2. Graceful Degradation & Fallbacks
The system was designed so that AI is an enhancement, not a strict dependency. If the LLM APIs fail, or if the user is in an environment where AI cannot be reached, the application gracefully degrades. The RAG Assistant falls back to a deterministic, keyword-based summarizer. The Semantic Search falls back to a lenient lexical text-matching algorithm. Field officers can still manually input their debriefs if auto-generation fails.

### 3. IndexedDB for Guaranteed Data Capture
In field operations, lost data is catastrophic. Relying solely on standard HTTP requests would result in data loss when moving through dead zones. The decision to implement an intermediary IndexedDB queue ensures that a field officer can hit "Submit" and safely close their phone, knowing the app will silently negotiate the upload the next time they connect to a network.

### 4. Native SQLite (`node:sqlite`)
By choosing the native `node:sqlite` module over heavier ORMs or external database services (like PostgreSQL or MongoDB), the deployment complexity of the backend is reduced to near zero. The entire database exists as a single `dev.db` file, making backups, migrations, and local development incredibly frictionless while still easily handling the scale required by a regional field team.
