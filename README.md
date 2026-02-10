# 🚀 Lynkless

> **"Your files don't belong in the cloud."**

A blazing-fast, zero-storage, peer-to-peer file transfer and chat platform built with WebRTC. Share files directly between browsers without any server storage — complete privacy by design.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P-green.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)

## ✨ Features

### Core Functionality

- 🚀 **Direct P2P Transfer** — Send files up to 500MB directly between browsers
- 💬 **Ephemeral Chat** — Real-time messaging that disappears when you disconnect
- 📡 **Smart Discovery** — Beautiful radar UI to discover nearby peers on your network
- 🔐 **Zero Storage** — Files never touch any server, period
- 🎯 **Connection Fingerprints** — SHA-256 verification codes to ensure secure connections

### User Experience

- 🎨 **Premium Cyber Aesthetic** — Modern, minimal UI with smooth animations
- 📱 **QR Code Connect** — Instant connection via QR code scanning
- 🏠 **Room System** — Create rooms with 6-digit codes for easy sharing
- 🔄 **Resume Support** — Auto-resume file transfers on reconnection
- 🎪 **Multi-Peer Mesh** — Broadcast to multiple peers simultaneously
- 🍬 **Cute Names** — Fun Indian dessert-themed peer names (PinkGulabCrispy!)

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
   git clone https://github.com/yourusername/lynkless.git
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
   - Drop a file and watch it transfer instantly! 🎉

## 🌐 Network Access (Same WiFi)

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
   ```

3. **Access from other devices**:
   ```
   http://YOUR_IP_HERE:3000
   ```

## 📁 Project Structure

```
Lynkless/
├── signaling-server/           # WebSocket signaling server
│   ├── server.js              # Main server
│   ├── websocketHandlers.js   # Message handlers
│   └── rooms.js               # Room management
│
└── frontend/                   # Next.js application
    ├── src/
    │   ├── app/               # Pages
    │   ├── components/        # UI components
    │   ├── hooks/             # React hooks
    │   └── lib/
    │       ├── webrtc/        # WebRTC connection logic
    │       └── socket/        # WebSocket client
    └── .env.local             # Configuration
```

## 🔧 Configuration

### Environment Variables

**Frontend** (`frontend/.env.local`):

```env
NEXT_PUBLIC_SIGNALING_URL=ws://localhost:8080
```

**Signaling Server**:

```env
PORT=8080  # Default port
```

## 🌍 Deployment

### Frontend → Vercel

1. Push to GitHub
2. Import to [Vercel](https://vercel.com)
3. Set environment variable:
   ```
   NEXT_PUBLIC_SIGNALING_URL=wss://your-signaling-server.com
   ```
4. Deploy!

### Signaling Server → Fly.io

```bash
cd signaling-server
fly launch
fly deploy
```

### Signaling Server → Render

1. New Web Service on [Render](https://render.com)
2. Root Directory: `signaling-server`
3. Build: `npm install`
4. Start: `node server.js`

## 🛡️ Security & Privacy

- ✅ **WebRTC DTLS** — All connections encrypted by default
- ✅ **Zero Server Storage** — Files never stored anywhere
- ✅ **Connection Fingerprints** — SHA-256 verification codes
- ✅ **Subnet Discovery** — Nearby peers detected securely
- ✅ **Ephemeral Data** — Chat and transfers disappear on disconnect

## 🎯 Use Cases

- 🎬 **Media Sharing** — Send large video files between devices
- 📸 **Photo Transfer** — Move photos from phone to laptop
- 📁 **Document Sharing** — Share files without email attachments
- 💼 **Work Collaboration** — Quick file exchange in meetings
- 🏠 **Home Network** — Transfer between your own devices

## 🎨 Tech Stack

**Frontend:**

- Next.js 16 (Turbopack)
- TypeScript
- Tailwind CSS
- Framer Motion
- WebRTC APIs

**Backend:**

- Node.js
- WebSocket (ws)
- Room management

## 📝 How It Works

1. **Create/Join Room** — Use 6-digit code or QR scan
2. **Peer Discovery** — Nearby peers (subnet) auto-detected
3. **Request Connection** — Click peer in radar
4. **Accept Request** — Peer approves connection
5. **Verify Fingerprint** — Both see same SHA-256 code
6. **Transfer Files** — Drag & drop or use file picker
7. **Chat** — Send messages over data channel

## 🤝 Contributing

Contributions welcome! Feel free to:

- Report bugs
- Suggest features
- Submit pull requests

## 📄 License

MIT License - feel free to use for personal or commercial projects.

## 💡 Future Ideas

- [ ] E2E encryption layer
- [ ] Screen sharing
- [ ] Voice/video calls
- [ ] Mobile app (React Native)
- [ ] Folder upload
- [ ] Download history (session-only)

---

**Built with ❤️ for privacy advocates and cloud skeptics.**

_Remember: The best place for your files is between you and your friend, not in someone else's computer._
