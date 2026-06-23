# HTML Parsing

> Part of [Architecture overview](../architecture.md).

<!-- spec-synced-through: a710d8f -->

The transit results page is server-rendered HTML. The handler:

- Splits by `<hr size="1" color="black">` (handles both self-closing and non-self-closing forms).
- Normalizes line endings via `/\r?\n\r?\n/` so CRLF and LF responses parse identically.
- Picks `blocks[TARGET_BLOCK_INDEX]` (index `2`) — the block that contains all candidate transit routes.
- Calls `splitRoutes()`, which splits on the lookahead `(?=発着時間：)` to separate individual route candidates.
- Returns up to `MAX_CANDIDATES` (`2`) routes.

Dynamic substrings used inside regular expressions are escaped via `escapeRegExp()` to prevent ReDoS.

<!-- /spec-synced-through -->
