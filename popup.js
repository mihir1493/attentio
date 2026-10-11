const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const PRESETS = [{ v: 3, name: 'Minimal' }, { v: 5, name: 'Focused' }, { v: 8, name: 'Balanced' }, { v: 12, name: 'Research' }];
const INFO = {
  3: ['3 tabs is <b>ultra-minimal</b>', 'Maximum simplicity: one task and almost no distractions.'],
  5: ['5 tabs is great for <b>deep work</b>', 'Helps reduce context switching and keeps your attention on what matters.'],
  8: ['8 tabs keeps things <b>balanced</b>', 'Enough room for a main task plus a few references.'],
  12: ['12 tabs suits <b>research</b>', 'Space for sources and notes while you stay in control.']
};
const MODE_LABEL = { pomodoro: 'FOCUS', short: 'SHORT BREAK', long: 'LONG BREAK' };
const CIRC = 2 * Math.PI * 88;

let S = { settings: null, timer: null, stats: null };
let view = 'limit';
let completing = false;

const send = (action, extra = {}) => chrome.runtime.sendMessage({ action, ...extra });
const saveSettings = async () => { await chrome.storage.local.set({ settings: S.settings }); send('applySettings'); };

function showView(v) {
  view = v;
  $('#app').classList.toggle('timer-mode', v === 'timer' || v === 'settings');
  $$('.view').forEach((el) => el.classList.toggle('hidden', el.id !== 'view-' + v));
  $('#nav').classList.toggle('hidden', v !== 'limit' && v !== 'timer');
  $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  render();
}

const posAt = (pct) => `calc(${pct}% + ${11 - pct * 0.22}px)`;
$('#ticks').innerHTML = [3, 5, 8, 12, 20].map((n) => `<span style="left:${posAt(((n - 3) / 17) * 100)}">${n}</span>`).join('');

function renderLimit() {
  const s = S.settings;
  $('#presets').innerHTML = PRESETS.map((p) => `<button class="preset ${s.preset === String(p.v) ? 'sel' : ''}" data-v="${p.v}">
    <span class="check"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></span><b>${p.v}</b><span>${p.name}</span></button>`).join('') +
    `<button class="preset ${s.preset === 'custom' ? 'sel' : ''}" data-v="custom"><span class="check"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></span>
    <svg viewBox="0 0 24 24"><path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/></svg><span>Custom</span></button>`;
  const lim = effLimit(s);
  const info = s.preset === 'custom' || !INFO[lim] ? [`${lim} tabs, <b>your way</b>`, 'A personal limit that fits how you work.'] : INFO[lim];
  $('#info-title').innerHTML = info[0];
  $('#info-text').textContent = info[1];
  const v = s.customLimit;
  const pct = ((v - 3) / 17) * 100;
  const slider = $('#slider');
  slider.value = v;
  slider.style.setProperty('--fill', posAt(pct));
  $('#bubble').textContent = v;
  $('#bubble').style.left = posAt(pct);
  if (document.activeElement !== $('#custom-num')) $('#custom-num').value = v;
}

const fmt = (ms) => {
  const t = Math.ceil(Math.max(0, ms) / 1000);
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};

function renderTimer() {
  const { settings: s, timer: t } = S;
  const rem = t.running ? t.endTime - Date.now() : t.remaining;
  const total = modeMs(s, t.mode);
  $('#time').textContent = fmt(rem);
  $('#mode-label').textContent = MODE_LABEL[t.mode];
  $('#prog').style.strokeDasharray = `${Math.max(0.001, Math.min(1, rem / total)) * CIRC} ${CIRC}`;
  $$('#pills button').forEach((b) => b.classList.toggle('active', b.dataset.mode === t.mode));
  $('#meta').innerHTML = `${s.durations.pomodoro} min focus &nbsp;•&nbsp; ${s.durations.short} min break &nbsp;•&nbsp; ${s.cycles} cycles <span title="${t.cycle} of ${s.cycles} focus sessions done before the long break">ⓘ</span>`;
  $('#play-ico').innerHTML = t.running ? '<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor"/>' : '<path d="M8 5v14l11-7z" fill="currentColor"/>';
  $('#play').title = t.running ? 'Pause' : 'Start';
  if (t.running && rem <= 0 && !completing) { completing = true; send('complete').then(() => (completing = false)); }
}

