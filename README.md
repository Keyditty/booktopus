# Booktopus 🐙

Toni's underwater library. A fantasy-ocean themed personal virtual bookshelf that pulls books from Audible, Libby, Hoopla and your ChatGPT lists into one place —
without typing hundreds of titles. Runs entirely in the browser (installable as a PWA), so it can be hosted free on **GitHub Pages**
and your reading history never leaves your device.

**Read [FEASIBILITY.md](FEASIBILITY.md)** for what works, what's experimental, and what's blocked (and what could *not* be verified).

## What you can do
- **Home** screen: greeting, then a friendly octopus whose **eight arms each hold a book** — either *Reading now* (glowing teal outline) or *Up next* (dashed gold outline), so you never forget what you meant to read next. Tap a free arm to give it a book; tap a held book to start it, finish it, or free the arm. Below are shelf rows (recently added, want to read, finished lately, favorites, borrowed).
- **Library** tab: the full cover grid with search, filters and sorting.
- Two color themes: **Deep Sea** (dark) and **Sunlit Lagoon** (light) — switch from the ⋯ menu or Settings.
- Browse covers on a driftwood-shelf grid; shelves: All, Reading, Finished, Want to Read, Borrowed, Favorites, Did Not Finish.
- Search title / author / narrator / series; filter by service, status, genre, format, author, series, rating; sort.
- One-tap status, favorite, star rating, dates, notes, “read again”.
- **Add one book by hand**: type a few words, tap the matching book (cover + author fill in), choose format/service/status. Also offered when a search finds nothing.
- **Add books** from: pasted lists (ChatGPT chats, markdown tables, CSV, JSON, TXT) · screenshots (many at once, on-device OCR) ·
  Libby timeline export · Audible (copied text / third-party CSV) · Hoopla (copied history).
- Review screen before anything is saved: new / already-have / possible duplicates / needs a look; accept all confident matches in one tap.
- Same book on several services = one book with each service kept underneath. Re-importing never duplicates. Undo any import.
- Backup/restore (JSON), CSV export, import history.

Source activity (borrowed/returned/purchased) is stored separately from reading status. A returned loan is never “Finished” on its own.

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # parsing, dedupe, idempotency, status-preservation, undo
npm run build      # outputs dist/
```
Node 20+ required. The site also loads two Google Fonts (Cinzel, Alegreya) and falls back to system serif fonts offline. `npm run dev/build` first copies the OCR engine + English data into `public/ocr` (git-ignored) so OCR is self-hosted.

## Deploy to GitHub Pages
1. Push to `main`. In the repo: **Settings → Pages → Source: GitHub Actions**.
2. The included workflow (`.github/workflows/deploy.yml`) tests, builds and publishes. The site uses relative asset paths, so it works at
   `https://<user>.github.io/<repo>/` or a custom domain with no config.
3. On Toni's iPhone: open the site in Safari → Share → **Add to Home Screen**.

## Optional configuration (Settings screen, stored only in this browser)
- **Google Books API key** — avoids rate limits on cover lookup. Open Library is used as fallback and needs no key.
- **Anthropic API key** — enables optional AI vision for screenshots, only when ticked per batch; screenshots are then sent to Anthropic. Experimental/untested.
- Turn online lookup off entirely to stay fully offline.
No secrets live in the code or repo.

## Where things are
```
src/lib/importers/   text (ChatGPT/CSV/JSON/MD), libby, listing (Audible/Hoopla), screenshot (OCR layout)
src/lib/store.ts     dedupe, plan, idempotent commit, undo, merge/split, status rules
src/lib/match.ts     identifier → exact → conservative fuzzy matching
src/lib/metadata.ts  Google Books + Open Library lookup, caching
src/lib/ocr.ts       on-device Tesseract    src/lib/vision.ts  optional AI vision
src/components/      shelf, details, import flow, review
samples/             try-me files (ChatGPT chat, Libby CSV)
```

## Known limits
- Data lives in this browser. Phone ↔ computer needs Backup → Restore (no automatic sync; a hosted backend would be a future phase).
- OCR works best on list-style screens (title + author text). Cover-only grids rely on whatever text is on the covers; unsure ones are flagged for review.
- Audible/Hoopla/Libby formats were not verifiable from the build environment; parsers are tolerant but may need tuning against real files.
- Clearing site data in the browser erases the library — download a backup now and then.
