// 回复里的内联标签：只解析，不记账。保存回复前调用 parseTags，把标签从正文里去掉，条目交给你的存储。
//   <blackbox slot="燥火" delta="+12" event="她又空腹熬夜"/>   这一轮的变化（增量，不是总分）
//   <blackbox slot="欲望" release="发生了什么"/>               宣泄：这一类减半
//   <blackbox grant="30"/>                                    给 user 开放 30 分钟；grant="0" 收回
// 代码块、行内代码、<think> 里的标签是示例或思考，不算。

const attrs = raw => Object.fromEntries([...String(raw || '').matchAll(/(\w+)\s*=\s*"([^"]*)"/g)].map(m => [m[1].toLowerCase(), m[2].trim()]));
const TAG = /```[\s\S]*?(?:```|$)|`[^`\n]*(?:`|$)|<(think|thinking)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<blackbox\b([^>]*?)\/?\s*>(?:\s*<\/blackbox\s*>)?/gi;

function item(raw, config) {
  const a = attrs(raw), { rules, slots } = config;
  if (a.grant !== undefined) {
    const minutes = Number(a.grant);
    return Number.isInteger(minutes) && minutes >= 0 && minutes <= rules.maxGrantMinutes
      ? { kind: 'grant', minutes }
      : { error: `授权时间需为0到${rules.maxGrantMinutes}的整数分钟` };
  }
  const slot = slots.find(s => s.key === a.slot || s.name === a.slot);
  if (!slot) return { error: `没有「${a.slot || ''}」这一类，只能是${slots.map(s => s.name).join('、')}` };
  if (a.release !== undefined) {
    return a.release && a.release.length <= rules.eventChars
      ? { kind: 'release', slot: slot.key, event: a.release }
      : { error: `宣泄需写明发生了什么，最多${rules.eventChars}字` };
  }
  const delta = Number(String(a.delta || '').replace(/^＋/, '+'));
  if (!Number.isInteger(delta) || !delta || Math.abs(delta) > rules.max) return { error: `变化量需为 -${rules.max} 到 +${rules.max} 之间不为0的整数` };
  if (!a.event || a.event.length > rules.eventChars) return { error: `需写明触发事件，最多${rules.eventChars}字` };
  return { kind: 'delta', slot: slot.key, delta, event: a.event };
}

// 返回去掉标签后的正文和解析出的条目。格式不对的条目带 error，记下来下一轮告诉模型。
export function parseTags(text, config) {
  const items = [];
  const content = String(text ?? '').replace(TAG, (raw, think, tag) => {
    if (tag === undefined) return raw;
    items.push(item(tag, config));
    return '';
  }).replace(/<blackbox\b[^>]*$/i, ''); // 流式输出时没写完的半个标签
  return { content: items.length ? content.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() : content, items };
}

// 只用于显示：流式生成途中把已经出现的标签藏起来，避免闪一下。
export function hideTags(text) {
  return parseTags(text, { rules: { maxGrantMinutes: 0, max: 0, eventChars: 0 }, slots: [] }).content;
}
