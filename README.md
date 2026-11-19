# Board

Two apps come out of this repo:

- **Board** from `main`: the real one, with your live notes. Web: https://nzimmer-apps.github.io/board/, apps on the [latest release](https://github.com/nzimmer-apps/board/releases/latest).
- **Board Dev** from `dev`: the test version, with its own database and app ids, so it installs next to the real one. New features land here first. Web: https://nzimmer-apps.github.io/board/dev/, apps on the newest `dev-v0.2.*` [pre-release](https://github.com/nzimmer-apps/board/releases).

(Board Dev used to live in its own repo, `nzimmer-apps/board-dev`, now archived.)

**On `dev`, not yet on `main`:** colour themes · repeating items ("darts every mon 7pm") · any number of warnings per event, including
custom ones ("notify 2 hours and 8 hours before") · voice notes and PDFs · a confirm step before a date found in a
screenshot, PDF, voice note or event link goes on the calendar · Archive screen · passed events offer Archive / Done /
Delete · Tags screen (rename, merge, colour, delete) · export to JSON, CSV, Markdown or .ics.

A personal capture board: send a thought from anywhere, find it later. `#tags` become categories, dates like "fri 3pm" or "due Dec 1" land on the calendar, images are read on-device (OCR) so their text is searchable, and each dated note can notify you at the time or 15m / 1h / 1d / 1w before.

| Part | Where | How it's delivered |
| --- | --- | --- |
| Web app (PWA) | `web/` (React + Vite + TS) | GitHub Pages: `/board/` from `main`, `/board/dev/` from `dev`, rebuilt on every push to either that touches `web/` |
| Android | `android/` (Capacitor 7) | `Board-android.apk` on each release. Shows up in the share sheet; local notifications |
| Windows | `src-tauri/` (Tauri 2) | `Board-windows-setup.exe` / `Board-windows.msi` on each release. Tray icon, quick-add (**Ctrl+Alt+B**, or **Ctrl+Alt+D** in Board Dev), notifications |
| Chrome/Arc extension | `extension/` (MV3, plain JS) | `Board-extension.zip` on each release |
| Database | `supabase/migrations/` | `npx supabase db push` (see [Database changes](#database-changes)) |

## Install

- **Android:** open the latest release on your phone, download `Board-android.apk` and open it. The first time, allow "install unknown apps" for your browser. Later versions install over the top.
- **Windows:** run `Board-windows-setup.exe` (or the `.msi`). It's unsigned, so SmartScreen may show "Windows protected your PC" → **More info → Run anyway**. Closing the window keeps Board in the tray.
- **Extension:** unzip `Board-extension.zip`, open `chrome://extensions` (works in Arc too), turn on Developer mode → **Load unpacked** → pick the unzipped folder.

## Writing items

- `call John fri 3pm #work` → event Friday 3 PM, category *work*
- `tax form due Dec 1` → deadline (all-day)
- `remind me tomorrow 9am pay rent` → reminder
- `buy: milk` → category *buy*
- Paste, drop or share an image → stored privately, its text read on-device and made searchable (a caption is optional)
- Shift+Enter for a new line; Enter saves

## Releases (automated)

`.github/workflows/apps.yml` runs on every push to `main` or `dev` that touches `web/`, `android/`, `src-tauri/` or `extension/` (or manually: `gh workflow run apps.yml --ref dev`). It:

1. on `dev`, switches the files to Board Dev's settings (`node scripts/use-env.mjs dev`),
2. builds the signed Android APK (skipped with a warning if the signing secrets are missing),
3. builds the Windows NSIS and MSI installers,
4. zips `extension/` into `Board-extension.zip`,
5. publishes them: `main` as release `v0.2.<run number>`, marked as latest; `dev` as pre-release `dev-v0.2.<run number + 100>`.

Every build checks that it names only its own app's database. `.github/workflows/pages.yml` deploys both web apps. `.github/workflows/ci.yml` runs the web tests, a TypeScript typecheck, the dev/prod switch check and Android/Windows compile checks on every pull request.

### Android signing

The APK is signed with a release key that's only stored in two repo secrets: `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` (key alias `board`). Keep a backup of the keystore and its password outside the repo, because without the same key, phones won't accept updates over an installed version. `.gitignore` blocks `*.jks`, `*.keystore` and `*KEYSTORE*.txt`. Never commit signing material.

## Database changes

The schema lives in `supabase/migrations/` as timestamped files (`YYYYMMDDHHMMSS_name.sql`). It has two so far: `init` (items, categories, RLS, realtime, `ping()`) and `images` (image/OCR columns, the private `images` storage bucket, `remind_offsets`).

To change the schema, add a new file and push it. Never edit an applied migration or change tables by hand in the SQL editor.

```
npx supabase login                                         # once per machine
npx supabase link --project-ref isznsbnczhpomrdvvzom       # once per folder: dev database (board-dev folder)
#   or: npx supabase link --project-ref tvgtvkzydawfyfznzvao  # live database (board folder), only when porting to prod
npx supabase migration new <description>                   # creates supabase/migrations/<timestamp>_<description>.sql
npx supabase db push
```

## Config

Public Supabase values live in `web/.env.production` and `extension/config.js` (the real Board's; `scripts/use-env.mjs` holds Board Dev's, and `npm run dev` always uses the dev database). They are safe to commit: the publishable key only works within Row Level Security, which limits every row (and every stored image) to its owner. Never commit the `sb_secret_…` key.

## Develop

```
cd web
npm install
npm run dev      # local dev server
npm test         # parser tests
npm run build    # typecheck + production build
```

See `CLAUDE.md` for build commands for the Android and Windows targets. `.github/workflows/keepalive.yml` pings both databases daily so the free projects don't pause.