async function renderStats() {
  $('#st-sessions').textContent = S.stats.sessions;
  $('#st-minutes').textContent = S.stats.minutes;
  $('#st-blocked').textContent = S.stats.blocked;
  $('#st-open').textContent = (await chrome.tabs.query({ windowType: 'normal' })).length;
}

function renderPause() {
  const s = S.settings, paused = isPaused(s);
  $('#pause-chips').classList.toggle('hidden', paused);
  $('#pause-resume').classList.toggle('hidden', !paused);
  $('#pause-sub').textContent = !paused ? 'Pause the tab limit for a while.'
    : s.pausedUntil === -1 ? 'Paused until you resume.'
    : 'Paused until ' + new Date(s.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function renderSettings() {
  renderPause();
  const d = S.settings.durations;
  for (const [id, val] of [['pomodoro', d.pomodoro], ['short', d.short], ['long', d.long], ['cycles', S.settings.cycles]]) {
    const el = $('#set-' + id);
    if (document.activeElement !== el) el.value = val;
  }
}

function render() {
  if (!S.settings) return;
  const paused = isPaused(S.settings);
  $('#tagline').textContent = paused ? 'Paused · tab limit is off' : 'Fewer tabs. More clarity.';
  $('#tagline').classList.toggle('paused', paused);
  if (view === 'limit') renderLimit();
  if (view === 'timer') renderTimer();
  if (view === 'stats') renderStats();
  if (view === 'settings') renderSettings();
}

async function reload() { S = await getAll(); render(); }

/* events */
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showView(b.dataset.view); });
$('#btn-stats').onclick = () => showView('stats');
$('#btn-settings').onclick = () => showView('settings');
$('#btn-close').onclick = () => window.close();
$$('[data-back]').forEach((b) => (b.onclick = () => showView('limit')));

$('#presets').addEventListener('click', (e) => {
  const b = e.target.closest('.preset'); if (!b) return;
  S.settings.preset = b.dataset.v; saveSettings(); render();
});
const setCustom = (v) => {
  v = Math.min(20, Math.max(3, Math.round(Number(v)) || 3));
  S.settings.customLimit = v; S.settings.preset = 'custom'; saveSettings(); render();
};
$('#slider').oninput = (e) => setCustom(e.target.value);
$('#custom-num').oninput = (e) => { if (e.target.value !== '') setCustom(e.target.value); };
$('#num-up').onclick = () => setCustom(S.settings.customLimit + 1);
$('#num-down').onclick = () => setCustom(S.settings.customLimit - 1);
$('#pause-chips').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const m = Number(b.dataset.min);
  S.settings.pausedUntil = m === -1 ? -1 : Date.now() + m * 60000;
  saveSettings(); render();
});
$('#pause-resume').onclick = () => { S.settings.pausedUntil = 0; saveSettings(); render(); };
$('#custom-num').onblur = () => render();

$('#pills').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) send('setMode', { mode: b.dataset.mode }); });
$('#play').onclick = () => send(S.timer.running ? 'pause' : 'start');
$('#reset').onclick = () => send('reset');
$('#skip').onclick = () => send('skip');

for (const id of ['pomodoro', 'short', 'long']) {
  $('#set-' + id).onchange = (e) => { S.settings.durations[id] = Math.max(1, Math.min(120, Number(e.target.value) || 1)); saveSettings(); };
}
$('#set-cycles').onchange = (e) => { S.settings.cycles = Math.max(1, Math.min(10, Number(e.target.value) || 1)); saveSettings(); };

chrome.storage.onChanged.addListener(reload);
setInterval(() => { if (view === 'timer' && S.timer) renderTimer(); }, 250);
reload();
