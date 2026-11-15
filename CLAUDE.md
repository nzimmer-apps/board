# Board — notes for Claude

Personal capture board (MindChuk-style): notes, `#tag` categories, natural-language dates → calendar,
images with on-device OCR (tesseract.js), and per-note notification times.

## Layout

| Path | What | Built / shipped by |
| --- | --- | --- |
| `web/` | React + Vite + TypeScript app. Every other client wraps or mirrors it | `.github/workflows/pages.yml` → GitHub Pages (https://nzimmer-apps.github.io/board/) |
| `android/` | Capacitor 7 wrapper of `web/` (share-sheet intent, local notifications) | `apps.yml` → `Board-android.apk` |
| `src-tauri/` | Tauri 2 Windows app (tray, Ctrl+Alt+B quick-add, notifications) | `apps.yml` → `Board-windows-setup.exe`, `Board-windows.msi` |
| `extension/` | Chrome/Arc MV3 extension, plain JS, talks to Supabase REST directly | `apps.yml` → `Board-extension.zip` |
| `supabase/migrations/` | Postgres schema, one timestamped file per change | `npx supabase db push` (by hand) |

Backend: Supabase project ref `tvgtvkzydawfyfznzvao`. The URL and publishable key are in
`web/.env.production` and `extension/config.js`. They're public by design, because RLS limits every row to its owner.
Never commit an `sb_secret_…` key.

## Build each target

- Web: `cd web && npm ci && npm test && npm run build` (`build` = `tsc --noEmit && vite build`). Dev server: `npm run dev`.
- Android: `cd web && npm run build && npx cap sync android`, then `cd android && ./gradlew assembleRelease`.
  Release signing reads `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS=board` from the environment.
- Windows: `cd web && npm run build`, then from the repo root `npx --prefix web tauri build` (needs Rust).
- Extension: no build. Load `extension/` unpacked.

## Release flow

1. Push to `main`. A change under `web/`, `android/`, `src-tauri/` or `extension/` triggers `apps.yml`
   (or run `gh workflow run apps.yml`).
2. `apps.yml` builds the APK (only if the signing secrets exist), the Windows installers and the extension zip,
   then publishes the GitHub release `v0.2.<run number>` marked as latest.
3. `pages.yml` deploys the web app on pushes that touch `web/`.
4. `ci.yml` runs web tests + typecheck on every pull request.

Signing secrets in GitHub: `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` (alias `board`).
The local copy lives outside the repo in `%USERPROFILE%\.board-signing\`. Never commit, print or paste signing
material. `.gitignore` covers `*.jks`, `*.keystore` and `*KEYSTORE*.txt`.
On Windows PowerShell 5.1, don't pipe a value into `gh secret set` (it appends CRLF). Redirect a
no-newline file through cmd instead: `cmd /c "gh secret set NAME -R nzimmer-apps/board < file"`.

## Rules

- **Schema changes = a new file in `supabase/migrations/` + `npx supabase db push`.** Never edit an
  applied migration, and never change the schema by hand in the SQL editor. Name files
  `YYYYMMDDHHMMSS_description.sql` (`npx supabase migration new <description>` creates one).
  One-time setup on a new machine: `npx supabase login`, then `npx supabase link --project-ref tvgtvkzydawfyfznzvao`.
- Keep `web/src/parse.ts` and `extension/parse.js` behaviour in sync. Parser tests live in `web/src/parse.test.ts`.
- `keepalive.yml` calls `public.ping()` daily so the free Supabase project doesn't pause. Don't drop that function.
