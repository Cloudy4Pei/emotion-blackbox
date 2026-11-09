import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfig, parseTags, hideTags, toEvents, computeState, buildContext, pickLevels, createRedactor, buildRule } from '../src/index.js';

const config = createConfig(), H = 3600000, t0 = Date.parse('2026-11-07T00:00:00Z');
const ev = (hours, row) => ({ slot: null, delta: null, minutes: null, event: '', turn: null, ...row, at: new Date(t0 + hours * H).toISOString() });
const value = (events, hours, slot, opts) => computeState(events, config, { now: new Date(t0 + hours * H), ...opts }).slots.find(s => s.key === slot).value;

test('tags are parsed and removed; examples in code are kept', () => {
  const { content, items } = parseTags('嗯。\n<blackbox slot="欲望" delta="+35" event="勾起火又不给碰"/>\n<blackbox slot="燥火" release="吵开了"/><blackbox grant="30"/>`<blackbox grant="30"/>`', config);
  assert.equal(content, '嗯。\n\n`<blackbox grant="30"/>`');
  assert.deepEqual(items, [{ kind: 'delta', slot: 'lust', delta: 35, event: '勾起火又不给碰' }, { kind: 'release', slot: 'irritation', event: '吵开了' }, { kind: 'grant', minutes: 30 }]);
  assert.ok(parseTags('<blackbox slot="开心" delta="+5" event="x"/>', config).items[0].error);
  assert.ok(parseTags('<blackbox slot="冷落" delta="+5"/>', config).items[0].error);
  assert.ok(parseTags('<blackbox grant="60"/>', config).items[0].error);
  assert.equal(parseTags('<think><blackbox grant="30"/></think>好', config).items.length, 0);
  assert.equal(hideTags('好<blackbox slot="燥火" delta="+3" event="x"/>的<blackbox slot="燥'), '好的');
});

test('half-life, cap at 100, and the per-turn drop limit', () => {
  const events = [ev(0, { kind: 'delta', slot: 'lust', delta: 40 }), ev(0, { kind: 'delta', slot: 'sullen', delta: 90 }), ev(0, { kind: 'delta', slot: 'sullen', delta: 50 })];
  assert.equal(value(events, 0, 'lust'), 40); assert.equal(value(events, 24, 'lust'), 20);
  assert.equal(value(events, 0, 'sullen'), 100);
  const down = [...events, ev(1, { kind: 'delta', slot: 'sullen', delta: -30, turn: 'r1' }), ev(1, { kind: 'delta', slot: 'sullen', delta: -30, turn: 'r1' })];
  assert.equal(value(down, 1, 'sullen'), 91, 'one turn drops at most 8 per slot');
  const twoTurns = [...events, ev(1, { kind: 'delta', slot: 'sullen', delta: -30, turn: 'r1' }), ev(1, { kind: 'delta', slot: 'sullen', delta: -30, turn: 'r2' })];
  assert.equal(value(twoTurns, 1, 'sullen'), 83);
  assert.equal(value(down, 1, 'sullen', { counted: e => e.turn !== 'r1' }), 99, 'a deleted reply no longer counts');
});

test('release halves once per six hours and never reaches zero', () => {
  const events = [ev(0, { kind: 'delta', slot: 'irritation', delta: 80 }), ev(1, { kind: 'release', slot: 'irritation', event: '吵开了' }), ev(2, { kind: 'release', slot: 'irritation', event: '又吵' })];
  const state = computeState(events, config, { now: new Date(t0 + 2 * H) });
  assert.equal(state.slots.find(s => s.key === 'irritation').value, Math.round(80 * .5 ** (2 / 12) / 2));
  assert.equal(state.events.at(-1).effect, 'too_soon');
  assert.match(buildContext(state, config), /不到6小时/);
});

test('grant opens for its minutes; user can close early; closed output is redacted', () => {
  const { events } = toEvents([{ kind: 'grant', minutes: 30 }, { error: 'x' }], { turn: 'g', at: new Date(t0) });
  assert.equal(events.length, 1);
  const at = m => new Date(t0 + m * 60000);
  assert.ok(computeState(events, config, { now: at(10) }).grant);
  assert.equal(computeState(events, config, { now: at(31) }).grant, null);
  assert.equal(computeState(events, config, { now: at(10), closedAt: at(5).toISOString() }).grant, null);
  assert.match(buildContext(computeState(events, config, { now: at(10), viewedAt: at(8).toISOString() }), config), /还剩20分钟，2分钟前打开看过/);
  let open = false;
  const redact = createRedactor(config, () => open);
  const raw = JSON.stringify({ a: '好<blackbox slot="燥火" delta="+3" event="x"/>', b: '【情绪黑箱 · 只有你看得见】\n燥火 3【情绪黑箱结束】', c: '例 `<blackbox grant="30"/>`', d: '【情绪黑箱 · 只有你看得见】截断' });
  const hidden = JSON.parse(redact(raw));
  assert.equal(hidden.a, '好<blackbox 未授权/>'); assert.equal(hidden.b, '【情绪黑箱 · 未授权查看】');
  assert.equal(hidden.c, '例 `<blackbox grant="30"/>`'); assert.equal(hidden.d, '【情绪黑箱 · 未授权查看】');
  open = true; assert.equal(redact(raw), raw);
});

test('levels pick the highest reached line per category; custom slots work', () => {
  const slots = [{ name: '燥火', value: 65 }, { name: '欲望', value: 10 }];
  assert.deepEqual(pickLevels('# 说明\n燥火 30：话变少\n燥火 60：直接点破\n欲望 40：主动\n别装没事', slots), ['别装没事', '燥火 60+：直接点破']);
  const custom = createConfig({ slots: [{ key: 'sad', name: '委屈', halflife: 10, desc: '被{user}凶了' }], names: { user: '小雨' } });
  assert.equal(parseTags('<blackbox slot="委屈" delta="+5" event="x"/>', custom).items[0].slot, 'sad');
  assert.match(buildRule(custom), /委屈（被小雨凶了）/);
  assert.throws(() => createConfig({ slots: [{ key: 'a', name: 'b', halflife: 0 }] }));
});
