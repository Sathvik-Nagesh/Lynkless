# LYNKLESS: PROJECT REPORT

## 1. INTRODUCTION
### 1.1 PROJECT DESCRIPTION
**Lynkless** is a high-performance, peer-to-peer (P2P) file transfer and real-time communication platform. Unlike traditional cloud services that store data on central servers, Lynkless establishes a direct, secure tunnel between devices using **WebRTC**. This ensures that files move directly from sender to receiver, providing maximum privacy, zero storage costs, and blazing-fast speeds limited only by the users' network bandwidth.

### 1.2 PURPOSE
The primary purpose of Lynkless is to solve the privacy and efficiency bottlenecks associated with modern file sharing. By removing the "middleman" server, it eliminates concerns about data breaches, government surveillance, and the latency of upload-then-download cycles. It is designed for users who need to move massive files (up to 5GB+) instantly and securely.

### 1.3 SCOPE
- **Direct P2P Transfer**: Support for large files and nested folder structures.
- **Privacy-First Design**: Zero-storage architecture with mandatory E2EE.
- **Smart Discovery**: Radar-based local peer discovery and 6-digit global room systems.
- **Cross-Platform PWA**: A fully installable Progressive Web App for mobile and desktop.
- **Integrated Chat**: Ephemeral, markdown-supported messaging within the P2P tunnel.

---

## 2. LITERATURE SURVEY
Traditional file-sharing platforms like Google Drive, Dropbox, and WeTransfer rely on centralized cloud storage. While convenient, they introduce security risks, mandatory account creation, and speed limitations. Existing P2P solutions like Snapdrop are excellent for local networks but often fail in complex network environments (Symmetric NAT/Firewalls). Lynkless bridges this gap by implementing advanced **Signaling**, **STUN/TURN** fallbacks, and **Seamless ICE Restarts** for global connectivity.

---

## 3. EXISTING SYSTEM
Existing systems typically follow a **Client-Server** model:
- **Centralized Storage**: Files are uploaded to a third-party server, creating a single point of failure.
- **Privacy Risks**: Data is often accessible to the service provider.
- **Bandwidth Waste**: Sharing a 1GB file requires 1GB of upload and 1GB of download, doubling the network load.
- **Cost**: High-speed transfers or large storage often require monthly subscriptions.

---

## 4. PROPOSED SYSTEM
Lynkless implements a **Peer-to-Peer (P2P)** model:
- **Zero Server Storage**: Files never touch the server; only connection metadata (handshakes) is handled.
- **Direct Streaming**: High-throughput chunking (256KB/s blocks) with backpressure management.
- **Enhanced Security**: AES-256-GCM encryption and SHA-256 fingerprint verification.
- **Universal Connectivity**: Works across different networks (Home Wi-Fi to 5G) via STUN/TURN signaling.

---

## 5. MODULES
1.  **Signaling Module**: Orchestrates the initial connection using WebSockets to exchange SDP and ICE candidates.
2.  **WebRTC Engine**: Manages the P2P DataChannel, encryption, and secure tunnel maintenance.
3.  **File Management Module**: Handles large file slicing (chunking), folder traversal, and OPFS (Origin Private File System) streaming for disk-write efficiency.
4.  **UI/UX Module**: Features a glassmorphic Radar UI, Transfer Dashboard, and interactive onboarding.
5.  **Analytics Module**: Locally tracks transfer history and stats using IndexedDB.

---

## 6. HARDWARE & SOFTWARE REQUIREMENTS
### 6.1 HARDWARE REQUIREMENTS
- **CPU**: Intel Core i3 (6th Gen) or equivalent.
- **RAM**: 4GB Minimum (8GB recommended for massive folder transfers).
- **Storage**: Sufficient disk space for receiving files (uses OPFS).
- **Network**: Wi-Fi or Cellular data with WebRTC support.

