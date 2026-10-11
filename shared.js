const DEFAULT_SETTINGS = {
  preset: '5',
  customLimit: 10,
  durations: { pomodoro: 25, short: 5, long: 15 },
  cycles: 4,
  pausedUntil: 0 // 0 = active, -1 = paused until resumed, else timestamp
};
const DEFAULT_TIMER = { mode: 'pomodoro', running: false, endTime: null, remaining: 25 * 60000, cycle: 0 };
const DEFAULT_STATS = { date: '', blocked: 0, sessions: 0, minutes: 0 };

const todayKey = () => new Date().toDateString();
const effLimit = (s) => (s.preset === 'custom' ? s.customLimit : Number(s.preset));
const modeMs = (s, mode) => s.durations[mode] * 60000;

async function getAll() {
  const r = await chrome.storage.local.get(['settings', 'timer', 'stats']);
  const settings = { ...DEFAULT_SETTINGS, ...r.settings, durations: { ...DEFAULT_SETTINGS.durations, ...(r.settings && r.settings.durations) } };
  const timer = { ...DEFAULT_TIMER, ...r.timer };
  let stats = { ...DEFAULT_STATS, ...r.stats };
  if (stats.date !== todayKey()) stats = { ...DEFAULT_STATS, date: todayKey() };
  return { settings, timer, stats };
}

const isPaused = (s) => s.pausedUntil === -1 || s.pausedUntil > Date.now();
