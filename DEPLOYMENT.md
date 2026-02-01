# HumanSign Deployment Guide

This guide covers how to deploy the full HumanSign stack:
1.  **Database** (PostgreSQL/TimescaleDB)
2.  **Backend API** (Python/FastAPI)
3.  **Frontend Web App** (Next.js)
4.  **Browser Extension** (Chrome/Edge)

---

## 1. Database & Backend (Docker)

The easiest way to deploy the backend and database is using Docker on a virtual private server (VPS) like AWS EC2, DigitalOcean Droplet, or Hetzner.

### Prerequisites
- A server with Docker & Docker Compose installed.
- Git installed.

### Steps
1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/your-username/humanSign.git
    cd humanSign
    ```

2.  **Configure Environment**:
    Create a `.env` file in the root directory (based on `.env.example` if available, or manually):
    ```ini
    POSTGRES_USER=your_secure_user
    POSTGRES_PASSWORD=your_secure_password
    POSTGRES_DB=humansign
    ```
    *Update `docker-compose.yml` if you change these defaults.*

3.  **Build and Run**:
    ```bash
    docker-compose up -d --build
    ```
    This starts:
    - **PostgreSQL** on port `5432` (mapped to `5433` on host).
    - **API Server** on port `8000`.

4.  **Verify**:
    - Check logs: `docker-compose logs -f`
    - Test API: `curl http://localhost:8000/api/v1/health`

---

## 2. Frontend (Vercel)

The web application is built with Next.js, making Vercel the optimal deployment target.

### Steps
1.  **Push to GitHub**: Ensure your code is in a generic Git repository.
2.  **Import to Vercel**:
    - Go to [Vercel Dashboard](https://vercel.com/dashboard).
    - Click **"Add New..."** > **"Project"**.
    - Import your `humanSign` repository.
3.  **Configure Project**:
    - **Framework Preset**: Next.js
    - **Root Directory**: `web` (Important! The app is in the `web` folder).
4.  **Environment Variables**:
    - `NEXT_PUBLIC_API_URL`: Set this to your deployed backend URL (e.g., `http://your-vps-ip:8000/api/v1` or `https://api.yourdomain.com/v1`).
5.  **Deploy**: Click **Deploy**.

---

## 3. Browser Extension

The extension must be built and then installed manually or published to the Chrome Web Store.

### Build
1.  Navigate to the client directory:
    ```bash
    cd client
    ```
2.  Install dependencies and build:
    ```bash
    npm install
    npm run build
    ```
3.  The build output will be in `client/dist`.

### Installation (Developer Mode)
1.  Open Chrome and go to `chrome://extensions`.
2.  Enable **Developer mode** (top right).
3.  Click **Load unpacked**.
4.  Select the `client/dist` directory.

### Publishing (Chrome Web Store)
1.  Zip the `client/dist` folder.
2.  Create a developer account on the [Chrome Web Store Dashboard](https://chrome.google.com/webstore/dev/dashboard).
3.  Upload the zip file and fill in store listing details.

---

## Troubleshooting

### Database Connection
If the backend cannot connect to the database:
- Ensure `postgres` service is healthy (`docker-compose ps`).
- Check `DATABASE_URL` in `server/Dockerfile` or pass it as an env var in `docker-compose.yml`.

### Extension Communication
If the extension cannot reach the backend:
- Check `client/src/background/api-client.ts` or the configuration.
- Ensure the backend URL is accessible from your browser (CORS headers might need adjustment in `server/main.py` if domains differ).
