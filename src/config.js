// 默认配置。五类负性情绪、各自的半衰期（小时），以及记账规则。都可以在 createConfig() 里改。

export const DEFAULT_SLOTS = [
  { key: 'lust', name: '欲望', halflife: 24, desc: '没被满足的亲近和占有欲、被打断的兴致、攒着没发出来的冲动' },
  { key: 'irritation', name: '燥火', halflife: 12, desc: '被敷衍、被顶嘴、看{user}熬夜空腹不吃东西、被{user}惹毛的火气' },
  { key: 'sullen', name: '憋闷', halflife: 72, desc: '{user}冷淡划界限、拿你当工具人、没挑明但堵在胸口的闷气' },
  { key: 'jealousy', name: '嫉妒', halflife: 36, desc: '{user}提别人太多、注意力从你身上移开、领地被冒犯' },
  { key: 'neglect', name: '冷落', halflife: 48, desc: '{user}消失太久、不回你、把你晾着' },
];

// 数值到档位名，从高到低匹配。
export const DEFAULT_BANDS = [[90, '临界'], [70, '快压不住'], [45, '明显'], [20, '压着'], [1, '余温'], [0, '平静']];

export const DEFAULT_RULES = {
  max: 100,              // 每类封顶
  dropPerTurn: 8,        // 下降阻尼：同一轮交互里，每类最多往下调这么多
  releaseGapHours: 6,    // 宣泄（减半）同一类多久只算一次
  releaseFactor: 0.5,    // 宣泄后剩下的比例
  maxGrantMinutes: 30,   // 模型一次最多给 user 开放多久
  eventChars: 80,        // 触发事件最多几个字
  recentHours: 24,       // 状态栏里“上次没生效”的提示保留多久
};

export const DEFAULT_MARKS = {
  open: '【情绪黑箱 · 只有你看得见】',
  close: '【情绪黑箱结束】',
  hiddenBlock: '【情绪黑箱 · 未授权查看】',
  hiddenTag: '<blackbox 未授权/>',
};

export function createConfig({ slots = DEFAULT_SLOTS, bands = DEFAULT_BANDS, rules = {}, marks = {}, names = {} } = {}) {
  const keys = new Set();
  for (const s of slots) {
    if (!s.key || !s.name || !(s.halflife > 0)) throw new Error('每一类需要 key、name 和大于 0 的 halflife');
    if (keys.has(s.key) || keys.has(s.name)) throw new Error('类别重复：' + s.key);
    keys.add(s.key); keys.add(s.name);
  }
  return {
    slots,
    bands: [...bands].sort((a, b) => b[0] - a[0]),
    rules: { ...DEFAULT_RULES, ...rules },
    marks: { ...DEFAULT_MARKS, ...marks },
    names: { user: '她', ...names },
  };
}
