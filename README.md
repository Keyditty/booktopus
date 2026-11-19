# Booktopus 🐙

Toni's underwater library. A fantasy-ocean themed personal virtual bookshelf that pulls books from Audible, Libby, Hoopla and your ChatGPT lists into one place —
without typing hundreds of titles. Runs entirely in the browser (installable as a PWA), so it can be hosted free on **GitHub Pages**
and your reading history never leaves your device.

**Read [FEASIBILITY.md](FEASIBILITY.md)** for what works, what's experimental, and what's blocked (and what could *not* be verified).

## What you can do
- **Home** screen: greeting, then a friendly octopus whose **eight arms each hold a book** — either *Reading now* (glowing teal outline) or *Up next* (dashed gold outline), so you never forget what you meant to read next. Tap a free arm to give it a book; tap a held book to start it, finish it, or free the arm. Below are shelf rows (recently added, want to read, finished lately, favorites, borrowed).
- **Reef** tab (gamification; tap any month, year or genre bar to see the actual books behind it): points for every finished book (plus small bonuses), 8 sea-creature levels earned by books finished (10 / 25 / 50 / 100 / 250 / 500 / 1,000), 17 badges, yearly/monthly goals and streaks, books per month/year, counts by genre/format/service/author, "Ideas for you" (next in series, stalled reads, picks from your to-read pile), and an octopus fact of the day. Points are always calculated from your shelf, never stored, so they can't drift or double count.
- **First-run tour**: a 9-step walkthrough on first open (replay from the ⋯ menu or Settings). A fresh install starts empty; sample books are only in Settings → "Add sample books".
- **Series tracker** (🔗 Series tab + a "Keep going" row on Home): every series you're in, progress dots, what's next (even if you don't own it yet), one-tap Start reading / Up next / Want to read. Series info is saved from lookups, from typing it on a book, or by one "Check my shelf" button.
- **Edit where a book lives**: change service/format/status per copy, add another place ("also on Libby"), or remove one.
- **Two searches**: 📚 My library vs 🌐 Find any book (title, author or ISBN; ranks the author you mean first even if you misspell the first name, e.g. Steven/Stephen; All / Title / Author switch; "Looking for an author?" suggestions; add to Want to Read, mark "I have it", see the whole series).
- **Series lookup (experimental)**: every book in a series via Hardcover (free token) or Inventaire (no key), with "Test connection" buttons in Settings.
- **Spice level** 🌶 0-5 per book, shown on the cover, filterable, in the CSV export.
- **Find more to read** (Reef tab): type any author, genre/mood ("romantasy", "spicy fantasy") or a book you loved, or tap one of your own genres, to get web-search links and in-app ideas you can add to Want to Read. Suggestions from your shelf appear below.
- **Genres**: every book can have any genres you like (type your own, e.g. *Romantasy*, *Spicy Romance*, *Dark Romance*). Tap “＋ Genre” on a book.
- **Find more to read**: ideas based on your favorite author, genre and book, with one-tap web searches (Google, Goodreads, StoryGraph, Audible) and in-app results you can add to Want to Read.
- **Safety**: “Erase library” needs a typed confirmation and offers a backup download first.
- **Library** tab: the full cover grid with search, filters and sorting.
- Two color themes: **Deep Sea** (dark) and **Sunlit Lagoon** (light) — switch from the ⋯ menu or Settings.
- Browse covers on a driftwood-shelf grid; shelves: All, Reading, Finished, Want to Read, Borrowed, Favorites, Did Not Finish.
- Search title / author / narrator / series; filter by service, status, genre, format, author, series, rating; sort.
- One-tap status, favorite, star rating, dates, notes, “read again”.
- **Add one book by hand**: type a few words, tap the matching book (cover + author fill in), choose format/service/status. Also offered when a search finds nothing.
- **Add books** from (Excel `.xlsx`, CSV, JSON, text or pasted): pasted lists (ChatGPT chats, markdown tables, CSV, JSON, TXT) · screenshots (many at once, on-device OCR) ·
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

Browser smoke tests (optional, need Playwright): `e2e/smoke.cjs`, `e2e/features.cjs`, `e2e/reef.cjs`, `e2e/ideas.cjs`, `e2e/token.cjs` and `e2e/find.cjs`.

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

## Privacy, data and safety
- **Your library never leaves the device.** There is no server and no account. Books, ratings, notes and settings are stored in the browser (IndexedDB / localStorage).
- **What is sent out, and to whom:**
  - Cover/description lookups send only the title/author/ISBN you typed or imported to Google Books and Open Library.
  - Series lookups send a title/author or series name to Inventaire, and to Hardcover only if a token is saved.
  - Optional AI vision sends the chosen screenshots to Anthropic, only with the user's own key and an explicit per-batch tick.
  - The page loads two fonts from Google Fonts (which reveals the visitor's IP address to Google, like any web font).
  - Screenshots are read on the device by OCR (the OCR engine and language data are served from this site) and are never stored.
- **API keys/tokens** (Google, Hardcover, Anthropic) are kept only in this browser's localStorage and are only sent to their own service. Anyone with access to the unlocked device could read them, so use keys you can revoke.
- **Content Security Policy:** the built site restricts scripts to its own files and network calls to the book services listed above.
- **Backups matter.** Clearing site data, or (on iPhone) not visiting a Safari tab for about a week, can erase a web page's saved data. Add the site to the Home Screen and use Settings → Download backup (the app reminds you every 30 days). Restoring validates the file and skips anything unreadable.
- Reviewed with: unit tests (75), three browser suites, a large-library timing test (1,500 books), `npm audit` (0 findings), a source scan for unsafe patterns (none), and OCR under the CSP.

## Known limits
- Tested in Chromium at phone size and desktop, not on a physical iPhone/Safari.
- Data lives in this browser. Phone ↔ computer needs Backup → Restore (no automatic sync; a hosted backend would be a future phase).
- OCR works best on list-style screens (title + author text). Cover-only grids rely on whatever text is on the covers; unsure ones are flagged for review.
- Audible/Hoopla/Libby formats were not verifiable from the build environment; parsers are tolerant but may need tuning against real files.
- Clearing site data in the browser erases the library — download a backup now and then.
