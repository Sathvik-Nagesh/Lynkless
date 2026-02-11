# 📡 LYNKLESS — Peer-to-Peer File Transfer & Chat Application

> _"Your files don't belong in the cloud."_

---

## 📌 1. INTRODUCTION

### 1.1 Project Overview

**Lynkless** is a modern, privacy-first, peer-to-peer (P2P) file transfer and communication platform built for the modern web. Unlike traditional file sharing services such as Google Drive, Dropbox, or WeTransfer — which upload your files to centralized servers — Lynkless transfers files **directly between devices** using WebRTC technology. No data ever passes through or is stored on any server.

### 1.2 Problem Statement

In today's digital world, sharing files between devices often requires:

- Uploading to cloud services (Google Drive, Dropbox) — **slow and privacy-invasive**
- Sending via email — **size-limited and insecure**
- Using messaging apps — **compressed quality and stored permanently**
- USB drives / Bluetooth — **inconvenient and outdated**

These methods suffer from:

- ❌ **Privacy concerns** — files are stored and potentially scanned on third-party servers
- ❌ **Size limitations** — email limits (25MB), messaging app limits
- ❌ **Speed bottleneck** — upload to server → download from server (double transfer)
- ❌ **Account requirements** — registration and login needed
- ❌ **No encryption** — files may be accessible by service providers

### 1.3 Proposed Solution

Lynkless solves all these problems by:

- ✅ **Direct transfer** — files go directly between devices (no middleman)
- ✅ **Zero storage** — nothing is uploaded, stored, or logged
- ✅ **End-to-end encryption** — WebRTC uses DTLS encryption automatically
- ✅ **No accounts** — zero registration required
- ✅ **No file size dependency on server** — limited only by browser memory (~500MB)
- ✅ **Fast** — local network transfers happen at LAN speed

### 1.4 Objective

To design and develop a web-based peer-to-peer file transfer application that enables:

1. Secure, encrypted file sharing between browsers without server storage
2. Real-time text chat over encrypted channels
3. Multiple connection methods (Room codes, QR scanning, Nearby discovery)
4. Progressive Web App (PWA) support for mobile installation
5. Resume-capable, multi-file transfers with quality monitoring

---

## 🧩 2. MODULES

### Module 1: Signaling Server

**Purpose:** Facilitates initial connection establishment between peers.

| Component              | Description                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `server.js`            | Express + WebSocket server, HTTP health checks, CORS handling                       |
| `websocketHandlers.js` | Client management, room routing, ICE candidate forwarding, connection approval flow |
| `rooms.js`             | Room creation, joining, password protection, user tracking                          |

**Key Responsibilities:**

- Generate unique client IDs on connection
- Forward WebRTC offers, answers, and ICE candidates
- Manage room creation/joining with optional passwords
- Track nearby peers by subnet (same network detection)
- Handle connection request approval flow
- Heartbeat monitoring (30s interval) for connection health
- Clean up stale requests (60s timeout)

> ⚠️ **Important:** The signaling server **never** sees file data. It only helps peers find each other.

---

### Module 2: WebRTC Connection Engine

**Purpose:** Establishes and maintains direct peer-to-peer connections.

| Component              | Description                                                               |
| ---------------------- | ------------------------------------------------------------------------- |
| `connection.ts`        | RTCPeerConnection management, ICE handling, DataChannel creation          |
| `connectionQuality.ts` | Real-time connection quality assessment (latency, bandwidth, packet loss) |
| `fingerprint.ts`       | SDP-based connection fingerprinting for security verification             |

**Key Responsibilities:**

- Create and manage RTCPeerConnection objects per peer
- Handle ICE candidate exchange via signaling server
- Open reliable & ordered DataChannels for file/chat data
- Monitor connection state changes (new → connecting → connected → disconnected)
- Generate unique security fingerprints from SDP for manual verification
- Track connection quality metrics in real-time

---

### Module 3: File Transfer Engine

**Purpose:** Handles chunked file transfer with pause/resume capability.

