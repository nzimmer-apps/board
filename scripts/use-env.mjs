#!/usr/bin/env node
// Switches this checkout between the real Board (prod) and Board Dev.
//
// The files in git always hold the prod values. The `dev` branch's builds run `node scripts/use-env.mjs dev`
// first, which swaps in the dev database, app names, app ids, hotkey and site address. Board Dev then installs
// next to the real Board and never touches its data.
//
//   node scripts/use-env.mjs dev | prod        rewrite the files below for that environment (safe to repeat)
//   node scripts/use-env.mjs check dev|prod DIR...
//                                              fail if built files in DIR point at the other environment's database
//
// Locally, `npm run dev` already uses the dev database (web/.env.development) on every branch.
// Each entry is [file, prod text, dev text]; the script stops if it finds neither, so a moved line can't slip by.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DB = {
  prod: { ref: 'tvgtvkzydawfyfznzvao', key: 'sb_publishable_IyFenIjS86BS-8NVlqL4AQ_AJCqPVm_' },
  dev: { ref: 'isznsbnczhpomrdvvzom', key: 'sb_publishable_Qbk37mJeeuZawXQeIe9Eng_asQ2SsoE' },
};
const SITE = { prod: 'https://nzimmer-apps.github.io/board/', dev: 'https://nzimmer-apps.github.io/board/dev/' };

const SWAPS = [
  // Web app (also bundled into the Android and Windows apps)
  ['web/.env.production', `https://${DB.prod.ref}.supabase.co`, `https://${DB.dev.ref}.supabase.co`],
  ['web/.env.production', DB.prod.key, DB.dev.key],
  ['web/.env.production', 'VITE_APP_NAME="Board"', 'VITE_APP_NAME="Board Dev"'],
  ['web/.env.production', 'VITE_HOTKEY=CommandOrControl+Alt+B', 'VITE_HOTKEY=CommandOrControl+Alt+D'],
  ['web/.env.production', `VITE_SITE_URL=${SITE.prod}\n`, `VITE_SITE_URL=${SITE.dev}\n`],
  ['web/public/manifest.webmanifest', '"name": "Board",', '"name": "Board Dev",'],
  ['web/public/manifest.webmanifest', '"short_name": "Board",', '"short_name": "Board Dev",'],
  // Android
  ['web/capacitor.config.json', '"appId": "com.nzimmerapps.board",', '"appId": "com.nzimmerapps.board.dev",'],
  ['web/capacitor.config.json', '"appName": "Board",', '"appName": "Board Dev",'],
  ['android/app/build.gradle', 'applicationId "com.nzimmerapps.board"', 'applicationId "com.nzimmerapps.board.dev"'],
  ['android/app/src/main/res/values/strings.xml', '<string name="app_name">Board</string>', '<string name="app_name">Board Dev</string>'],
  ['android/app/src/main/res/values/strings.xml', '<string name="title_activity_main">Board</string>', '<string name="title_activity_main">Board Dev</string>'],
  ['android/app/src/main/res/values/strings.xml', '<string name="package_name">com.nzimmerapps.board</string>', '<string name="package_name">com.nzimmerapps.board.dev</string>'],
  ['android/app/src/main/res/values/strings.xml', '<string name="custom_url_scheme">com.nzimmerapps.board</string>', '<string name="custom_url_scheme">com.nzimmerapps.board.dev</string>'],
  // Windows
  ['src-tauri/tauri.conf.json', '"productName": "Board",', '"productName": "Board Dev",'],
  ['src-tauri/tauri.conf.json', '"identifier": "com.nzimmerapps.board",', '"identifier": "com.nzimmerapps.board.dev",'],
  ['src-tauri/tauri.conf.json', '"title": "Board",', '"title": "Board Dev",'],
  ['src-tauri/src/lib.rs', '"Open Board",', '"Open Board Dev",'],
  ['src-tauri/src/lib.rs', '.tooltip("Board (Ctrl+Alt+B)")', '.tooltip("Board Dev (Ctrl+Alt+D)")'],
  // Chrome/Arc extension
  ['extension/config.js', `url: 'https://${DB.prod.ref}.supabase.co',`, `url: 'https://${DB.dev.ref}.supabase.co',`],
  ['extension/config.js', `key: '${DB.prod.key}',`, `key: '${DB.dev.key}',`],
  ['extension/config.js', `appUrl: '${SITE.prod}',`, `appUrl: '${SITE.dev}',`],
  ['extension/config.js', 'Row Level Security.\nconst BOARD_CONFIG', 'Row Level Security.\n// This is the DEV build: it talks to the board-dev database, not your real Board.\nconst BOARD_CONFIG'],
  ['extension/manifest.json', '"name": "Board — quick capture",', '"name": "Board Dev — quick capture",'],
  ['extension/manifest.json', 'events to your Board.",', 'events to your Board (dev build).",'],
];

// A pair where one side contains the other would look "already set" in both directions.
for (const [file, prod, dev] of SWAPS)
  if (prod.includes(dev) || dev.includes(prod)) throw new Error(`use-env: ${file}: "${prod}" and "${dev}" overlap; make them whole lines`);

function use(env) {
  const other = env === 'dev' ? 'prod' : 'dev';
  const files = new Map();
  for (const [file, ...vals] of SWAPS) {
    const text = { prod: vals[0], dev: vals[1] };
    if (!files.has(file)) {
      const raw = readFileSync(join(ROOT, file), 'utf8');
      files.set(file, { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n'), changed: false });
    }
    const f = files.get(file);
    if (f.text.includes(text[env])) continue; // already set
    const n = f.text.split(text[other]).length - 1;
    if (n !== 1) throw new Error(`${file}: expected "${text[other]}" once, found it ${n} times`);
    f.text = f.text.replace(text[other], text[env]);
    f.changed = true;
  }
  for (const [file, f] of files) if (f.changed) writeFileSync(join(ROOT, file), f.crlf ? f.text.replace(/\n/g, '\r\n') : f.text);
  console.log(`Using ${env === 'dev' ? 'Board Dev (dev database)' : 'Board (live database)'}: ${[...files].filter(([, f]) => f.changed).length} file(s) changed.`);
}

/** Every built file must name this environment's database and never the other one's. */
function check(env, dirs) {
  const other = env === 'dev' ? 'prod' : 'dev';
  let seen = false;
  const walk = (p) => {
    if (statSync(p).isDirectory()) return readdirSync(p).forEach((n) => walk(join(p, n)));
    if (!/\.(js|mjs|html|json|txt|map)$/.test(p)) return;
    const s = readFileSync(p, 'utf8');
    if (s.includes(DB[other].ref) || s.includes(DB[other].key)) throw new Error(`${p} points at the ${other} database`);
    if (s.includes(DB[env].ref)) seen = true;
  };
  dirs.forEach((d) => walk(d));
  if (!seen) throw new Error(`no built file in ${dirs.join(', ')} points at the ${env} database`);
  console.log(`Checked: ${dirs.join(', ')} use the ${env} database only.`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'dev' || cmd === 'prod') use(cmd);
  else if (cmd === 'check' && (rest[0] === 'dev' || rest[0] === 'prod') && rest.length > 1) check(rest[0], rest.slice(1));
  else throw new Error('usage: node scripts/use-env.mjs dev|prod  |  node scripts/use-env.mjs check dev|prod DIR...');
} catch (e) {
  console.error(`use-env: ${e.message}`);
  process.exit(1);
}
