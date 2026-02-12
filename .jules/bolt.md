## 2026-02-12 - UI Thrashing during High-Speed Transfers
**Learning:** High-frequency state updates (e.g., file transfer progress every 64KB chunk) can cause massive UI thrashing and block the main thread, especially when multiple heavy components are listening to these updates.
**Action:** Implement throttling for progress notifications (100ms interval is a good balance) and memoize components that receive these updates to prevent redundant re-renders.

## 2026-02-12 - Cascading Renders in Effects
**Learning:** Calling setState synchronously within a useEffect (e.g., clearing unread count when a panel is expanded) triggers an immediate second render cycle, which is inefficient and flagged by modern linters.
**Action:** Move state resets to the event handlers that trigger the change (e.g., the onClick handler of the toggle button) to keep state updates bundled in a single render.
