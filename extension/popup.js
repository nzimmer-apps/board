const $ = (id) => document.getElementById(id);
const msg = (t, err) => { $('msg').textContent = t; $('msg').className = err ? 'err' : ''; };
$('open').href = BOARD_CONFIG.appUrl;

async function show() {
  const s = await api.session();
  $('login').hidden = !!s;
  $('main').hidden = !s;
  if (s) $('text').focus(); else $('email').focus();
}

$('signin').onclick = async () => {
  try { await api.signIn($('email').value.trim(), $('password').value); msg(''); show(); }
  catch (e) { msg(e.message, true); }
};
$('password').onkeydown = (e) => { if (e.key === 'Enter') $('signin').click(); };
$('signout').onclick = async (e) => { e.preventDefault(); await api.signOut(); show(); };

$('save').onclick = async () => {
  let text = $('text').value.trim();
  if ($('withpage').checked) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) text = `${text}\n${tab.url}`.trim();
  }
  if (!text) return;
  $('save').disabled = true;
  try {
    const p = await api.add(text);
    $('text').value = '';
    msg(`Saved${p.tags.length ? ' to #' + p.tags.join(' #') : ''}${p.due_at ? ' · ' + new Date(p.due_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}`);
    setTimeout(() => window.close(), 900);
  } catch (e) { msg(e.message, true); }
  $('save').disabled = false;
};
$('text').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('save').click(); };
show();
