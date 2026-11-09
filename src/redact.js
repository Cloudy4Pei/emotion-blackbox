// 遮挡：没有授权时，凡是要发给 user 前端的内容，都先过一遍 redact，
// 把原始标签和注入块换成占位。适合放在你的 JSON 响应和 SSE/WebSocket 推送出口。
// 反引号里的示例（比如提示词编辑器里的说明文字）不遮，否则保存时会把占位写回去。
// 在 JSON 文本上替换；块没写完（被截断的预览）就遮到字符串结尾。

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createRedactor(config, isOpen) {
  const { marks } = config;
  const TAG = /(?<!`)<blackbox\b(?:[^"\\>]|\\.)*(?:>|(?="))/g;
  const BLOCK = new RegExp(escape(marks.open) + '(?:[^"\\\\]|\\\\.)*?(?:' + escape(marks.close) + '|(?="))', 'g');
  return function redact(json) {
    if (!json.includes('<blackbox') && !json.includes(marks.open)) return json;
    if (isOpen()) return json;
    return json.replace(TAG, m => m === marks.hiddenTag ? m : marks.hiddenTag).replace(BLOCK, marks.hiddenBlock);
  };
}
