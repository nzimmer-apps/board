# Board — notes for Claude

## Two apps from one repo: `main` and `dev`

| Branch | App | Database (Supabase ref) | Web | Releases |
| --- | --- | --- | --- | --- |
| `main` | **Board**, the real one (`com.nzimmerapps.board`, Ctrl+Alt+B) | `tvgtvkzydawfyfznzvao` (live data) | https://nzimmer-apps.github.io/board/ | `v0.2.N`, marked latest |
| `dev` | **Board Dev** (`com.nzimmerapps.board.dev`, Ctrl+Alt+D), installs next to the real one | `isznsbnczhpomrdvvzom` (test data) | https://nzimmer-apps.github.io/board/dev/ | `dev-v0.2.N` pre-releases |

New features land on `dev` first (PRs into `dev`), and reach `main` only when the user says to port them.
Locally, `C:\CLAUDE_WORKING_DIR\board` is `main` and `C:\CLAUDE_WORKING_DIR\board-dev` is a git worktree of this repo on `dev`.
The old separate `nzimmer-apps/board-dev` repo is archived (folded in 2026-11-19).

**The committed files always hold the real Board's settings.** `node scripts/use-env.mjs dev` swaps in Board Dev's
database, names, app ids, hotkey and site address (and `prod` swaps back). The workflows run it on `dev`, and
`node scripts/use-env.mjs check dev|prod DIR` fails a build that names the other app's database. Never commit the
files in the dev state (`ci.yml` checks). Every `npm run dev` uses the dev database (`web/.env.development`).
Both apps share the `nzimmer-apps.github.io` origin, so browser storage keys that hold data must name their database
(see `web/src/offlineQueue.ts`) and the service worker keeps a cache per scope.

Personal capture board (MindChuk-style): notes, `#tag` categories, natural-language dates → calendar,
images with on-device OCR (tesseract.js), and per-note notification times.

## Layout

| Path | What | Built / shipped by |
| --- | --- | --- |
| `web/` | React + Vite + TypeScript app. Every other client wraps or mirrors it | `.github/workflows/pages.yml` → GitHub Pages (`/board/` from main, `/board/dev/` from dev) |
| `android/` | Capacitor 7 wrapper of `web/` (share-sheet intent, local notifications) | `apps.yml` → `Board-android.apk` |
| `src-tauri/` | Tauri 2 Windows app (tray, Ctrl+Alt+B quick-add, notifications) | `apps.yml` → `Board-windows-setup.exe`, `Board-windows.msi` |
| `extension/` | Chrome/Arc MV3 extension, plain JS, talks to Supabase REST directly | `apps.yml` → `Board-extension.zip` |
| `supabase/migrations/` | Postgres schema, one timestamped file per change | `npx supabase db push` (by hand) |

Backend: Supabase (refs in the table above). The URL and publishable key are in
`web/.env.production` and `extension/config.js` (prod values; `use-env.mjs` holds the dev ones). They're public by design, because RLS limits every row to its owner.
Never commit an `sb_secret_…` key.

## Build each target

- Web: `cd web && npm ci && npm test && npm run build` (`build` = `tsc --noEmit && vite build`). Dev server: `npm run dev`.
- Android: `cd web && npm run build && npx cap sync android`, then `cd android && ./gradlew assembleRelease`.
  Release signing reads `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS=board` from the environment.
- Windows: `cd web && npm run build`, then from the repo root `npx --prefix web tauri build` (needs Rust).
- Extension: no build. Load `extension/` unpacked.

## Release flow

1. Push to `main` or `dev`. A change under `web/`, `android/`, `src-tauri/`, `extension/` or `scripts/use-env.mjs`
   triggers `apps.yml` (or run `gh workflow run apps.yml --ref dev`).