| Component         | Description                                  |
| ----------------- | -------------------------------------------- |
| `fileTransfer.ts` | 903-line comprehensive file transfer manager |

**Key Responsibilities:**

- Chunk files into 64KB segments for reliable transfer
- Track transfer progress (%, speed, ETA, transferred/total bytes)
- Support **pause and resume** — transfers can be paused mid-stream and resumed later
- Support **cancel** — graceful cancellation with peer notification
- **Mesh broadcasting** — send one file to ALL connected peers simultaneously
- Handle file reassembly on receiving end (chunk → complete file → auto-download)
- Resume on reconnect — if connection drops, transfer can continue from last chunk
- 500MB file size limit (browser memory constraint)

**Transfer Protocol:**

```
Sender                           Receiver
  |--- file-meta (name, size) -->|
  |--- file-chunk (0, data) ---->|
  |--- file-chunk (1, data) ---->|
  |    ... more chunks ...       |
  |--- file-complete ----------->|
  |                              |-- auto-downloads file
```

---

### Module 4: Chat System

**Purpose:** Real-time encrypted messaging between connected peers.

| Component       | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| `chat.ts`       | Message creation, broadcasting, and receiving via DataChannel |
| `ChatPanel.tsx` | Full-featured chat UI with message grouping and unread badges |

**Key Responsibilities:**

- Broadcast messages to all connected peers via WebRTC DataChannel
- Message grouping by sender (compact consecutive messages)
- Time separators (5-minute intervals)
- Unread message badge counter (when panel minimized)
- Typing indicator animation
- Keyboard shortcuts (Enter = send, Esc = minimize)
- Character limit (2000 characters)
- Gradient chat bubbles with hover timestamps

---

### Module 5: Discovery & Connection Methods

**Purpose:** Multiple ways for users to find and connect to each other.

| Method               | Component                                  | How It Works                                                           |
| -------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| **Room Codes**       | `RoomControls.tsx`                         | Create a 6-character room code, share it, others join by typing code   |
| **QR Codes**         | `QRCodeDisplay.tsx` + `QRScannerModal.tsx` | Generate QR code containing peer ID + server URL; scan to auto-connect |
| **Nearby Discovery** | `Radar.tsx`                                | Server detects same-subnet peers automatically; shows on visual radar  |
| **Direct URL**       | `room/[code]/page.tsx`                     | Share a room link (`/room/ABC123`) for instant join                    |

---

### Module 6: User Interface & Experience

**Purpose:** Modern, responsive, accessible frontend.

| Component                    | Description                                                   |
| ---------------------------- | ------------------------------------------------------------- |
| `Onboarding.tsx`             | First-time user walkthrough (3-step tutorial)                 |
| `ConnectionStatus.tsx`       | Real-time connection status indicator                         |
| `ConnectionStatusBadge.tsx`  | Per-peer quality badge (Excellent/Good/Fair/Poor)             |
| `ConnectionRequestModal.tsx` | Accept/Reject incoming connection requests                    |
| `FileDropZone.tsx`           | Drag-and-drop + file picker (multiple files)                  |
| `FilePreviewModal.tsx`       | Preview files before sending (thumbnails + metadata)          |
| `TransferProgress.tsx`       | Transfer progress with pause/resume/cancel controls           |
| `ToastProvider.tsx`          | Global toast notification system (success/error/warning/info) |
| `PWAInstallPrompt.tsx`       | Native app install prompt for mobile                          |
| `ErrorBoundary.tsx`          | Graceful error handling with recovery                         |
| `Radar.tsx`                  | Animated radar visualization of nearby peers                  |

---

### Module 7: Utilities

**Purpose:** Helper functions and services.

| Utility                | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `sounds.ts`            | Web Audio API notification sounds (connect, transfer, error) — no external files |
| `connectionMonitor.ts` | Real-time latency, bandwidth, and packet loss monitoring                         |
| `nameGenerator.ts`     | Generates memorable peer names + emoji avatars (e.g., "🐼 Cosmic Panda")         |

---

## ⭐ 3. FEATURES

