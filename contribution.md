![HumanSign Banner](banner.png)

# HumanSign Contribution Guide

Welcome to **HumanSign**! This project aims to authenticate human content on the web by analyzing the *process* of creation (keystrokes), not just the final output. We use high-precision behavioral biometrics to distinguish between organic human typing and AI generation or copy-pasting.

## 🛠️ Technology Stack

### Frontend (Web Application)
- **Framework**: [Next.js 16.1](https://nextjs.org/) (App Router, Turbopack)
- **UI Library**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Editors**:
    - [Monaco Editor](https://microsoft.github.io/monaco-editor/) (Code)
    - [Tiptap](https://tiptap.dev/) (Rich Text)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)

### Browser Extension
- **Manifest**: V3
- **Build Tool**: [Vite 5](https://vitejs.dev/)
- **Language**: TypeScript 5.3
- **Communication**: Cross-context messaging (Window <-> Content Script <-> Background Worker)

### Backend & AI
- **API**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
- **Database**: [PostgreSQL (TimescaleDB)](https://www.timescale.com/)
- **ML Inference**: [ONNX Runtime](https://onnxruntime.ai/)
- **Data Model**: Pydantic v2

---

## 🔬 Methodology & Core Concepts

### 1. Keystroke Dynamics
We verify humanity by measuring:
- **Dwell Time**: The duration a key is held down (`keyup - keydown`).
- **Flight Time**: The latency between releasing one key and pressing the next (`keydown[n] - keyup[n-1]`).
- **Precision**: All events are time-stamped with `performance.now()` in the browser for sub-millisecond accuracy.

### 2. AI & Paste Detection
- **Burst Analysis**: AI content often appears in "bursts" (0ms flight time, perfectly consistent). We detect these anomalies using entropy analysis.
- **Paste Ratio**: We track clipboard events versus typed characters. A high paste ratio flags content as "AI-Assisted" or "Paste".
- **ONNX Model**: A lightweight Random Forest classifier runs on the server (and potentially locally) to classify sessions as `human_organic`, `ai_assisted`, or `paste`.

### 3. Security Architecture
- **Isolated Worlds**: The extension uses a `window.postMessage` bridge to securely listen for events from the web app (like AI autocomplete insertions) without exposing privileged extension APIs.
- **State Persistence**: The Service Worker implements a robust persistence layer (`chrome.storage.session`) to survive browser idle suspensions, ensuring no data loss during long writing sessions.
- **Cryptographic Signing**: Verified reports are signed client-side using **ECDSA-P256-SHA256** keys generated via the Web Crypto API.

---

## 🏗️ Architecture

```mermaid
graph TD
    subgraph Browser
        A[Web App (Next.js)] -->|postMessage| B[Content Script]
        B -->|Runtime Message| C[Background Worker]
        C -->|chrome.storage| D[Session Storage]
    end

    subgraph Server
        E[FastAPI Service]
        F[ONNX Model]
        G[PostgreSQL DB]
    end

    C -->|REST API (Batches)| E
    E -->|Inference| F
    E -->|Store Rights| G
```

### Data Flow
1.  **User Types**: `KeystrokeTracker` captures `keydown`/`keyup` events.
2.  **Buffering**: Events are buffered (batch size 100) to minimize network traffic.
3.  **Transmission**: Background worker sends batches to the backend.
4.  **Verification**: User clicks "Verify". Backend aggregates timing data, runs ML inference, and returns a confidence score.

---

## 🚀 Running Locally

### Prerequisites
- Node.js 18+
- Python 3.10+
- Docker & Docker Compose

### 1. Backend & Database
```bash
git clone https://github.com/b0sc/humanSign.git
cd humanSign
# Start API and DB
docker-compose up -d --build
```
*API will run on `http://localhost:8000`.*

### 2. Frontend (Web)
```bash
cd web
npm install
# Configure env
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1" > .env.local
npm run dev
```
*Web app will run on `http://localhost:3000`.*

### 3. Browser Extension
```bash
cd client
npm install
npm run build
```
1.  Open Chrome: `chrome://extensions`
2.  Enable **Developer Mode**.
3.  Click **Load Unpacked**.
4.  Select `humanSign/client/dist`.

---

## 🐛 Known Issues & Debugging

### AI Misclassification
- **Issue**: Sometimes rapid typists (>120 WPM) are flagged as AI.
- **Status**: Improved in v1.1 using dwell-time variance analysis.

### Service Worker Sleep
- **Issue**: Statistics might reset if you leave the tab idle for >30s.
- **Fix**: **Resolved** in v1.2 using storage persistence.

### Safari Support
- partial. The extension currently relies on Chrome/Edge specific APIs (`chrome.action`).

---

## 🤝 Contributing

1.  Fork the repo.
2.  Create a branch: `git checkout -b feature/amazing-feature`.
3.  Commit changes: `git commit -m 'Add amazing feature'`.
4.  Push: `git push origin feature/amazing-feature`.
5.  Open a Pull Request.

Please ensure all new code includes proper TypeScript types and Python type hints.