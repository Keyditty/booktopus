# Integration feasibility report

**How this was researched (and its limits).** The sandbox that built this app could not open most of the reference sites
(Audiostacks, Libby Help, OverDrive developer portal, Open Library docs — the network policy returned 403), so I could not
read those pages. Findings below come from web-search summaries and general knowledge, and are labelled accordingly.
**No third-party service was called successfully from the build sandbox except one Google Books request, which returned HTTP 429
(shared-IP quota).** Metadata lookups are therefore covered by mocked-network unit tests, not verified against the live services.

## Summary table

| Source | Method | Status |
|---|---|---|
| ChatGPT lists | Paste / .txt / .md / .csv / .json | ✅ **Working** (unit-tested) |
| Any app | Screenshot upload, on-device OCR (Tesseract) | ✅ **Working** (end-to-end tested in headless Chromium on a synthetic screenshot; real-app screenshots untested) |
| Libby | Exported Timeline CSV/JSON or copied table | ✅ **Working** on a *assumed* column layout (see below), repeatable |
| Audible | Copied library-page text; CSV/JSON from third-party exporters; screenshots | 🟡 **Working, heuristic** — page text layout not verified |
| Hoopla | Copied History text; screenshots | 🟡 **Working, heuristic** — page text layout not verified |
| Add one book by hand | Typed form + live title search (Google Books/Open Library) | ✅ **Working** (form + dedupe tested; live suggestions unverified) |
| Cover/metadata | Google Books + Open Library | 🟡 **Implemented, unverified live** |
| AI vision | User's own Anthropic key, opt-in per batch | 🧪 **Experimental** — never run (no key) |
| Audible/Hoopla/Libby official APIs | — | ⛔ **Blocked / not used** |
| Unattended automatic sync | — | ⛔ **Not possible** with a verified, permitted mechanism |

## Per platform

**Libby / OverDrive.** Libby's help (“Exporting and sharing your timeline”) describes Timeline → Actions → Export timeline; search
summaries indicate a CSV (some pages mention JSON) and that filters carry into the export. I could not see the real column names, so
the parser accepts several spellings (`title/author/isbn/timestamp|date/activity|action/library/format`) and groups rows into
borrow/return/hold events. **If your real export uses different headers, send me a redacted sample and I'll adjust the mapper
(`src/lib/importers/libby.ts`).** The OverDrive developer portal is for libraries/partners, not individual patrons' loan history, so no
official API is used. A shared “Timeline table” link cannot be fetched from a static site (browser CORS); open it and copy the table or download the file instead.
A separate OverDrive “Email history” CSV exists per OverDrive's help; the same importer should handle it if it has title/author columns.

**Audible.** No library export exists in Audible itself (search results: forum answers say “no”). Third-party tools (Audible Library Extractor,
OpenAudible, Libation) export CSV/JSON; the importer accepts such files (`title`, `author`, `narrator`, `asin`, `series` columns).
The unofficial Python `audible` library logs in with Amazon credentials — **rejected**: it violates the “never handle Amazon credentials” rule and is fragile.
A browser extension reading the signed-in page is possible but must be built and maintained per site layout; deferred. Page copy-paste and screenshots work today.
Completion is only recorded when the listing literally says “Finished” (or shows a % bar → “in progress”), and it is kept as a *source note* the user can overrule.

**Hoopla.** Per library FAQs, Hoopla has no export button; History is viewable in-app (a Hoopla developer site exists for partners). Copy-paste and screenshots only.
Movies, music and TV are skipped. Borrowed ≠ finished.

**Cover art & metadata.** Google Books Volumes API (free, key optional, quota-limited) then Open Library search (no key). Results are scored on
title/author similarity; only confident (≥ 0.85) matches overwrite the imported spelling; weak ones go to review. Cached 30 days in IndexedDB.
Attribution is shown in Settings. Covers are hot-linked from the providers, not copied.

**Ongoing sync.** Not claimed. “Repeat imports” are idempotent, so re-importing a fresh Libby export or new screenshots is the supported refresh path.

## Architecture notes
GitHub Pages is static hosting, so there is no server: everything runs in the browser with IndexedDB storage. That also means no credentials
or reading history ever touch a server. Trade-off: no automatic cross-device sync — use Backup/Restore (JSON). The data model is relational
(books, editions-as-source-records, activity events, import batches) so moving to Postgres + auth later is a mapping exercise, and importers
are pure functions returning one `Candidate` type, so new adapters plug into the same review/dedupe/commit pipeline.
