## 2026-02-13 - [WebRTC Binary Transfer & UI Throttling]
**Learning:**
1. WebRTC DataChannels are ordered by default, allowing a "header-then-binary" protocol where a JSON header is followed by a raw ArrayBuffer chunk. This eliminates Base64 overhead (33% smaller payload, much less CPU).
2. Throttling React state updates for file transfer progress is CRITICAL. Updating at 64KB chunk speed (~1000+ times/sec) will crash the UI thread. A 100ms throttle (10fps) is sufficient for a smooth progress bar while staying responsive.
3. Synchronous `setState` in `useEffect` (derived from props) is a common source of "cascading renders" and performance warnings. Prefer adjusting state during render (if safe) or moving to event handlers.

**Action:**
1. Use binary transfer for all future WebRTC data projects.
2. Always throttle high-frequency progress updates from background managers to the UI.
3. Fix cascading renders by deriving state or using event-based updates.
