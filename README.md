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
* **Admin Console**: A `/admin` page for whoever is listed in `ADMIN_EMAILS` — system-wide numbers, every user, board and task in one place, and an operations tab for the Zalo bot. See [Admin console](#-admin-console) below.
* **Zalo Assistant**: A bot that posts every task change into a Zalo group and sends a progress report there at 20:00 every evening. See [Zalo assistant](#-zalo-assistant) below.

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
│   │   ├── pages/           # Landing, Auth, Dashboard, BoardDetail, Profile, Admin
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
        ├── admin/           # Admin console API, gated by ADMIN_EMAILS
        ├── mail/            # Nodemailer client
        └── zalo/            # Zalo bot: activity notifier, 20:00 report, Q&A
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

## 🤖 Zalo Assistant

A virtual assistant that keeps a Zalo group in the loop about the boards. It does
two things:

1. **Live activity** — whenever a task is created, renamed, moved between
   columns, re-scheduled, assigned, commented on, attached to or deleted, the
   bot posts a short Vietnamese summary into the group. Changes are batched for
   15 seconds, so dragging five cards produces one message rather than five.
2. **Evening report** — at **20:00 Asia/Ho_Chi_Minh** every day it posts a
   progress digest per board: completion percentage, what is left per column,
   what was created and finished today, what is overdue and what is due within
   three days, plus an overall total.
3. **Answers questions** — tag the bot in the group and ask. Questions about the
   boards are answered straight from Firestore; anything else goes to Gemini
   with the board data as context.

Notifications are fire-and-forget: if Zalo is unreachable or the token is wrong,
the failure is logged and the API request that triggered it still succeeds.

### Questions the bot answers on its own

Free, instant, and impossible to hallucinate, because they are computed from the
data rather than generated:

| Ask it | It answers with |
| --- | --- |
| "báo cáo tiến độ" | the same digest the 20:00 report sends |
| "có gì quá hạn không" | every open task past its deadline, most overdue first |
| "sắp đến hạn gì" | tasks due within three days |
| "hôm nay có gì mới" | what was created and finished today |
| "có những bảng nào" | each board with its task count and completion |
| "việc của Gia Bảo" | that person's open tasks (short names work too) |
| "ai đang làm Fix login" | who a named task is assigned to |

Anything else is passed to **Gemini** together with the current board data, so
"nhóm mình đang nghẽn ở khâu nào" gets a real answer. Set `GEMINI_API_KEY`
(from [Google AI Studio](https://aistudio.google.com/apikey)) to enable it;
without a key the bot replies with the list above instead of staying silent.
`GEMINI_MODEL` defaults to `gemini-3.6-flash` — note that `gemini-2.5-flash` is
refused for newly created API keys.

The bot replies only when tagged in a group (every message counts in a one-to-one
chat), ignores other bots, and never answers the same message twice. Set
`ZALO_REPLY_ENABLED=false` to keep the notifications but turn replying off.

Incoming messages arrive by long polling, so no public webhook URL is needed —
but like the 20:00 timer, the listener only runs while the server is awake.

### Setup

1. Create a bot in the Zalo Bot manager and copy its token
   (`<bot_id>:<secret>`) into `ZALO_TOKEN`.
2. Add the bot to the group it should post in, then send any message in that
   group so the bot receives an update.
3. Read the group's chat id and put it in `ZALO_CHAT_ID`:

   ```bash
   curl -H "x-zalo-secret: $ZALO_ADMIN_SECRET" http://localhost:5090/zalo/updates
   ```

4. Restart the server and confirm the wiring:

   ```bash
   curl -H "x-zalo-secret: $ZALO_ADMIN_SECRET" http://localhost:5090/zalo/status
   curl -X POST -H "x-zalo-secret: $ZALO_ADMIN_SECRET" http://localhost:5090/zalo/test
   ```

### Operator routes

Every route below requires the `x-zalo-secret` header to match
`ZALO_ADMIN_SECRET`; with that variable empty the routes stay closed.

| Route | Purpose |
| --- | --- |
| `GET /zalo/status` | Token validity, target chat, and when the next report runs |
| `GET /zalo/updates` | Pending updates plus the chat ids seen in them |
| `POST /zalo/test` | Send a test message (`{"text":"...","chatId":"..."}`) |
| `POST /zalo/ask` | The answer to a question (`{"question":"..."}`) without posting it |
| `GET /zalo/report/preview` | The report as it would be sent right now, without sending |
| `POST /zalo/report/run` | Build and send the report immediately |

> [!IMPORTANT]
> The 20:00 schedule is an in-process timer, so it only fires while the server is
> awake. On hosts that idle the process — Render's free tier sleeps after 15
> minutes without traffic — point an external scheduler (Render Cron,
> cron-job.org, GitHub Actions) at `POST /zalo/report/run` at 20:00 instead.

---

## 🛡️ Admin Console

`/admin` is a two-tab console for whoever runs the workspace. The **Admin** link
appears in the dashboard header only for those accounts.

**Hệ thống** — headline counts (users, boards, cards, tasks), completion rate,
what is overdue, what is unassigned, and what was created and finished today;
then a table per collection:

* every board with its owner, members, progress bar and overdue count
* every user with how many boards they are on and how much open work they carry
* every task, filterable by board, status, overdue-only and title search

Boards and tasks can be deleted from here. Deleting a board cascades to its
cards and tasks — without that they would linger in Firestore, invisible but
still counted.

**Trợ lý Zalo** — the bot's live status, and the operations from the table above
without a terminal: send a test message, preview or send the progress report,
discover a chat id, and try a question against the assistant (the answer stays
on the page and is not posted to the group).

### Access

```ini
ADMIN_EMAILS=you@example.com,teammate@example.com
```

Matched against the email the account signed in with. **With the variable empty
nobody is an admin** — the console refuses everyone rather than falling open.
Non-admins get a 403 from every route and an explanation on the page.

The console calls the `/zalo/*` routes with the signed-in admin's own JWT, so
`ZALO_ADMIN_SECRET` never has to be handed to a browser; that secret stays for
machine callers such as an external scheduler.

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

# Who may open /admin (comma separated, matched on sign-in email)
ADMIN_EMAILS=you@example.com

# Zalo assistant (see the section above)
ZALO_TOKEN=<bot_id>:<secret>
ZALO_CHAT_ID=the_group_chat_id
ZALO_ADMIN_SECRET=a_long_random_string
ZALO_REPORT_TIME=20:00
ZALO_TIMEZONE=Asia/Ho_Chi_Minh

# Free-form answers in the group (optional)
GEMINI_API_KEY=your_google_ai_studio_key
```

> [!IMPORTANT]
> **Firestore credentials are required.** The local `database.json` fallback has been removed: if neither `FIREBASE_SERVICE_ACCOUNT` nor `FIREBASE_PROJECT_ID` is set, the server now **refuses to start** with an explicit error instead of silently serving empty collections.

> [!NOTE]
> **No Email Credentials?** If SMTP variables are left blank, the backend falls back to printing authentication verification codes directly in the server console log.
