importScripts('config.js', 'parse.js', 'api.js');

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'sel', title: 'Send "%s" to Board', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'link', title: 'Send link to Board', contexts: ['link'] });
  chrome.contextMenus.create({ id: 'page', title: 'Send this page to Board', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'event', title: 'Add this event to Board calendar', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'img', title: 'Send image to Board', contexts: ['image'] });
});

// Runs inside the page the user is looking at (so it also works on pages that need their login, like
// Facebook events): reads the event's name, start and place from structured data, plus some visible text.
function boardReadEvent() {
  const isEv = (t) => (Array.isArray(t) ? t.some(isEv) : typeof t === 'string' && /(Event|Festival)$/.test(t));
  const find = (n, d = 0) => {
    if (!n || typeof n !== 'object' || d > 6) return null;
    if (Array.isArray(n)) { for (const x of n) { const e = find(x, d + 1); if (e) return e; } return null; }
    if (isEv(n['@type']) && n.startDate) return n;
    for (const k of ['@graph', 'mainEntity', 'subjectOf', 'about', 'event', 'events']) { const e = find(n[k], d + 1); if (e) return e; }
    return null;
  };
  const og = (p) => document.querySelector(`meta[property="${p}"]`)?.content || '';
  const out = { url: location.href, title: og('og:title') || document.title, description: og('og:description'), event: null, text: '' };
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const e = find(JSON.parse(s.textContent));
      if (!e) continue;
      const loc = Array.isArray(e.location) ? e.location[0] : e.location;
      const a = loc && loc.address;
      const addr = typeof a === 'string' ? a : a ? [a.streetAddress, a.addressLocality, a.addressRegion].filter(Boolean).join(', ') : '';
      out.event = {
        name: typeof e.name === 'string' ? e.name : null,
        start: String(e.startDate),
        location: typeof loc === 'string' ? loc : loc ? [loc.name, addr !== loc.name ? addr : ''].filter(Boolean).join(', ') : null,
      };
      break;
    } catch (_) { /* not JSON */ }
  }
  out.text = ((document.querySelector('[role="main"]') || document.body).innerText || '').slice(0, 2000);
  return out;
}

async function addEventFromTab(tab) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: boardReadEvent });
  let when = null;
  if (result.event) {
    const s = result.event.start.trim();
    const day = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (day) when = { due_at: new Date(+day[1], +day[2] - 1, +day[3], 9).toISOString(), all_day: true };
    else if (!Number.isNaN(new Date(s).getTime())) when = { due_at: new Date(s).toISOString(), all_day: false };
  }
  // No structured data (Facebook): the date is in the visible text, e.g. "Saturday, December 5, 2026 at 7 PM".
  when ??= BoardParse.findEventDate(`${result.title}\n${result.description}\n${result.text}`);
  const title = (result.event?.name || result.title || 'Event').replace(/\s+[|·–-]\s+(Facebook|Eventbrite|Meetup)\s*$/i, '').trim();
  await api.insert({
    body: `${title}\n${result.url}`,
    url: result.url,
    tags: ['event'],
    due_at: when?.due_at ?? null,
    all_day: when?.all_day ?? false,
    kind: when ? 'event' : null,
    location: result.event?.location || null,
    remind_offsets: [60, 1440],
    source: 'extension',
  });
  return { title, when };
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'img') {
    try { await api.addImage(info.srcUrl, tab?.url ?? ''); notify('Image saved to Board', 'Text in it will be read next time Board is open.'); }
    catch (e) { notify('Image not saved', e.message); }
    return;
  }
  if (info.menuItemId === 'event') {
    try {
      const { title, when } = await addEventFromTab(tab);
      notify(
        when ? 'Added to Board calendar' : 'Saved to Board (no date found)',
        when
          ? `${title} · ${new Date(when.due_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', ...(when.all_day ? {} : { hour: 'numeric', minute: '2-digit' }) })}. Warnings: 1 hr and 1 day before. Edit it in Board.`
          : `${title}. Open Board to set the date.`,
      );
    } catch (e) { notify('Not saved', e.message); }
    return;
  }
  let text;
  if (info.menuItemId === 'sel') text = `${info.selectionText}\n${tab?.url ?? ''}`;
  else if (info.menuItemId === 'link') text = info.linkUrl;
  else text = `${tab?.title ?? ''}\n${tab?.url ?? ''}`;
  try {
    const p = await api.add(text.trim());
    notify('Saved to Board', p.tags.length ? `#${p.tags.join(' #')}` : p.body.slice(0, 80));
  } catch (e) {
    notify('Not saved', e.message);
  }
});

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icon-128.png', title, message: message || ' ' });
}