### Core Features

| #   | Feature                   | Description                                                 |
| --- | ------------------------- | ----------------------------------------------------------- |
| 1   | **P2P File Transfer**     | Direct device-to-device transfer via WebRTC DataChannel     |
| 2   | **End-to-End Encryption** | DTLS encryption on all WebRTC connections                   |
| 3   | **Zero Server Storage**   | Files never touch any server — complete privacy             |
| 4   | **Real-time Chat**        | Encrypted messaging with message grouping and unread badges |
| 5   | **No Account Required**   | Zero registration, open the app and start using             |

### Connection Features

| #   | Feature                 | Description                                             |
| --- | ----------------------- | ------------------------------------------------------- |
| 6   | **Room-Based Sharing**  | Create/join rooms with 6-character codes                |
| 7   | **Password Protection** | Optional password-protected rooms                       |
| 8   | **QR Code Connect**     | Scan QR to instantly connect devices                    |
| 9   | **Nearby Discovery**    | Auto-detect devices on same network via subnet matching |
| 10  | **Direct Room Links**   | Shareable URLs for instant room joining                 |

### Transfer Features

| #   | Feature                 | Description                                               |
| --- | ----------------------- | --------------------------------------------------------- |
| 11  | **Multi-File Transfer** | Select and send multiple files at once                    |
| 12  | **File Preview**        | Preview files with thumbnails before sending              |
| 13  | **Pause/Resume**        | Pause active transfers and resume from where you left off |
| 14  | **Transfer Progress**   | Real-time speed, percentage, and ETA display              |
| 15  | **Mesh Broadcasting**   | Send one file to ALL connected peers simultaneously       |
| 16  | **Auto-Resume**         | Resume interrupted transfers on reconnection              |

### User Experience Features

| #   | Feature                        | Description                                                       |
| --- | ------------------------------ | ----------------------------------------------------------------- |
| 17  | **Progressive Web App**        | Install on mobile/desktop as native-like app                      |
| 18  | **Sound Notifications**        | Audio feedback for connections, transfers, errors (Web Audio API) |
| 19  | **Toast Notifications**        | Visual feedback for all actions (success/error/warning/info)      |
| 20  | **Connection Quality Monitor** | Real-time latency, bandwidth, and packet loss tracking            |
| 21  | **Status Badges**              | Color-coded connection quality per peer (🟢🔵🟡🔴)                |
| 22  | **Security Fingerprint**       | SDP-based fingerprint verification for connection trust           |
| 23  | **Mobile Responsive**          | Fully optimized for phones, tablets, and desktops                 |
| 24  | **Dark Mode**                  | Premium dark theme with gradient accents                          |
| 25  | **Onboarding Tutorial**        | First-time user walkthrough                                       |
| 26  | **Connection Debugger**        | Developer-facing connection diagnostics panel                     |
| 27  | **About/Help Page**            | Feature overview, architecture, FAQ                               |

---

## 🛠️ 4. TECHNOLOGIES USED

### Frontend

| Technology           | Version        | Purpose                                                       |
| -------------------- | -------------- | ------------------------------------------------------------- |
| **Next.js**          | 16.1.6         | React framework with SSR, routing, and optimization           |
| **React**            | 19.2.3         | UI component library for building interactive interfaces      |
| **TypeScript**       | 5.x            | Strongly-typed JavaScript for reliability and maintainability |
| **Tailwind CSS**     | 4.x            | Utility-first CSS framework for responsive styling            |
| **Framer Motion**    | 12.33          | Production-ready animation library for smooth UI transitions  |
| **WebRTC API**       | Browser Native | Peer-to-peer connection and DataChannel for direct transfers  |
| **Web Audio API**    | Browser Native | Generate notification sounds without external audio files     |
| **QR Code (qrcode)** | 1.5.4          | Generate QR codes for peer connection                         |
| **jsQR**             | 1.4.0          | Scan QR codes using device camera                             |

### Backend (Signaling Server)

