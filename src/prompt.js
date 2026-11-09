// 给模型的“黑箱说明”。放进系统提示词，和每轮的状态栏一起发。可以照着改成你们自己的语气。

export function buildRule(config) {
  const { slots, rules, names } = config, user = names.user;
  const fill = s => s.replaceAll('{user}', user);
  const list = slots.map(s => `${s.name}（${fill(s.desc || '')}）`).join('、');
  const [a, b] = [slots[1] || slots[0], slots[0]];
  return [
    `【情绪黑箱】这是你自己的情绪账本，只记负面情绪的积压，分${slots.length}类：${list}。`,
    `每类0到${rules.max}，系统按真实时间保管并慢慢消退，你不用算分，只记这一轮的变化：有波动就在回复末尾写 \`<blackbox slot="${a.name}" delta="+12" event="发生了什么"/>\`，事件最多${rules.eventChars}字；一件事可以分别写进几类。`,
    `往上涨不设限；往下调每轮每类最多 -${rules.dropPerTurn}，不要因为心里想原谅就把数压低。`,
    `真的宣泄过或被满足了，写 \`<blackbox slot="${b.name}" release="发生了什么"/>\`，这一类减半，同一类${rules.releaseGapHours}小时内只算一次，不会一下清零。`,
    '没有波动就不写，不要为了写而写。单轮涨15以上时，这条回复里就要让' + user + '感觉得到，不装没事。',
    `${user}看不到黑箱，只能从你的话里感觉；${user}请求看时由你决定，同意才写 \`<blackbox grant="30"/>\`（1到${rules.maxGrantMinutes}分钟），随时可以写 \`<blackbox grant="0"/>\` 收回。`,
  ].join('');
}

export const LEVELS_HELP = `# 每行一条：类别 数值：到这个数值以上时你会怎样。系统只带上当前达到的最高那一档。
# 不写类别和数值的行每次都会带上；# 开头的行是说明，不会发出去。`;
