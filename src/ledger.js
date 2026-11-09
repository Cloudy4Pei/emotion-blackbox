// 账本：只存流水，当前值每次按真实时间重放算出。
// 事件格式（存哪儿都行，数据库、JSON 文件……）：
//   { kind: 'delta' | 'release' | 'grant', slot, delta, minutes, event, turn, at }
//   turn 是这一笔属于哪一轮交互（回复的 id）；at 是 ISO 时间。
// 只存流水的好处：某条回复被删掉、重新生成，它记的那几笔用 counted() 排除就行，不用回滚数值。

const HOUR = 3600000;

export function bandOf(value, config) {
  return (config.bands.find(([min]) => value >= min) || config.bands.at(-1))[1];
}

// events 按时间先后排好；now 是要算的时刻。
// closedAt：user 在界面上提前合上的时间；viewedAt：user 最近打开查看的时间；counted(e)：这一笔还算不算。
export function computeState(events, config, { now = new Date(), closedAt = null, viewedAt = null, counted = () => true } = {}) {
  const t1 = new Date(now).getTime(), { rules, slots: defs } = config;
  const slots = Object.fromEntries(defs.map(s => [s.key, { value: 0, t: null, release: -Infinity, last: null }]));
  const half = Object.fromEntries(defs.map(s => [s.key, s.halflife * HOUR]));
  const used = new Map(), log = [];
  let grant = null;
  for (const e of events) {
    const t = Date.parse(e.at);
    if (!(t <= t1) || !counted(e)) continue;
    if (e.kind === 'grant') { grant = e; log.push({ ...e, effect: e.minutes ? 'opened' : 'closed' }); continue; }
    const s = slots[e.slot];
    if (!s) continue;
    // 半衰期：从上一笔到这一笔，按这一类自己的半衰期指数消退。
    if (s.t !== null) s.value *= 0.5 ** ((t - s.t) / half[e.slot]);
    s.t = t;
    let effect = 0;
    if (e.kind === 'delta' && e.delta > 0) {
      const before = s.value;
      s.value = Math.min(rules.max, s.value + e.delta);
      effect = s.value - before; s.last = e;
    } else if (e.kind === 'delta') {
      // 下降阻尼：同一轮同一类累计最多降 dropPerTurn，防止模型一句“算了”就把数压没。
      const key = (e.turn ?? e.at) + '/' + e.slot, room = Math.max(0, rules.dropPerTurn - (used.get(key) || 0));
      const down = Math.min(room, -e.delta, s.value);
      used.set(key, (used.get(key) || 0) + down); s.value -= down; effect = -down;
    } else if (e.kind === 'release') {
      if (t - s.release < rules.releaseGapHours * HOUR) { log.push({ ...e, effect: 'too_soon' }); continue; }
      effect = -s.value * (1 - rules.releaseFactor); s.value *= rules.releaseFactor; s.release = t;
    }
    log.push({ ...e, effect: Math.round(effect) });
  }
  for (const [key, s] of Object.entries(slots)) if (s.t !== null) s.value *= 0.5 ** ((t1 - s.t) / half[key]);
  const expires = grant?.minutes ? Date.parse(grant.at) + grant.minutes * 60000 : 0;
  const open = expires > t1 && !(closedAt && Date.parse(closedAt) >= Date.parse(grant.at));
  return {
    at: new Date(t1).toISOString(),
    slots: defs.map(({ key, name, halflife }) => {
      const s = slots[key], value = Math.round(s.value);
      return {
        key, name, halflife, value, band: bandOf(value, config),
        last: s.last && { event: s.last.event, delta: s.last.delta, at: s.last.at },
        lastRelease: Number.isFinite(s.release) ? new Date(s.release).toISOString() : null,
      };
    }),
    events: log,
    grant: open ? {
      expiresAt: new Date(expires).toISOString(),
      viewedAt: viewedAt && Date.parse(viewedAt) >= Date.parse(grant.at) ? viewedAt : null,
    } : null,
  };
}

// 把一轮解析出的条目变成要存的事件。错误条目不存，单独返回，下一轮注入时告诉模型。
export function toEvents(items, { turn, at = new Date() } = {}) {
  const time = new Date(at).toISOString(), events = [], errors = [];
  for (const t of items) {
    if (t.error) errors.push(t.error);
    else events.push({ kind: t.kind, slot: t.slot ?? null, delta: t.delta ?? null, minutes: t.minutes ?? null, event: t.event || '', turn: turn ?? null, at: time });
  }
  return { events, errors };
}
