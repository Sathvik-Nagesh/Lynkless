## 2026-02-12 - UI Thraging during High-Speed Transfers
**Learning:** High-frequency state updates (e.g., file transfer progress every 64KB chunk) can cause massive UI thrashing and block the main thread, especially when multiple heavy components are listening to these updates.
**Action:** Implement throttling for progress notifications (100ms interval is a good balance) and memoize components that receive these updates to prevent redundant re-renders.

## 2026-02-12 - Cascading Renders in Effects
**Learning:** Calling setState synchronously within a useEffect (e.g., clearing unread count when a panel is expanded) triggers an immediate second render cycle, which is inefficient and flagged by modern linters.
**Action:** Move state resets to the event handlers that trigger the change (e.g., the onClick handler of the toggle button) to keep state updates bundled in a single render.

## 2026-02-14 - Derived State vs. useEffect for Visibility
**Learning:** Using `useEffect` to sync a visibility state with props (e.g., showing a modal when `isConnected` becomes true) causes a synchronous cascading render. This is inefficient and often unnecessary.
**Action:** Use derived state (a simple boolean expression in the render body) whenever possible. If state is needed for manual dismissal, use a "closed version" state (e.g., `closedForId`) to track which item was last dismissed, allowing the UI to re-appear if the ID changes.

## 2026-02-15 - Eliminating Base64 Overhead in P2P Transfers
**Learning:** Base64 encoding binary chunks in a WebRTC DataChannel adds ~33% payload overhead and significant CPU strain on the main thread (from `atob`/`btoa`). Reliable, ordered DataChannels guarantee message order, allowing a "header-then-binary" protocol.
**Action:** Send a small JSON metadata header immediately followed by raw binary (`Uint8Array`). Use a per-peer `pendingChunkMetadata` map on the receiver side to associate the incoming binary chunk with its metadata.

## 2026-02-15 - Zero-Copy Chunking with `subarray()`
**Learning:** `TypedArray.prototype.slice()` creates a new `TypedArray` and copies the underlying data into a new `ArrayBuffer`. For file transfers, this adds significant memory and CPU overhead for every chunk. `TypedArray.prototype.subarray()` creates a new view on the *same* buffer, which is zero-copy.
**Action:** Use `subarray()` instead of `slice()` when partitioning binary data for WebRTC transfers. `RTCDataChannel.send()` handles these views correctly and efficiently.

## 2026-02-25 - Reducing Yield Frequency for Throughput
**Learning:** Yielding the event loop via `setTimeout(..., 1)` after every single 64KB chunk creates a massive performance bottleneck. Since `setTimeout` minimum delay is ~4ms, throughput is capped at ~16MB/s regardless of network speed.
**Action:** Yield the event loop less frequently (e.g., every 16 chunks or 1MB) and use a 0ms delay. This maintains UI responsiveness while increasing theoretical throughput by 16x.

## 2026-02-25 - Moving Math out of Hot Loops
**Learning:** Calculating transfer metrics (speed, ETA, progress %) for every incoming/outgoing chunk (64KB) consumes significant CPU on the main thread during high-speed transfers.
**Action:** Pass raw data to a throttled notification method and perform expensive calculations only when an update is actually being emitted to listeners (e.g., every 100ms).

## 2026-03-01 - Efficient Database Polling with Observer Pattern
**Learning:** Polling IndexedDB with a fixed interval (e.g., 5s) to update history UI is inefficient and drains battery. Furthermore, fetching the entire history and sorting it in JavaScript becomes O(N log N) in the main thread.
**Action:** Implement an observer pattern for database changes and use an IndexedDB reverse cursor with a limit to fetch only the N most recent items. This keeps UI updates reactive and lightweight.

## 2026-03-05 - Zero-Copy E2EE Buffer Management
**Learning:** Manual buffer concatenation in E2EE operations (like salt + IV + encrypted data) creates a full copy of the encrypted data, potentially doubling memory usage during large file transfers. Similarly, `ArrayBuffer.slice()` creates unnecessary copies.
**Action:** Use the `File` constructor's ability to take an array of buffers for zero-copy concatenation, and use `TypedArray.prototype.subarray()` for extraction to create views instead of copies.

