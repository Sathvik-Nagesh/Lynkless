# 🚀 Lynkless

> **"Your files don't belong in the cloud."**

A blazing-fast, zero-storage, peer-to-peer file transfer and chat platform built with WebRTC. Share files directly between browsers without any server storage — complete privacy by design.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P-green.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)

## ✨ Features

### Core Functionality

- 🚀 **Direct P2P Transfer** — Send large files (up to **5GB**) directly between browsers with resuming capabilities and high-throughput chunking (256KB/s WebRTC streaming logic with proper backpressure).
- 📡 **Smart Discovery** — Beautiful Apple/Vercel-inspired glassmorphic Radar UI to discover nearby peers on your network automatically.
- 🔐 **Zero Storage & E2EE** — Files never touch any centralized data centers. Enable E2EE custom passwords out of the box using military-grade `AES-GCM` encryption.
- 📁 **Folder & Clipboard Support** — Drag-and-drop massive nested directories natively, or instantly `CTRL+V` paste images straight from your clipboard.
- 📺 **Live Screen Sharing** — Securely share your desktop directly over P2P using our pristine Screen-Share interface without interrupting your file-transfers tabs.
- 🔗 **Robust Reconnection Logic** — State-of-the-art WebRTC ICE candidates and buffered data handling that reliably reconnects peers in dynamic setups without corrupting your transfer.

### User Experience

- 🎨 **Premium Aesthetic** — A completely revamped UI/UX inspired by minimalist, high-end Apple & Vercel aesthetics. Soft drop-shadows, monochromatic themes, and meticulous visual hierarchies.
- 💬 **Ephemeral Chat + Markdown** — Real-time messaging synced seamlessly over WebRTC data channels natively parsing inline code formatting.
- 📊 **Transfer Analytics Dashboard** — A dedicated history vault locally tracked by IndexedDB rendering granular stats comprehensively showing **Total Sent** and **Total Received** data.
- 🏎️ **Live Speed & ETA Estimator** — Real-time, math-based speeds displaying elapsed transfer progression directly from the WebRTC DataChannel queue, maintaining perfectly accurate sender & receiver syncing.
- 📸 **Room System / QR Connect** — Scan QRs natively inside browsers or spawn ephemeral 6-digit instances globally crossing subnet frontiers natively resolving STUN ICE gaps.
- 🍬 **Cute Usernames** — Generates dessert-styled aliases upon joining. (Ex: _PinkGulabCrispy_)

## 🏗️ Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Browser A     │         │ Signaling Server │         │   Browser B     │
│   (Sender)      │◄───WS──►│   (WebSocket)    │◄───WS──►│   (Receiver)    │
│                 │         │  No file storage │         │                 │
└────────┬────────┘         └──────────────────┘         └────────┬────────┘
         │                                                          │
         │              WebRTC RTCDataChannel (P2P)                 │
         │◄────────────────────────────────────────────────────────►│
         │                  Direct Transfer                         │
         └──────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Zero Storage** — Files never uploaded anywhere
2. **P2P First** — Direct peer-to-peer transfer via WebRTC
3. **Signaling Only** — Server only exchanges connection metadata (SDP/ICE)
4. **Privacy by Design** — No logging, no tracking, ephemeral by default

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/Sathvik-Nagesh/Lynkless.git
   cd lynkless
   ```

2. **Start the signaling server**

   ```bash
   cd signaling-server
   npm install
   npm start
   ```

   Server runs at `ws://localhost:8080`

3. **Start the frontend** _(new terminal)_

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

4. **Test it!**
   - Open two browser tabs
   - Create a room in tab 1
   - Join with the 6-digit code in tab 2
   - Click a peer to connect
   - Drop a folder or file natively! 🎉

## 🌐 Network Access & Remote Connectivity

To access from other devices on your network:

1. **Find your local IP**:

   ```bash
   # Windows
   ipconfig

   # Mac/Linux
   ifconfig | grep "inet "
   ```

2. **Update `frontend/.env.local`**:

   ```env
   NEXT_PUBLIC_SIGNALING_URL=ws://YOUR_IP_HERE:8080
   # To improve connection stability across different networks (e.g. mobile hotspot vs home WiFi)
   # you can configure a custom TURN server to circumvent Symmetric NAT firewalls:
   NEXT_PUBLIC_ICE_SERVERS=[{"urls":"turn:your-turn-server.com:3478","username":"user","credential":"password"}]
   ```

3. **Access from other devices**:
   ```
   http://YOUR_IP_HERE:3000
   ```

## 📁 Project Structure

```text
Lynkless/
├── signaling-server/           # WebSocket signaling server routing Handshakes
│   ├── server.js
│   ├── websocketHandlers.js
│   └── rooms.js
│
└── frontend/                   # Next.js 16 application natively Turbopack
    ├── src/
    │   ├── app/               # NextPages & UI Matrix
    │   ├── components/        # React Subcomponents
    │   ├── hooks/             # WebRTC & Signaling hooks
    │   └── lib/
    │       ├── webrtc/        # Connection Engines & FileTransfer Handlers (Chunking/Backpressure)
    │       ├── db/            # IndexedDB Vaults
    │       └── socket/        # WebSocket orchestrations natively
    └── .env.local
```

## 🛡️ Security & Privacy

- ✅ **WebRTC DTLS** — All connections encrypted natively.
- ✅ **AES-GCM File Encoding** — Protect native folder matrices over a custom User Input password completely out of the box dynamically natively.
- ✅ **Zero Server Storage** — Files never stored natively.
- ✅ **Connection Fingerprints** — SHA-256 validation verifying man-in-the-middle attacks.

## 🤝 Contributing

Contributions welcome! Feel free to:

- Report bugs
- Suggest features
- Submit pull requests

## 📄 License

MIT License - feel free to use for personal or commercial projects.

## 💡 Roadmap & Tasks completed

- [x] E2E custom encryption layer
- [x] Resumable transfers natively parsing byte alignments.
- [x] Multi-peer mesh transfers
- [x] WebRTC renegotiation hardening (Drop-Free Screen Shares!)
- [x] Transfer IndexedDB dashboard globally tracking session hashes.
- [x] Stream buffering logic enabling 5GB+ transfers flawlessly.
- [x] Inline formatting chat!
- [ ] Voice/video call support
- [ ] Mobile native fallback Service Worker

---

**Built with ❤️ for privacy advocates and cloud skeptics.**

*Remember: The best place for your files is between you and your friend, not in someone else's computer.*
