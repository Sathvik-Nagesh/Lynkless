## 2026-02-12 - UI Thrashing during High-Speed Transfers
**Learning:** High-frequency state updates (e.g., file transfer progress every 64KB chunk) can cause massive UI thrashing and block the main thread, especially when multiple heavy components are listening to these updates.
**Action:** Implement throttling for progress notifications (100ms interval is a good balance) and memoize components that receive these updates to prevent redundant re-renders.

## 2026-02-12 - Cascading Renders in Effects
**Learning:** Calling setState synchronously within a useEffect (e.g., clearing unread count when a panel is expanded) triggers an immediate second render cycle, which is inefficient and flagged by modern linters.
**Action:** Move state resets to the event handlers that trigger the change (e.g., the onClick handler of the toggle button) to keep state updates bundled in a single render.

## 2026-02-14 - Derived State vs. useEffect for Visibility
**Learning:** Using `useEffect` to sync a visibility state with props (e.g., showing a modal when `isConnected` becomes true) causes a synchronous cascading render. This is inefficient and often unnecessary.
**Action:** Use derived state (a simple boolean expression in the render body) whenever possible. If state is needed for manual dismissal, use a "closed version" state (e.g., `closedForId`) to track which item was last dismissed, allowing the UI to re-appear if the ID changes.

## 2026-02-19 - Binary over Base64 for WebRTC
**Learning:** Sending binary data (Uint8Array/ArrayBuffer) over WebRTC is significantly more efficient than Base64. It reduces payload size by ~33% and eliminates expensive encoding/decoding cycles on the main thread.
**Action:** Use a "header-then-binary" protocol for file transfers. Send a small JSON metadata message followed immediately by the raw binary chunk. Use a per-peer state map to associate the two.
