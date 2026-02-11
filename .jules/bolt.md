## 2026-02-11 - [WebRTC File Transfer Optimization]
**Learning:** Base64 encoding for file chunks increases data size by 33% and adds significant CPU overhead. Additionally, triggering UI re-renders for every 128KB chunk severely degrades performance during high-speed transfers.
**Action:** Always use raw binary for data channels when possible. Implement "header-then-binary" protocol for typed messages. Throttle progress updates to the UI (e.g., every 10 chunks) to preserve CPU for data processing.
