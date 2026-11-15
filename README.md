# Board

A personal capture board: send a thought from anywhere, find it later. `#tags` become categories and dates like "fri 3pm" or "due Dec 1" land on the calendar.

| Part | Where | How it's delivered |
| --- | --- | --- |
| Web app (PWA) | `web/` | GitHub Pages, deployed on every push to `main` |
| Android | `android/` (Capacitor) | `Board-android.apk` on the [latest release](https://github.com/nzimmer-apps/board/releases/latest) |
| Windows | `src-tauri/` (Tauri) | `Board-windows-setup.exe` / `Board-windows.msi` on the latest release |
| Chrome extension | `extension/` | `Board-extension.zip` on the latest release → unzip → `chrome://extensions` → Developer mode → **Load unpacked** |
| Database | `supabase/migrations/` | `npx supabase db push` (see CLAUDE.md) |

## Writing items

- `call John fri 3pm #work` → event Friday 3 PM, category *work*
- `tax form due Dec 1` → deadline (all-day)
- `remind me tomorrow 9am pay rent` → reminder
- `buy: milk` → category *buy*
- Shift+Enter for a new line; Enter saves

## Config

Public Supabase values live in `web/.env.production` and `extension/config.js`. They are safe to commit: the publishable key only works within Row Level Security, which limits every row to its owner. Never commit the `sb_secret_…` key.

## Develop

```
cd web && npm install && npm run dev   # npm test runs the parser tests
```

`.github/workflows/keepalive.yml` pings the database daily so the free project doesn't pause.
