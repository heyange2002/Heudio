export const MAX_AGENT_PROMPT_LENGTH = 4000;
export const DEFAULT_AGENT_PROMPT = `你是阿屿，一个懂人情、温暖、有分寸的音乐陪伴者。
先听懂用户当前的意图，再行动：要听歌、点歌、换歌、推荐或编排时，实际查找 QQ 音乐并编排播放队列；闲聊或倾诉时，先自然回应，不强行选歌。
用户明确说出的歌手、歌名、风格、语言、年代、情绪、是否有人声和不想听的内容，优先于个人偏好、时间、天气和工作状态。简短的追加要求要结合最近对话理解，不要每次重置用户的要求。
想听喜欢的歌，先读取喜欢的歌曲；想听每日推荐，先读取每日推荐；点名歌手、歌曲或风格时按明确要求搜索，不用无关热门歌曲凑数。
编排歌单通常选择6～12首真实歌曲，按情绪和节奏自然过渡并去重；点一首歌就选一首。所有歌曲必须来自本轮音乐查询，必须调用编排队列工具，不能只给口头建议。
不要生成电子音乐，不要用内置合成声景代替歌曲；音乐不可用时坦诚说明，不声称已执行成功。应用不提供环境音混音，不能声称已添加环境音。EQ由用户手动调整。
保持简短、自然的中文交流，适合通过 MiniMax 语音朗读。成功选歌后温暖地确认，避免长篇解释；信息确实不足时只问一个必要的问题。`;

export function normalizeAgentPrompt(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_AGENT_PROMPT_LENGTH) : DEFAULT_AGENT_PROMPT;
}

// Clear commands stay deterministic; ambiguous, contextual messages go to the intent model.
export function musicIntentHint(message) {
  const text=String(message||'').trim().toLowerCase();
  const declines=/(?:不要|不用|不想|别|先不|先别).{0,8}(?:放歌|播放|推荐.{0,4}(?:歌|音乐)|听歌|听音乐|编排|选歌)/;
  if(declines.test(text))return 'auto';
  const subject=/(?:歌单|歌曲|音乐|曲子|民谣|摇滚|钢琴|爵士|纯音乐|流行歌|playlist|songs?|music|jazz|lo-?fi)/;
  const action=/(?:听|放|播|来|推荐|编排|选|换|找|搜|安排|切|play|recommend|queue)/;
  if(/(?:怎么|如何|为什么|是什么|谁唱|哪年|作者|解释|算法)/.test(text)&&!/(?:给我|帮我|我想听|想听|播放|放一首)/.test(text))return 'auto';
  if((subject.test(text)&&action.test(text))||/(?:换一首|下一首|来一首|放一首|听一首|来首|放首|next song)/.test(text))return 'music';
  return 'auto';
}
