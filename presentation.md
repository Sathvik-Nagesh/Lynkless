# 🚀 Lynkless Project Presentation

## 🌟 Overview
**Lynkless** is a cutting-edge, peer-to-peer (P2P) file sharing and real-time communication platform. Unlike traditional cloud services (Google Drive, WeTransfer), Lynkless **never stores your files**. Data travels directly from one browser to another using WebRTC, ensuring maximum privacy and blazing-fast speeds.

---

## 💎 Unique Selling Points (USP)

1.  **Zero-Storage Architecture**: Files move directly from Device A to Device B. The server only facilitates the initial "handshake" (signaling).
2.  **No File Size Limits**: Since files aren't uploaded to a server, you can transfer massive files (5GB+) as long as your browser and OS support it.
3.  **Privacy by Design**: Mandatory E2EE (End-to-End Encryption) using AES-GCM. Even the metadata is ephemeral.
4.  **Folder Support**: Drag and drop entire directory structures natively.
5.  **Smart Discovery**: Radar-based UI for discovering peers on the same network without typing codes.
6.  **PWA Support**: Can be installed on mobile and desktop as a native app with offline capabilities.

---

## 🛠️ Technology Stack

### Frontend
-   **Framework**: Next.js 15 (App Router)
-   **Styling**: Vanilla CSS + Tailwind-inspired utilities (Glassmorphism & High-Aesthetic UI)
-   **State Management**: React Hooks (State/Ref/Memo)
-   **Animations**: Framer Motion (Smooth transitions, pulsing radar)

### Core Engines
-   **WebRTC**: The backbone of P2P data channels (RTCDataChannel).
-   **WebSockets**: Used for the Signaling Server (Next.js API/Socket.io).
-   **OPFS (Origin Private File System)**: Used for high-performance streaming of large files to disk during transfer.
-   **Web Workers**: File chunking and encryption are offloaded to background threads to keep the UI at 60fps.
-   **IndexedDB**: Local history and transfer vault storage.

### Security
-   **AES-256-GCM**: Military-grade encryption for all file transfers.
-   **SHA-256 Fingerprinting**: Verification of peer identities to prevent Man-In-The-Middle (MITM) attacks.
-   **Magic Byte Verification**: Client-side protection against malicious file extensions.

---

## 🚀 How it Works (The Magic)

1.  **The Handshake**: Peer A creates a room. Peer B joins.
2.  **Signaling**: They exchange "Offers" and "Answers" through a tiny WebSocket server.
3.  **Hole Punching**: They exchange ICE candidates to find the best network path (Local IP, Public IP, or Relay).
4.  **The Tunnel**: A secure P2P tunnel is established.
5.  **Streaming**: Files are sliced into 64KB chunks and streamed through the tunnel.

---

## 🛡️ Edge Case Handling

-   **Symmetric NAT / Strict Firewalls**: Detected automatically. The system falls back to TURN relay servers to ensure connectivity even in corporate environments.
-   **Tab Throttling**: Browser tabs often "sleep" when backgrounded. Lynkless uses **Web Workers** and **WakeLock API** to keep transfers alive even when the phone screen is off.
-   **Network Hopping**: If you switch from Wi-Fi to 4G during a transfer, the system performs a **Seamless ICE Restart**, reconnecting the tunnel without failing the current file download.
-   **Backpressure Logic**: Prevents the sender from overwhelming the receiver's memory by waiting for "BufferedAmountLow" events.
-   **OPFS Recovery**: If a browser crashes during a 10GB transfer, the data is safe in the Origin Private File System, allowing for future resume capabilities.

---

## 🔮 Future Roadmap

-   **Native Share Sheet Integration**: Share files directly from iOS/Android menus into Lynkless.
-   **Identity Persistence**: "Pet Names" for peers so you can remember your friends' devices.
-   **Multi-Peer Broadcast**: Send the same file to 10 people at once using a mesh network.
-   **Offline Local Transfer**: Use mDNS and local discovery for 100% offline sharing.

---

**Lynkless: The best place for your files is between you and your friend, not on someone else's computer.**
