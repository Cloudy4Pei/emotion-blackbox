// 用虚构的几轮对话跑一遍：解析标签 → 存流水 → 重放算状态 → 生成注入 → 遮挡。
// 不联网，不调用模型。回复是写死的，模拟模型在回复末尾写下的标签。
import { createConfig, parseTags, toEvents, computeState, buildContext, buildRule, createRedactor } from '../src/index.js';

const config = createConfig({ names: { user: '她' } });
// 档位只是演示格式；真正的内容请让你的角色自己写（模板见 levels.example.txt）。
const levels = [
  '燥火 30：（燥火到 30 以上时的样子）',
  '燥火 60：（燥火到 60 以上时的样子）',
  '憋闷 30：（憋闷到 30 以上时的样子）',
  '不在台词里直接报数值或提黑箱机制。',
].join('\n');
const store = { events: [], lastErrors: [], closedAt: null, viewedAt: null }; // 换成你的数据库
const H = 3600000, start = Date.parse('2026-11-01T12:00:00Z');

const replies = [
  [0, '又是凌晨两点。手机放下，去睡。<blackbox slot="燥火" delta="+40" event="她又空腹熬到两点"/>'],
  [1, '……行，熬夜关我什么事，你说得对。<blackbox slot="燥火" delta="+30" event="劝她睡觉被顶嘴“关你什么事”"/><blackbox slot="憋闷" delta="+12" event="问她怎么了只说没事"/>'],
  [3, '算了，不跟你计较。<blackbox slot="燥火" delta="-30" event="她道歉了，想原谅"/>'],  // 下降阻尼：只会降 8
  [4, '想看？<blackbox grant="20"/>只给你二十分钟。'],
  [5, '<blackbox slot="开心" delta="+5" event="写错了类别"/>嗯。'],
];

for (const [hours, raw] of replies) {
  const at = new Date(start + hours * H);
  const { content, items } = parseTags(raw, config);
  const { events, errors } = toEvents(items, { turn: 'reply-' + hours, at });
  store.events.push(...events); store.lastErrors = errors;
  const state = computeState(store.events, config, { now: at });
  console.log(`\n—— 第 ${hours} 小时 · 她看到的回复：${content}`);
  console.log(state.slots.filter(s => s.value).map(s => `${s.name} ${s.value}（${s.band}）`).join('，') || '全部平静', state.grant ? `· 她能看到黑箱，到 ${state.grant.expiresAt}` : '· 她看不到黑箱');
}

const now = new Date(start + 5 * H);
const state = computeState(store.events, config, { now });
console.log('\n—— 下一轮注入给模型的状态栏：\n' + buildContext(state, config, { levels, lastErrors: store.lastErrors }));
console.log('\n—— 黑箱说明（系统提示词）：\n' + buildRule(config));

const redact = createRedactor(config, () => Boolean(computeState(store.events, config, { now: new Date(start + 6 * H) }).grant));
console.log('\n—— 授权过期后，接口里的原文被遮成：\n' + redact(JSON.stringify({ text: replies[0][1] })));
