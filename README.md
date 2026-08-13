# Lulu Trello — Real-Time Kanban Board Management Workspace

Lulu Trello is a premium, real-time Kanban Board Management application featuring a modern **React.js Frontend (Vite)**, a **NestJS Backend (TypeScript)**, and a **Firebase Firestore Database**. The project is organized as a **pnpm Workspace monorepo** for optimized dependency management and streamlined local execution.

---

## Key Highlights & Premium Features

### Premium Aesthetics & Interactive Mascot

* **Taco Mascot with Dynamic Eye-Tracking**: An interactive React SVG mascot whose eyes smoothly follow your mouse movements. Built using **Framer Motion spring physics** and optimized with a solid silhouette backing to render perfectly on top of any webpage gradient.
* **Premium Glassmorphism Design**: Sleek dark modes, harmoniuous colors, vibrant gradients, and micro-animations that offer a premium user experience.

### Real-Time Sync & Workspaces

* **Socket.io Collaboration**: Drag-and-drop task movements are instantly synchronized across all connected browsers in real-time.
* **Multi-Workspace Boards & Invitations**: Create boards, invite team members, and accept/decline board notifications in real-time.

### Passwordless Auth & Integrations

* **Passwordless OTP Email Verification**: Enter your email to receive a 6-digit OTP code sent via SMTP (using Gmail/Nodemailer) or simulate it locally.
* **GitHub Sign-In**: Log in with a GitHub account through OAuth, alongside the OTP flow.
* **Deadlines & Google Calendar**: Give a task a deadline, see it on the board (overdue tasks turn red), and push it to Google Calendar with the assignees added as guests.

---

## 📁 Project Structure

The project is structured as a **Single-Repo npm Workspace**, sharing a central `node_modules` folder and lockfile at the root:

```text
TrelloApplication/ (Root Workspace)
├── package.json             # Workspace scripts & package references
├── package-lock.json        # Centralized lockfile
├── node_modules/            # Centralized hoisted dependencies
│
├── frontend/                # React.js client (Vite SPA)
│   ├── src/
│   │   ├── components/      # TacoMascot, TaskModal, overlay panels
│   │   ├── context/         # AuthContext & SocketContext
│   │   ├── pages/           # Landing, Auth, Dashboard, BoardDetail, Profile
│   │   └── index.css        # Custom Glassmorphism styles
│   └── package.json
│
└── backend/                 # NestJS server (TypeScript)
    └── src/
        ├── main.ts          # Bootstrap: CORS + global ValidationPipe
        ├── app.module.ts    # Root module & .env resolution
        ├── common/
        │   ├── firestore/   # FirestoreService (the only data store)
        │   ├── constants/   # roles.ts - the board role model
        │   ├── guards/      # JwtAuth, BoardAccess, CardInBoard, TaskInBoard
        │   ├── decorators/  # @CurrentUser, @CurrentBoard, @BoardRoles, ...
        │   └── realtime/    # EventsGateway (socket.io)
        ├── auth/            # OTP sign-in + GitHub OAuth
        ├── users/  boards/  cards/  tasks/
        └── mail/            # Nodemailer client
```

> [!NOTE]
> The `.env` file lives at the **workspace root** and is resolved relative to the
> source files, so the server picks it up whether it is started from the root or
> from `backend/`. A `backend/.env` file, if present, takes precedence.

---

## 🛠️ Getting Started

### 1. Prerequisites

Ensure you have **Node.js** (v18+) and **pnpm** (v9+) installed on your system.
If you do not have pnpm yet, enable it through Corepack:

```bash
corepack enable
```

### 2. Setup & Installation

Go to the root directory `TrelloApplication/` and install all workspace dependencies:

```bash
pnpm install
```

*This installs the packages for both the `frontend` and `backend` workspaces, linked from pnpm's content-addressable store.*

### 3. Running the Application

You can start both projects from the root workspace folder, either together or separately:

* **Start both frontend & backend concurrently**:
  ```bash
  pnpm dev
  ```
* **Start only the Frontend** (running on `http://localhost:5173`):
  ```bash
  pnpm dev:frontend
  ```
* **Start only the Backend** (running on `http://localhost:5090`):
  ```bash
  pnpm dev:backend
  ```

### 4. Production Build

```bash
pnpm build                        # builds both workspaces
pnpm --filter trello-backend start   # runs backend/dist/main.js
```

---

## ⚙️ Backend Configuration (`.env`)

Create or update the [.env](.env) file in the **workspace root** to configure the database, email services, and OAuth keys:

```ini
PORT=5090
JWT_SECRET="..."

# Firebase Firestore Credentials (minified Service Account JSON on a single line)
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"lulu-trello", ...}'

# SMTP Nodemailer Email Credentials (Gmail SMTP Example)
SMTP_HOST=smtp.your-email-provider.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password_16_chars
SMTP_FROM="Lulu Trello" <your_email@gmail.com>

# GitHub OAuth App Credentials
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

> [!IMPORTANT]
> **Firestore credentials are required.** The local `database.json` fallback has been removed: if neither `FIREBASE_SERVICE_ACCOUNT` nor `FIREBASE_PROJECT_ID` is set, the server now **refuses to start** with an explicit error instead of silently serving empty collections.

> [!NOTE]
> **No Email Credentials?** If SMTP variables are left blank, the backend falls back to printing authentication verification codes directly in the server console log.
