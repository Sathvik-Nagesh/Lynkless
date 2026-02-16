## 2026-02-12 - UI Thrashing during High-Speed Transfers
**Learning:** High-frequency state updates (e.g., file transfer progress every 64KB chunk) can cause massive UI thrashing and block the main thread, especially when multiple heavy components are listening to these updates.
**Action:** Implement throttling for progress notifications (100ms interval is a good balance) and memoize components that receive these updates to prevent redundant re-renders.

## 2026-02-12 - Cascading Renders in Effects
**Learning:** Calling setState synchronously within a useEffect (e.g., clearing unread count when a panel is expanded) triggers an immediate second render cycle, which is inefficient and flagged by modern linters.
**Action:** Move state resets to the event handlers that trigger the change (e.g., the onClick handler of the toggle button) to keep state updates bundled in a single render.

## 2026-02-14 - Derived State vs. useEffect for Visibility
**Learning:** Using `useEffect` to sync a visibility state with props (e.g., showing a modal when `isConnected` becomes true) causes a synchronous cascading render. This is inefficient and often unnecessary.
**Action:** Use derived state (a simple boolean expression in the render body) whenever possible. If state is needed for manual dismissal, use a "closed version" state (e.g., `closedForId`) to track which item was last dismissed, allowing the UI to re-appear if the ID changes.

## 2026-02-15 - Binary Protocol for WebRTC Transfers
**Learning:** Base64 encoding for file chunks adds ~33% overhead and consumes significant CPU for string conversion and allocation. WebRTC `RTCDataChannel` (in `ordered: true` mode) guarantees message order, allowing a "header-then-binary" protocol.
**Action:** Send a JSON header followed by raw binary data. Use a peer-keyed map on the receiver side to associate the incoming binary chunk with its preceding metadata. This reduces payload size and eliminates `atob`/`btoa` overhead.
