importScripts('config.js', 'parse.js', 'api.js');

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'sel', title: 'Send "%s" to Board', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'link', title: 'Send link to Board', contexts: ['link'] });
  chrome.contextMenus.create({ id: 'page', title: 'Send this page to Board', contexts: ['page'] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
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