### 6.2 SOFTWARE REQUIREMENTS
- **Operating System**: Windows 10+, macOS, Linux, Android, or iOS.
- **Web Browser**: Chrome 120+, Edge, Firefox, or Safari (WebRTC compliant).
- **Technology Stack**:
    - **Frontend**: Next.js 15+, TypeScript, Vanilla CSS (Custom tokens).
    - **Backend**: Node.js 18+ (Signaling Server).
    - **Database**: IndexedDB (Client-side only).

---

## 7. SOFTWARE REQUIREMENTS SPECIFICATION (SRS)
### 7.1 USERS
- **End-Users**: Individuals needing quick, private file transfers without cloud overhead.
- **Power Users**: Professionals sharing 1GB+ assets (videos, datasets) directly.
- **Privacy Advocates**: Users requiring military-grade encryption for sensitive documents.

### 7.2 FUNCTIONAL REQUIREMENTS
- **Peer Discovery**: Radar UI for local discovery and QR/Link for global joins.
- **Secure Transfer**: Support for multi-file and folder drag-and-drop.
- **Real-time Feedback**: Live speed meter, ETA estimator, and progress bars.
- **PWA Installation**: Ability to add to Home Screen for native experience.

### 7.3 NON-FUNCTIONAL REQUIREMENTS
- **Security**: Mandatory AES-GCM encryption; no data logging on server.
- **Reliability**: Seamless recovery when switching network interfaces (e.g., Wi-Fi to 5G).
- **Performance**: 60fps UI maintained via Web Workers (background processing).

---

## 8. SYSTEM DESIGN
### 8.1 ARCHITECTURE DIAGRAM
```mermaid
graph TD
    A[Browser A: Sender] <-- WebSocket --> S((Signaling Server))
    B[Browser B: Receiver] <-- WebSocket --> S
    A == Secure P2P Tunnel: WebRTC == B
    A -- Encrypted Chunks --> B
```

### 8.2 CONTEXT FLOW DIAGRAM
1.  **Join**: Users join a shared room via code or deep link.
2.  **Handshake**: Signaling server routes connection offers/answers.
3.  **Tunnel**: WebRTC establishes a direct P2P data channel.
4.  **Stream**: Files are encrypted, chunked, and streamed directly to the receiver.

---

## 9. DETAILED DESIGN
- **Encryption Logic**: Uses `crypto.subtle` for AES-GCM 256-bit encryption.
- **Persistence**: IndexedDB stores local metadata for the "History Vault" without server sync.
- **Resource Management**: Uses the **WakeLock API** to prevent mobile sleep during long transfers.

---

## 10. IMPLEMENTATION
The project is built using a modern **Next.js** framework with **TypeScript** for strict type safety. The UI follows an Apple/Vercel-inspired minimalist aesthetic with custom CSS variables for high-end glassmorphism. Core P2P logic is offloaded to **Web Workers** to prevent UI freezes during heavy encryption/decryption tasks.

---

## 11. SOFTWARE TESTING
- **Signaling Test**: Verified successful peer discovery across different subnets.
- **Encryption Test**: Confirmed file integrity using SHA-256 hashing post-transfer.
- **Network Stress Test**: Successfully transferred 2GB files with 100% chunk recovery using ARQ.
- **PWA Test**: Verified offline manifest and "Add to Home Screen" functionality on iOS and Android.

---

## 12. CONCLUSION
Lynkless successfully demonstrates that high-speed, secure, and private file sharing is possible without the cloud. By leveraging modern browser APIs like WebRTC and OPFS, it provides a viable, cost-effective, and privacy-respecting alternative to traditional file-sharing platforms.

---

## 13. FUTURE ENHANCEMENT
- **Native OS Integration**: Integration with the system "Share" menu on mobile.
- **Group Mesh**: Sending one file to multiple connected peers simultaneously.
- **Local-Only Mode**: 100% offline sharing using mDNS for local network discovery.
