// 每轮注入给模型的状态栏，以及“反应档位”的挑选。

const HOUR = 3600000;
const ago = (iso, now) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return m < 60 ? `${m || 1}分钟前` : m < 2880 ? `${Math.round(m / 60)}小时前` : `${Math.round(m / 1440)}天前`;
};
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 档位文本每行一条：「类别 数值：反应」。每类只带上当前达到的最高一档；
// 不带类别的行每次都带上；# 开头的是写给人看的说明，不发给模型。
export function pickLevels(text, slots) {
  const pattern = new RegExp(`^(${slots.map(s => escape(s.name)).join('|')})\\s*(\\d{1,3})\\s*[:：]\\s*(.+)$`);
  const general = [], best = {};
  for (const line of String(text || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))) {
    const m = line.match(pattern);
    if (!m) { general.push(line); continue; }
    const slot = slots.find(s => s.name === m[1]), min = Number(m[2]);
    if (slot && slot.value >= min && (!best[m[1]] || best[m[1]].min < min)) best[m[1]] = { min, text: m[3] };
  }
  return [...general, ...slots.filter(s => best[s.name]).map(s => `${s.name} ${best[s.name].min}+：${best[s.name].text}`)];
}

// state 来自 computeState；levels 是档位文本；lastErrors 是上一轮没生效的标签错误。
export function buildContext(state, config, { levels = '', lastErrors = [] } = {}) {
  const now = Date.parse(state.at), { marks, names, rules } = config, user = names.user;
  const lines = state.slots.map(s => `${s.name} ${s.value} · ${s.band}${s.value && s.last ? `（最近一笔：${s.last.event}，${ago(s.last.at, now)} ${s.last.delta > 0 ? '+' : ''}${s.last.delta}）` : ''}`);
  const look = state.grant
    ? `${user}现在能看你的黑箱，还剩${Math.max(1, Math.round((Date.parse(state.grant.expiresAt) - now) / 60000))}分钟${state.grant.viewedAt ? `，${ago(state.grant.viewedAt, now)}打开看过` : '，还没打开'}。`
    : `${user}现在看不到这里。`;
  const name = key => config.slots.find(s => s.key === key)?.name || key;
  const skipped = state.events
    .filter(e => e.effect === 'too_soon' && now - Date.parse(e.at) < rules.recentHours * HOUR)
    .map(e => `${name(e.slot)}的宣泄离上次不到${rules.releaseGapHours}小时，没算`);
  const problems = [...lastErrors, ...skipped];
  const picked = pickLevels(levels, state.slots);
  return [
    marks.open, look, ...lines,
    ...(problems.length ? ['上次没生效：' + problems.join('；')] : []),
    ...(picked.length ? ['你给自己定的反应：', ...picked] : []),
    marks.close,
  ].join('\n');
}
