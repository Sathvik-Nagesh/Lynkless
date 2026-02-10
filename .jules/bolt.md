# Bolt's Journal

## 2025-01-24 - Initializing Journal
**Learning:** Just starting the mission to optimize this P2P file sharing app.
**Action:** Explore the codebase for performance bottlenecks.

## 2025-02-10 - TypedArray.buffer Pitfall
**Learning:** `TypedArray.prototype.buffer` returns the *entire* underlying `ArrayBuffer`, not a slice of it. When using a binary protocol where a view represents a portion of a larger buffer (like after unpacking headers), accessing `.buffer` directly includes the headers.
**Action:** Use `.slice().buffer` to get a new `ArrayBuffer` containing only the relevant data, or store the `Uint8Array` view directly.
