# Tasks App — Session Context

## What this is
A personal productivity PWA for Adam Sharp (depression/anxiety management, new-dad life). Next.js 15 app deployed on Vercel, uses Claude via Vercel AI SDK, reads/writes Obsidian markdown files stored in a GitHub repo.

**Live app**: tasks-nu-pied.vercel.app  
**Code repo**: `adamgsharp/tasks` on branch `claude/tasks-cross-platform-design-tauu2i`  
**Vault repo**: `adamgsharp/obsidian` (brain files live here)

---

## Architecture
- **Frontend**: Next.js 15 App Router, Tailwind, `useChat` (Vercel AI SDK)
- **AI**: Claude via `@ai-sdk/anthropic`, streaming, tool use
- **Storage**: GitHub Contents API reads/writes Obsidian `.md` files directly. No database.
- **Deployment**: Vercel

---

## Vercel Environment Variables
```
ANTHROPIC_API_KEY=...
GITHUB_TOKEN=...          # Fine-grained PAT scoped to adamgsharp/obsidian, Contents R/W
GITHUB_REPO=adamgsharp/obsidian
GITHUB_BRANCH=main
BRAIN_TODO_PATH=To Do.md
BRAIN_INBOX_PATH=Inbox.md
BRAIN_DONE_PATH=Done.md
BRAIN_CONTEXT_PATH=Context.md
```

---

## Key Files
| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main UI — tabbed layout |
| `src/app/api/chat/route.ts` | Chat API, Claude tools |
| `src/app/api/brain/route.ts` | GET/PUT brain files |
| `src/lib/brain.ts` | Builds Claude system prompt, reads brain files |
| `src/lib/github.ts` | `getFile` / `putFile` via GitHub Contents API |

---

## Current UI (tabbed)
Four bottom tabs: **Chat | Next | Inbox | To Do**

- **Chat**: General open-ended chat with full brain context
- **Next**: Separate history, auto-fires `/next` briefing on first visit
- **Inbox**: Renders `Inbox.md` as markdown with interactive checkboxes (remark-gfm), tap to edit, Save writes to GitHub, "Ingest Inbox" button → switches to Chat + fires `/triage`
- **To Do**: Same as Inbox but for `To Do.md`, has "Clean Up & Archive" button → switches to Chat, Claude archives current list to `To Do/Archived/To Do Lists/To Do - [M-DD-YY].md` (reads `created:` frontmatter for date) then rewrites `To Do.md` with only incomplete tasks

---

## Claude Tools (in chat route)
- `save_brain_file` — overwrites `todo`, `inbox`, or `done` file
- `save_file_at_path` — writes to any vault path (used for archiving)

---

## AI Modes (system prompt varies)
- `chat` — general, context-aware
- `next` — /next prioritizer (reassurance digest + one keystone task)
- `inbox` — intake/decompose new captures
- `triage` — one-by-one inbox processor (clears inbox items sequentially)

---

## Brain File Format (To Do.md)
Has YAML frontmatter with `created: YYYY-MM-DD`. Sections: MITs, then categories (Important, Randomized Tasks, Apple, Showboat, Home/Basement, Simon, Errands/Admin, Hobbies/Personal, To Buy, Research, Hold).

---

## iOS Keyboard Fix
Uses `visualViewport` API — container height = `vv.height`, `requestAnimationFrame(() => window.scrollTo(0,0))` if `vv.offsetTop > 0`. No `position: sticky` or `scrollIntoView`.

---

## Backlog (BACKLOG.md in repo)
- Sync full Obsidian vault to GitHub (user doing manually)
- Desktop version (on hold)

---

## Obsidian Sync Setup
- **Desktop**: Obsidian Git plugin → auto-pulls from `adamgsharp/obsidian`, pushes on app quit
- **iOS**: GitSync.md app, x-callback-url automation — `syncmd://x-callback-url/sync?repo=obsidian` runs when Obsidian closes via iOS Shortcut