2. `apps.yml` builds the APK (only if the signing secrets exist), the Windows installers and the extension zip.
   `main` publishes `v0.2.<run number>` as latest; `dev` publishes the pre-release `dev-v0.2.<run number + 100>`
   (the +100 keeps it above the old board-dev repo's builds, so it installs as an update).
3. `pages.yml` rebuilds the whole site (both apps) on a push to either branch that touches `web/`.
4. `ci.yml` runs web tests, typecheck, the dev/prod switch round trip and Android/Windows compile checks on every PR.
5. `keepalive.yml` (scheduled, runs from `main` only) pings both databases daily.

Signing secrets in GitHub: `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` (alias `board`).
The local copy lives outside the repo in `%USERPROFILE%\.board-signing\`. Never commit, print or paste signing
material. `.gitignore` covers `*.jks`, `*.keystore` and `*KEYSTORE*.txt`.
On Windows PowerShell 5.1, don't pipe a value into `gh secret set` (it appends CRLF). Redirect a
no-newline file through cmd instead: `cmd /c "gh secret set NAME -R nzimmer-apps/board < file"`.

## How the bigger features work

Everything here is on both branches (ported to the real Board in v0.2.13, 2026-11-19).

- Repeating items: `items.repeat` (jsonb rule) + `web/src/repeat.ts`. `due_at` is the first occurrence; later ones are computed.
  The rule can also hold `nth` (2nd / last weekday of the month, from the live Board) and `until` (last day, "YYYY-MM-DD").
  The live Board once stored repeats as a text word + `repeat_until`; `20261119120000_repeat_rule.sql` converted that.
  `repeat_until` still exists, empty and unused, only so apps v0.2.11 and older keep working
  (`20261119200000_keep_repeat_until.sql`). Drop it in a new migration once those are gone, after asking the user.
- Reminders are never assumed: `remind_offsets` null = not chosen yet, and the card asks; `[]` = none (from the live Board).
- Parser (`web/src/parse.ts`): `parseAll` returns several items for "6 pm sundays, 7 pm monday and thursdays", and
  reads "notify 2 hours and 8 hours before" into notification times.
- Attachments: voice notes and PDFs in the private `files` bucket (`web/src/files.ts`); text found in a screenshot
  or PDF that contains a date opens `EventPrompt` rather than silently creating an event.
- Voice notes and audio files are turned into text: live in Chrome/Edge while recording, otherwise afterwards on the
  device with Whisper (`web/src/transcribe.ts` + `transcribe.worker.ts`, transformers.js, `Xenova/whisper-base.en`
  downloaded from huggingface.co on first use, then cached). `web/src/voice.ts` reads the words: a day **and** a time
  books the note straight onto the calendar (toast with Undo); a day alone opens `EventPrompt`.
- Event links: `supabase/functions/unfurl` (edge function, signed-in users only) reads a page's title and schema.org
  event data. Deploy with `npx supabase functions deploy unfurl`. It identifies itself honestly and does not log in
  anywhere, so pages behind a login (many Facebook events) come back without a date and the app asks for one.
- Archive screen, Tags screen (`rename_tag` / `delete_tag` SQL functions, colours in `categories`), themes
  (`web/src/theme.ts` + `features.css`), export (`web/src/export.ts`).
- Sharing: `shares` table (one note or one tag, with a person by confirmed email or a read-only secret link).
  RLS on `items` / storage reads it through `share_access()`; people's own lists filter `user_id` so shared notes only
  show under the Shared tab. Links open through the `shared` edge function (deploy with verify_jwt off).
- Most migrations were applied to both projects through the Supabase API, so each project's migration history uses
  different version numbers than the files. They are idempotent; `supabase db push` may ask to re-apply them, which
  is safe. Check with `npx supabase migration list` first.
- `web/.env.local` (git-ignored) holds a test account for the dev database, for local testing only.

## Rules

- **Schema changes = a new file in `supabase/migrations/` + `npx supabase db push`.** Never edit an
  applied migration, and never change the schema by hand in the SQL editor. Name files
  `YYYYMMDDHHMMSS_description.sql` (`npx supabase migration new <description>` creates one).
  One-time setup: `npx supabase login`, then link each folder to its own project: `npx supabase link --project-ref
  isznsbnczhpomrdvvzom` in `board-dev`, `tvgtvkzydawfyfznzvao` in `board`. Check `supabase/.temp/project-ref` before
  every `db push`, and never push to the live project without the user's OK.
- `extension/parse.js` is generated from `web/src/parse.ts`: run `npm run build:ext` in `web/` after changing the parser. Parser tests live in `web/src/parse.test.ts`.
- `keepalive.yml` calls `public.ping()` daily on both databases so the free Supabase projects don't pause. Don't drop that function.