| Technology         | Version | Purpose                                    |
| ------------------ | ------- | ------------------------------------------ |
| **Node.js**        | ≥18.0   | JavaScript runtime for server-side logic   |
| **ws (WebSocket)** | 8.16    | WebSocket server for real-time signaling   |
| **bcryptjs**       | 2.4.3   | Password hashing for protected rooms       |
| **uuid**           | 9.0.1   | Unique ID generation for clients and rooms |

### Deployment & DevOps

| Technology | Purpose                                                 |
| ---------- | ------------------------------------------------------- |
| **Vercel** | Frontend hosting with automatic deployments from GitHub |
| **Render** | Signaling server hosting (free tier)                    |
| **GitHub** | Source code management and version control              |
| **Git**    | Version control system                                  |

### Web Standards & APIs Used

| API                            | Purpose                                             |
| ------------------------------ | --------------------------------------------------- |
| **WebRTC (RTCPeerConnection)** | Establish direct P2P connections                    |
| **WebRTC (RTCDataChannel)**    | Transfer file chunks and chat messages              |
| **WebSocket API**              | Real-time bidirectional signaling communication     |
| **File API**                   | Read, chunk, and stream files for transfer          |
| **Blob API**                   | Reconstruct received chunks into downloadable files |
| **MediaDevices API**           | Access camera for QR code scanning                  |
| **Service Worker API**         | Offline capability and PWA support                  |
| **Web Audio API**              | Synthesize notification sounds dynamically          |
| **Clipboard API**              | Copy room codes to clipboard                        |

---

## 🏗️ 5. SYSTEM ARCHITECTURE

### High-Level Architecture

```
┌─────────────┐              ┌──────────────────┐              ┌─────────────┐
│   Device A  │◄────────────►│  Signaling Server │◄────────────►│   Device B  │
│  (Browser)  │  WebSocket   │   (Node.js + WS)  │  WebSocket   │  (Browser)  │
└──────┬──────┘              └──────────────────┘              └──────┬──────┘
       │                                                               │
       │                    WebRTC DataChannel                        │
       │                  (Direct P2P, DTLS Encrypted)                │
       └───────────────────────────────────────────────────────────────┘
                          Files & Chat Messages
```

### Connection Flow

```
Step 1: Both devices connect to Signaling Server via WebSocket
Step 2: Device A creates a Room (gets code like "ABC123")
Step 3: Device B joins Room using code
Step 4: Auto-connect: Lower-ID device sends connection request
Step 5: Higher-ID device sees Accept/Reject modal
Step 6: On Accept: ICE candidate exchange begins via Signaling Server
Step 7: WebRTC offer/answer handshake completes
Step 8: Direct DataChannel opens (P2P — server no longer involved)
Step 9: Files and messages flow directly between devices
```

### Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        SIGNALING PHASE                       │
│                                                              │
│  Client A ──[create-room]──> Server ──[room-created]──> A    │
│  Client B ──[join-room]───> Server ──[room-joined]───> B     │
│                             Server ──[user-joined]───> A     │
│  Client A ──[conn-request]─> Server ──[conn-request]─> B     │
│  Client B ──[conn-accepted]> Server ──[conn-accepted]> A     │
│  Client A ──[offer]────────> Server ──[offer]────────> B     │
│  Client B ──[answer]───────> Server ──[answer]───────> A     │
│  Both ──────[ice-candidate]> Server ──[ice-candidate]> Other │
└──────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      DIRECT P2P PHASE                        │
│                                                              │
│  Client A ──[file-meta]────────────────────────────> Client B│
│  Client A ──[file-chunk (0)]───────────────────────> Client B│
│  Client A ──[file-chunk (1)]───────────────────────> Client B│
│  Client A ──[file-chunk (n)]───────────────────────> Client B│
│  Client A ──[file-complete]────────────────────────> Client B│
│                                                              │
│  Client A <──[chat-message]────────────────────────> Client B│
│  (All data encrypted with DTLS — server cannot read)         │
└──────────────────────────────────────────────────────────────┘
```

---

## 📂 6. PROJECT STRUCTURE

```
Lynkless/
├── frontend/                          # Next.js Frontend Application
│   ├── public/                        # Static assets & PWA manifest
│   │   ├── manifest.json             # PWA configuration
│   │   ├── icons/                    # App icons (192px, 512px)
│   │   └── sw.js                     # Service Worker
│   │
│   ├── src/
│   │   ├── app/                      # Next.js App Router pages
│   │   │   ├── layout.tsx            # Root layout (ToastProvider, ErrorBoundary)
│   │   │   ├── page.tsx              # Main application page (~693 lines)
│   │   │   ├── globals.css           # Design system & responsive styles
│   │   │   ├── about/page.tsx        # About/Help page
│   │   │   └── room/[code]/page.tsx  # Direct room join via URL
│   │   │
│   │   ├── components/               # 18 React Components
│   │   │   ├── ChatPanel.tsx         # Full chat interface
│   │   │   ├── ConnectionDebugger.tsx# Developer diagnostics
│   │   │   ├── ConnectionFingerprint.tsx  # Security verification
│   │   │   ├── ConnectionQualityIndicator.tsx # Quality metrics
│   │   │   ├── ConnectionRequestModal.tsx # Accept/Reject modal
│   │   │   ├── ConnectionStatus.tsx   # Status indicator
│   │   │   ├── ConnectionStatusBadge.tsx  # Per-peer quality badge
│   │   │   ├── ErrorBoundary.tsx      # Error handling
│   │   │   ├── FileDropZone.tsx       # Drag-and-drop file picker
│   │   │   ├── FilePreviewModal.tsx   # File preview before send
│   │   │   ├── Onboarding.tsx         # First-time tutorial
│   │   │   ├── PWAInstallPrompt.tsx   # Mobile install prompt
│   │   │   ├── QRCodeDisplay.tsx      # QR code generator
│   │   │   ├── QRScannerModal.tsx     # QR code scanner (camera)
│   │   │   ├── Radar.tsx              # Animated peer radar
│   │   │   ├── RoomControls.tsx       # Room create/join UI
│   │   │   ├── ToastProvider.tsx      # Toast notification system
│   │   │   └── TransferProgress.tsx   # Transfer progress + pause/resume
│   │   │
│   │   ├── hooks/                    # Custom React Hooks
│   │   │   ├── useSignaling.ts       # WebSocket signaling management
│   │   │   └── useWebRTC.ts          # WebRTC connection + transfer management
│   │   │
│   │   └── lib/                      # Core Libraries
│   │       ├── socket/
│   │       │   └── client.ts         # WebSocket client wrapper
│   │       ├── webrtc/
│   │       │   ├── connection.ts     # RTCPeerConnection manager
│   │       │   ├── connectionQuality.ts # Quality assessment
│   │       │   ├── fileTransfer.ts   # File chunking & transfer (903 lines)
│   │       │   ├── fingerprint.ts    # SDP fingerprinting
│   │       │   └── chat.ts           # Chat message handling
│   │       └── utils/
│   │           ├── sounds.ts         # Web Audio API sounds
│   │           ├── connectionMonitor.ts # Latency/bandwidth monitor
│   │           └── nameGenerator.ts  # Memorable peer names
│   │
│   ├── package.json
│   └── tsconfig.json
│
├── signaling-server/                 # Node.js Signaling Server
│   ├── server.js                     # HTTP + WebSocket server setup
│   ├── websocketHandlers.js          # All WebSocket message handlers
│   ├── rooms.js                      # Room management logic
│   └── package.json
│
├── PROJECT_DOCUMENTATION.md          # ← This file
└── README.md                         # Quick start guide
```

---

## 📊 7. PROJECT STATISTICS

| Metric                         | Value                     |
| ------------------------------ | ------------------------- |
| **Total Files**                | ~35+ source files         |
| **Frontend Lines of Code**     | ~5,000+ lines             |
| **Signaling Server Lines**     | ~700 lines                |
| **Components**                 | 18 React components       |
| **Custom Hooks**               | 2                         |
| **Core Libraries**             | 8 modules                 |
| **React Dependencies**         | 9 packages                |
| **Server Dependencies**        | 3 packages                |
| **Supported Features**         | 27                        |
| **Transfer Protocol Messages** | 6 types                   |
| **Connection Methods**         | 4 (Room, QR, Nearby, URL) |

---

## 🔐 8. SECURITY FEATURES

| Security Layer             | Implementation                                              |
| -------------------------- | ----------------------------------------------------------- |
| **Transport Encryption**   | WebRTC DTLS (Datagram Transport Layer Security) — automatic |
| **Data Integrity**         | SRTP for real-time data protection                          |
| **Zero Knowledge**         | Server never sees or stores transferred data                |
| **Connection Fingerprint** | SDP-based fingerprint for manual verification               |
| **Room Passwords**         | bcrypt-hashed password protection                           |
| **No Persistent Data**     | All data exists only in browser memory during session       |
| **Automatic Cleanup**      | Stale connections cleaned after 60 seconds                  |

---

## 🌐 9. DEPLOYMENT

| Component        | Platform | URL                                |
| ---------------- | -------- | ---------------------------------- |
| Frontend         | Vercel   | Auto-deployed from `main` branch   |
| Signaling Server | Render   | Free-tier WebSocket hosting        |
| Repository       | GitHub   | github.com/Sathvik-Nagesh/Lynkless |

### How to Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/Sathvik-Nagesh/Lynkless.git
cd Lynkless

# 2. Start Signaling Server
cd signaling-server
npm install
node server.js
# Server runs on http://localhost:8080

# 3. Start Frontend (new terminal)
cd frontend
npm install
npm run dev
# App runs on http://localhost:3000
```

