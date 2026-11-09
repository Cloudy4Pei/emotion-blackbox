# 移植说明（写给帮你移植的 AI）

你要把情绪黑箱接进一个 AI 陪伴项目。这个仓库是参考实现，`src/` 里都是纯函数，没有存储、没有网络。你的工作是把它们接到对方项目的四个位置：系统提示词、回复保存、上下文组装、对外输出。先读完对方项目里这四处的代码，再动手。

## 0. 先确认

- 对方的角色叫什么、怎么称呼 user。`createConfig({ names: { user: '她' } })` 里的称呼会写进提示词和状态栏。
- 五类情绪要不要改。类别在 `src/config.js` 的 `DEFAULT_SLOTS`：`key` 用来存储，`name` 写在标签里，`halflife` 是小时，`desc` 写进提示词，其中 `{user}` 会被替换成称呼。
- 回复有没有稳定的 id（用作 `turn`）。有没有删除、重新生成、分支——有的话第 3 步要写 `counted()`。

## 1. 存储

建一张流水表（或 JSON 文件），字段和 `toEvents()` 的输出一致：

```
kind      'delta' | 'release' | 'grant'
slot      类别 key（grant 为空）
delta     整数（只有 delta 有）
minutes   整数（只有 grant 有）
event     触发事件
turn      所属回复 id
at        ISO 时间
```

另外存三样小东西：
- 已处理的回复 id，保证同一条回复只记一次（重试、重放时很重要）；
- 最近一轮的 `errors`，下一轮注入时要用；
- `closedAt`（user 提前合上的时间）和 `viewedAt`（user 最近一次打开的时间）。

## 2. 回复保存前

找到模型回复被写进聊天记录的地方，在写入**之前**：

```js
const { content, items } = parseTags(reply, config);
if (items.length && !alreadyProcessed(replyId)) {
  const { events, errors } = toEvents(items, { turn: replyId });
  saveEvents(events); saveLastErrors(errors); markProcessed(replyId);
}
saveMessage(content); // 存的是去掉标签的正文
```

流式输出时，显示层用 `hideTags(partialText)`，标签不会闪出来。如果项目还有别的写入口（主动消息、导入、编辑），都要先过 `parseTags`。

## 3. 组装上下文

每次请求模型前：

```js
const state = computeState(loadEvents({ since: 60 天前 }), config, {
  now: new Date(), closedAt, viewedAt,
  counted: e => replyStillExists(e.turn), // 被删、被重新生成替换、不在当前分支的回复，返回 false
});
const block = buildContext(state, config, { levels: 档位文本, lastErrors });
```

- 系统提示词里放 `buildRule(config)`（或对方自己改写过的版本）。
- `block` 放在动态上下文里，每轮更新。它以 `config.marks.open` 开头、`config.marks.close` 结尾，第 4 步的遮挡靠这两个标记识别。
- 档位文本最好做成 user 可以编辑的设置，初始值可以用 `examples/levels.example.txt` 这份格式模板，或 `LEVELS_HELP`。最好请角色自己填。
- 只在日常对话里注入和记账。角色扮演剧情、群聊之类的场景建议跳过。

## 4. 对外输出遮挡

```js
const redact = createRedactor(config, () => Boolean(computeState(...).grant));
```

把它放在**所有**发给前端的出口：JSON 响应、SSE/WebSocket 推送、请求日志查看页、调试接口。它在 JSON 字符串上替换，所以要在 `JSON.stringify` 之后调用。`isOpen` 会被频繁调用，可以缓存一两秒，在授权或合上时清掉缓存。

## 5. 页面（可选）

- 没授权：只显示“合着”。
- 授权中：请求时记下 `viewedAt`，显示剩余时间、各类数值和档位、最近几笔流水（`state.events`），再放一个“现在合上”按钮写入 `closedAt`。
- 聊天里授权那条回复下面可以放一行回执，带上分钟数就够了，不要带数值。

## 检查清单

- [ ] 聊天记录、复制、朗读、通知、发给模型的历史里都没有原始标签。
- [ ] 删掉或重新生成一条回复后，它记的那几笔不再算。
- [ ] 同一条回复处理两次，只记一次。
- [ ] 没授权时，接口和推送里看不到数值和标签；授权后能看到；过期或合上后又看不到。
- [ ] 提示词编辑器里，反引号包着的示例标签没有被遮掉。
- [ ] 跑一遍 `npm test`，再按对方项目的方式写几条集成测试。
