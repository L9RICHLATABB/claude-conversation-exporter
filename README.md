# claude-export

> Export any Claude conversation to **Markdown** or **JSON** in one click.

No extensions required. Works by calling Claude's own internal API — no clipboard hacks, no scraping, no rate limits. Handles conversations of any length instantly.

---

## Install

### Option 1 — Bookmarklet (no install needed)

1. Run `node build.js` to generate `bookmarklet.txt`
2. Create a new bookmark in your browser
3. Set the **URL** to the contents of `bookmarklet.txt`
4. Navigate to any `claude.ai/chat/...` page
5. Click the bookmark → file downloads immediately

Or grab the pre-built bookmarklet from `bookmarklet.min.js`.

---

### Option 2 — Userscript (recommended)

Adds a persistent **⬇ Export** button to Claude's UI on every conversation.

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. Create a new userscript and paste in `userscript.js`
3. Save — the button appears automatically on `claude.ai`

---

### Option 3 — Browser Console (quick)

Paste `src/exporter.js` directly into the browser console on any Claude conversation page.

---

## Usage

**Bookmarklet / Console:** Click → file downloads instantly as `.md`

**Userscript button:** Click **⬇ Export** → choose format from dropdown:

| Option | Output |
|--------|--------|
| 📄 Markdown | `conversation-title.md` with timestamps |
| 📄 Markdown (no timestamps) | Same but cleaner for sharing |
| 🗂 JSON | Structured data with all metadata |

---

## Output examples

**Markdown:**
```markdown
# Building CSCAschool

*Exported 4/16/2026 · Started Apr 1, 2026, 2:14 PM*

---

## 🧑 You *(Apr 1, 2026, 2:14 PM)*

Help me set up Supabase RLS for my quiz platform...

---

## 🤖 Claude *(Apr 1, 2026, 2:14 PM)*

Here's the RLS policy you need...
```

**JSON:**
```json
{
  "title": "Building CSCAschool",
  "conversation_id": "abc-123",
  "created_at": "2026-04-01T14:14:00Z",
  "exported_at": "2026-04-16T10:00:00Z",
  "message_count": 42,
  "messages": [
    {
      "role": "human",
      "text": "Help me set up Supabase RLS...",
      "timestamp": "2026-04-01T14:14:00Z",
      "uuid": "..."
    }
  ]
}
```

---

## How it works

Claude's web app exposes an internal REST API at:
```
/api/organizations/{orgId}/chat_conversations/{conversationId}
```

The script reads your `lastActiveOrg` cookie (already set by claude.ai) and the conversation ID from the URL, calls this endpoint with your existing session credentials, and formats the response locally. **No data ever leaves your browser except back to claude.ai.**

---

## Build

```bash
node build.js
# → bookmarklet.min.js  (drag-to-bookmarks-bar)
# → bookmarklet.txt     (copy-paste URL)
```

---

## Caveats

- Works on `claude.ai` only (not API/Claude Code)
- If Anthropic changes their internal API shape, the script may break — open an issue
- Branched conversations (edited messages with multiple paths) export the visible/main path only

---

## License

MIT