---

## 🔮 10. FUTURE ENHANCEMENTS

| Enhancement                  | Description                                                         |
| ---------------------------- | ------------------------------------------------------------------- |
| **Screen Sharing**           | Share screen directly with connected peers using WebRTC MediaStream |
| **Clipboard Paste**          | Ctrl+V to paste and auto-send screenshots/images                    |
| **Received Files Gallery**   | Visual gallery of all received files instead of auto-download       |
| **Transfer Speed Graph**     | Real-time sparkline showing transfer speed over time                |
| **Password-Protected Rooms** | Already supported in backend, needs UI integration                  |
| **Mobile Camera Transfer**   | Take photo and instantly transfer to connected device               |
| **Transfer History**         | Session-based history of all files sent/received                    |
| **Batch Zip Transfer**       | Auto-zip multiple files for faster transfer                         |

---

## 👥 11. TEAM / CONTRIBUTORS

| Name                      | Role                                                       |
| ------------------------- | ---------------------------------------------------------- |
| _[Add team member names]_ | _[Add roles: e.g., Frontend Developer, Backend Developer]_ |

---

## 📚 12. REFERENCES

1. **WebRTC API** — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
2. **WebSocket API** — https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
3. **Next.js Documentation** — https://nextjs.org/docs
4. **React Documentation** — https://react.dev
5. **Framer Motion** — https://www.framer.com/motion
6. **Web Audio API** — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
7. **DTLS Protocol (RFC 6347)** — https://tools.ietf.org/html/rfc6347
8. **ICE Protocol (RFC 8445)** — https://tools.ietf.org/html/rfc8445

---

## 📝 13. CONCLUSION

Lynkless demonstrates a practical, production-ready implementation of peer-to-peer file transfer using modern web technologies. By leveraging WebRTC's DataChannel API, the application achieves:

- **Complete privacy** — zero server storage means zero data breaches
- **Speed** — direct device-to-device transfer is inherently faster than cloud-based solutions
- **Simplicity** — no accounts, no installation (web-based), no setup
- **Security** — DTLS encryption ensures data confidentiality

The project showcases proficiency in real-time web technologies (WebRTC, WebSocket), modern frontend development (React, Next.js, TypeScript), responsive design, and Progressive Web App development — making it a comprehensive demonstration of full-stack web development skills.

---

_Last Updated: February 12, 2026_
