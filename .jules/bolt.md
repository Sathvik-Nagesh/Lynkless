## 2026-02-12 - UI Thrashing during High-Speed Transfers
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

## 2026-03-06 - Efficient History Retrieval with IndexedDB Cursors
**Learning:** Fetching an entire IndexedDB store and sorting it in JavaScript (e.g., for a transfer history log) becomes a major performance bottleneck and memory hog as the history grows.
**Action:** Use IndexedDB cursors with a limit and specify direction (e.g., `openCursor(null, 'prev')`) to fetch only the most recent items directly from the database, and implement an observer pattern to keep the UI reactive without polling.
