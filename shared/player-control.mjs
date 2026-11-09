export const PLAYER_ACTIONS = ['pause', 'resume', 'next', 'previous', 'clear_queue', 'set_volume', 'adjust_volume', 'mute', 'unmute', 'set_mode', 'seek', 'set_timer'];
export function playerControl(args) {
  const action = args?.action;
  if (!PLAYER_ACTIONS.includes(action)) throw Error('不支持的播放器操作');
  const control = { action };
  const number = (key, min, max) => {
    if (!Number.isFinite(args[key]) || args[key] < min || args[key] > max) throw Error('播放器参数超出范围');
    control[key] = args[key];
  };
  if (action === 'set_volume') number('percent', 0, 100);
  if (action === 'adjust_volume') number('delta', -100, 100);
  if (action === 'seek') number('seconds', 0, 86400);
  if (action === 'set_timer') number('minutes', 0, 1440);
  if (action === 'set_mode') {
    if (!['sequential', 'shuffle', 'repeat-one'].includes(args.mode)) throw Error('播放模式无效');
    control.mode = args.mode;
  }
  return { playbackAction: action, playerControl: control, mode: 'control', reply: '正在操作播放器…' };
}
const numeric = value => {
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === '一百') return 100;
  if (value.includes('十')) { const [a, b] = value.split('十'); return (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0); }
  return digits[value];
};
export function directPlayerControl(message) {
  try { return parseDirectControl(message); } catch { return undefined; }
}
function parseDirectControl(message) {
  const text = String(message || '').trim().replace(/[\s，。！!,.]/g, '').replace(/^(?:请|帮我|给我)/, '').replace(/吧$/, '');
  const simple = { '清空歌单': 'clear_queue', '清空当前歌单': 'clear_queue', '清空队列': 'clear_queue', '清空当前队列': 'clear_queue', '清空播放列表': 'clear_queue', '清空当前播放列表': 'clear_queue', '静音': 'mute', '取消静音': 'unmute', '恢复声音': 'unmute' };
  if (simple[text]) return playerControl({ action: simple[text] });
  const modes = { '随机播放': 'shuffle', '顺序播放': 'sequential', '单曲循环': 'repeat-one' };
  if (modes[text]) return playerControl({ action: 'set_mode', mode: modes[text] });
  if (/^(?:音量)?(?:调小|调低|降低|小声|轻声)(?:一点|些)?$/.test(text)) return playerControl({ action: 'adjust_volume', delta: -10 });
  if (/^(?:音量)?(?:调大|调高|提高|大声)(?:一点|些)?$/.test(text)) return playerControl({ action: 'adjust_volume', delta: 10 });
  const n = '[零一二两三四五六七八九十百\\d]+(?:\\.\\d+)?';
  let match = new RegExp('^(?:把)?音量(?:调到|设为|设置为|调成|为)?(?:百分之)?(' + n + ')(?:%|％)?$').exec(text);
  if (match && numeric(match[1]) <= 100) return playerControl({ action: 'set_volume', percent: numeric(match[1]) });
  match = new RegExp('^(?:音量)?(降低|减小|调低|提高|增大|调高)(' + n + ')(?:%|％)$').exec(text);
  if (match && numeric(match[2]) <= 100) return playerControl({ action: 'adjust_volume', delta: numeric(match[2]) * (/降低|减小|调低/.test(match[1]) ? -1 : 1) });
  match = new RegExp('^(?:跳到|播放到|跳转到)(' + n + ')(分|分钟|秒)(?:(' + n + ')秒)?$').exec(text);
  if (match) return playerControl({ action: 'seek', seconds: numeric(match[1]) * (match[2].startsWith('分') ? 60 : 1) + (match[3] ? numeric(match[3]) : 0) });
  if (/^(?:取消|关闭)(?:睡眠)?定时$/.test(text)) return playerControl({ action: 'set_timer', minutes: 0 });
  match = new RegExp('^(?:睡眠)?定时(' + n + ')(?:分钟|分)(?:后停止播放)?$').exec(text);
  if (match) return playerControl({ action: 'set_timer', minutes: numeric(match[1]) });
}
