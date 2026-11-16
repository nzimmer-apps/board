# Board Dev

> Development copy of [Board](https://github.com/nzimmer-apps/board). Separate database, separate app ids, separate
> site (https://nzimmer-apps.github.io/board-dev/), so it installs next to the real app. New features land here first.

**New here:** colour themes · repeating items ("darts every mon 7pm") · any number of warnings per event, including
custom ones ("notify 2 hours and 8 hours before") · voice notes and PDFs · a confirm step before a date found in a
screenshot, PDF, voice note or event link goes on the calendar · Archive screen · passed events offer Archive / Done /
Delete · Tags screen (rename, merge, colour, delete) · export to JSON, CSV, Markdown or .ics.

A personal capture board: send a thought from anywhere, find it later. `#tags` become categories, dates like "fri 3pm" or "due Dec 1" land on the calendar, images are read on-device (OCR) so their text is searchable, and each dated note can notify you at the time or 15m / 1h / 1d / 1w before.

| Part | Where | How it's delivered |
| --- | --- | --- |
| Web app (PWA) | `web/` (React + Vite + TS) | GitHub Pages, https://nzimmer-apps.github.io/board-dev/, deployed on every push to `main` that touches `web/` |
| Android | `android/` (Capacitor 7) | `Board-android.apk` on the [latest release](https://github.com/nzimmer-apps/board-dev/releases/latest). Shows up in the share sheet; local notifications |
| Windows | `src-tauri/` (Tauri 2) | `Board-windows-setup.exe` / `Board-windows.msi` on the latest release. Tray icon, **Ctrl+Alt+D** quick-add, notifications |
| Chrome/Arc extension | `extension/` (MV3, plain JS) | `Board-extension.zip` on the latest release |
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

`.github/workflows/apps.yml` runs on every push to `main` that touches `web/`, `android/`, `src-tauri/` or `extension/` (or manually: `gh workflow run apps.yml`). It:

1. builds the signed Android APK (skipped with a warning if the signing secrets are missing),
2. builds the Windows NSIS and MSI installers,
3. zips `extension/` into `Board-extension.zip`,
4. publishes all of them as GitHub release `v0.2.<run number>`, marked as latest.

`.github/workflows/pages.yml` deploys the web app. `.github/workflows/ci.yml` runs the web tests and a TypeScript typecheck on every pull request.

### Android signing

The APK is signed with a release key that's only stored in two repo secrets: `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` (key alias `board`). Keep a backup of the keystore and its password outside the repo, because without the same key, phones won't accept updates over an installed version. `.gitignore` blocks `*.jks`, `*.keystore` and `*KEYSTORE*.txt`. Never commit signing material.

## Database changes

The schema lives in `supabase/migrations/` as timestamped files (`YYYYMMDDHHMMSS_name.sql`). It has two so far: `init` (items, categories, RLS, realtime, `ping()`) and `images` (image/OCR columns, the private `images` storage bucket, `remind_offsets`).

To change the schema, add a new file and push it. Never edit an applied migration or change tables by hand in the SQL editor.

```
npx supabase login                                         # once per machine
npx supabase link --project-ref isznsbnczhpomrdvvzom       # once per clone
npx supabase migration new <description>                   # creates supabase/migrations/<timestamp>_<description>.sql
npx supabase db push
```

## Config

Public Supabase values live in `web/.env.production` and `extension/config.js`. They are safe to commit: the publishable key only works within Row Level Security, which limits every row (and every stored image) to its owner. Never commit the `sb_secret_…` key.

## Develop

```
cd web
npm install
npm run dev      # local dev server
npm test         # parser tests
npm run build    # typecheck + production build
```

See `CLAUDE.md` for build commands for the Android and Windows targets. `.github/workflows/keepalive.yml` pings the database daily so the free project doesn't pause.
