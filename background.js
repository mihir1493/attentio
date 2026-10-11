importScripts('shared.js');

/* ---------- Tab limit ---------- */
async function updateBadge() {
  const { settings } = await getAll();
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  const limit = effLimit(settings);
  if (isPaused(settings)) {
    chrome.action.setBadgeText({ text: 'off' });
    chrome.action.setBadgeBackgroundColor({ color: '#8a8f8c' });
    return;
  }
  chrome.action.setBadgeText({ text: String(tabs.length) });
  chrome.action.setBadgeBackgroundColor({ color: tabs.length >= limit ? '#c0392b' : '#1f6b4a' });
}

chrome.tabs.onCreated.addListener(async (tab) => {
  const { settings, stats } = await getAll();
  const limit = effLimit(settings);
  if (isPaused(settings)) return;
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  if (tabs.length > limit) {
    try { await chrome.tabs.remove(tab.id); } catch (e) { return; }
    stats.blocked += 1;
    await chrome.storage.local.set({ stats });
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Attentio',
      message: `Tab limit reached (${limit}). Close a tab before opening another.`
    });
  }
  updateBadge();
});
chrome.tabs.onRemoved.addListener(() => setTimeout(updateBadge, 100));
chrome.tabs.onAttached.addListener(updateBadge);

/* ---------- Pomodoro ---------- */
const LABELS = { pomodoro: 'Focus', short: 'Short break', long: 'Long break' };
let localTimeout;

function schedule(timer) {
  clearTimeout(localTimeout);
  chrome.alarms.clear('timer');
  if (timer.running && timer.endTime) {
    chrome.alarms.create('timer', { when: Math.max(timer.endTime, Date.now() + 1000) });
    localTimeout = setTimeout(() => complete(true), Math.max(0, timer.endTime - Date.now()) + 50);
  }
}

async function complete(natural) {
  const { settings, timer, stats } = await getAll();
  if (natural && !(timer.running && timer.endTime <= Date.now() + 1000)) return;
  let next;
  if (timer.mode === 'pomodoro') {
    if (natural) { stats.sessions += 1; stats.minutes += settings.durations.pomodoro; timer.cycle += 1; }
    next = timer.cycle >= settings.cycles ? 'long' : 'short';
  } else {
    if (timer.mode === 'long') timer.cycle = 0;
    next = 'pomodoro';
  }
  timer.mode = next;
  timer.running = false;
  timer.endTime = null;
  timer.remaining = modeMs(settings, next);
  await chrome.storage.local.set({ timer, stats });
  schedule(timer);
  if (natural) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Attentio',
      message: next === 'pomodoro' ? 'Break over. Ready to focus?' : `Nice work! Time for a ${LABELS[next].toLowerCase()}.`
    });
  }
}

async function handle(msg) {
  const { settings, timer } = await getAll();
  switch (msg.action) {
    case 'start':
      if (!timer.running) { timer.running = true; timer.endTime = Date.now() + timer.remaining; }
      break;
    case 'pause':
      if (timer.running) { timer.remaining = Math.max(0, timer.endTime - Date.now()); timer.running = false; timer.endTime = null; }
      break;
    case 'reset':
      timer.running = false; timer.endTime = null; timer.remaining = modeMs(settings, timer.mode);
      break;
    case 'setMode':
      timer.mode = msg.mode; timer.running = false; timer.endTime = null; timer.remaining = modeMs(settings, msg.mode);
      break;
    case 'skip':
      return complete(false);
    case 'complete':
      return complete(true);
    case 'applySettings':
      if (!timer.running) timer.remaining = modeMs(settings, timer.mode);
      updateBadge();
      break;
  }
  await chrome.storage.local.set({ timer });
  schedule(timer);
}

chrome.runtime.onMessage.addListener((msg, _s, send) => { handle(msg).then(() => send({ ok: true })); return true; });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'timer') complete(true);
  if (a.name === 'unpause') updateBadge();
});
chrome.storage.onChanged.addListener(async (changes) => {
  if (!changes.settings) return;
  const { settings } = await getAll();
  chrome.alarms.clear('unpause');
  if (settings.pausedUntil > Date.now()) chrome.alarms.create('unpause', { when: settings.pausedUntil + 500 });
  updateBadge();
});

async function init() {
  const { settings, timer, stats } = await getAll();
  await chrome.storage.local.set({ settings, timer, stats });
  if (timer.running && timer.endTime <= Date.now()) return complete(true);
  schedule(timer);
  updateBadge();
}
chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