## 2026-03-08 - O(N) Directory Traversal & Spec Compliance
**Learning:** `Array.prototype.concat()` in a recursive directory traversal creates $O(N^2)$ time/memory complexity due to repeated array copying. Additionally, the FileSystem API's `readEntries()` may only return partial results and MUST be called in a loop until it returns an empty array to ensure all items are processed.
**Action:** Use a recursive helper with a shared results array and `push()` for $O(N)$ traversal. Always wrap `readEntries()` in a loop to guarantee complete directory reading according to the specification.

## 2026-03-12 - O(1) Memory Aggregation with IndexedDB Cursors
**Learning:** Using `db.getAll()` to calculate aggregate statistics (like total size) on an IndexedDB store loads all records into memory at once. As transfer history grows, this causes significant, unnecessary memory spikes in the main thread.
**Action:** Use `openCursor()` to iterate through records one by one for $O(1)$ space complexity when performing aggregate calculations on large datasets.

## 2026-03-15 - Off-Thread Image Decoding & Zero-Copy Base64 Avoidance
**Learning:** Using `FileReader.readAsDataURL` for image processing creates a Base64 string that is 33% larger than the original data and decoded on the main thread, causing memory spikes and UI jank.
**Action:** Use `URL.createObjectURL` to create a lightweight O(1) reference and `img.decode()` to move image decoding off the main thread. Always call `URL.revokeObjectURL` to prevent memory leaks.

## 2026-03-20 - Parallelizing Mesh Broadcast Transmission
**Learning:** Sending file chunks to multiple peers sequentially in a mesh network creates a "head-of-line blocking" scenario where a single slow peer or WebRTC backpressure stalls transmission to all other peers.
**Action:** Use `Promise.all()` to transmit chunks to all active peers concurrently. This ensures faster peers can receive data at their maximum potential rate regardless of slow peers in the same mesh.

## 2026-04-10 - Parallelizing File Reading in Zipper
**Learning:** Using legacy `FileReader` with manual state tracking for multiple files is error-prone and serializes reading. `Promise.all()` with `file.arrayBuffer()` allows the browser to parallelize file I/O more efficiently and results in much cleaner code.
**Action:** Always prefer `Promise.all()` and `file.arrayBuffer()` (or `file.stream()`) over `FileReader` for processing multiple files.

## 2026-05-20 - Atomic Binary Protocol for Reduced Overhead
**Learning:** Sending separate JSON metadata and raw binary messages for every 256KB chunk (4 messages per MB) creates significant overhead in the WebRTC DataChannel and browser event loop. Furthermore, it introduces a fragile dependency on message ordering across different internal WebRTC buffers.
**Action:** Use an atomic binary protocol where a small fixed-size header (e.g., 40 bytes) containing metadata is prepended to each binary chunk. This halves the number of messages and ensures metadata is always perfectly synchronized with its data.

## 2026-05-20 - OPFS Write Performance via Pre-allocation
**Learning:** Origin Private File System (OPFS) `FileSystemSyncAccessHandle` writes can be slightly slower if the OS has to repeatedly allocate new disk blocks as the file grows.
**Action:** Use `accessHandle.truncate(totalSize)` during transfer initialization to pre-allocate the entire file size on disk. This results in more contiguous disk writes and improved overall throughput.

## 2026-05-25 - Zero-Copy Blob Finalization in Next.js
**Learning:** In some Next.js build environments, `Uint8Array` is treated as possibly backed by `SharedArrayBuffer`, making it incompatible with `BlobPart[]` due to strict type checking. While `new Uint8Array(chunk)` is a safe way to ensure compatibility, it adds a redundant memory copy.
**Action:** Use `as unknown as BlobPart[]` cast when the source is known to be a standard `ArrayBuffer` (e.g. from WebRTC DataChannel) to maintain $O(1)$ finalization performance without sacrificing type safety or breaking the build.

## 2026-05-25 - Post-Payload Handshake Strategy
**Learning:** Moving the "Handshake Wait" (Awaiting Final ACK) after the final chunk transmission is critical. Doing it before the last chunk blocks the network pipe and adds unnecessary latency to the transfer completion.
**Action:** Always ensure network-blocking synchronization happens after all data payload chunks have been dispatched to the transport layer.
