export function heuristicAnalysis(message, currentScene = 'focus') {
  const text = message.toLowerCase();

  if (text.includes('睡') || text.includes('困') || text.includes('晚安') || text.includes('失眠') || text.includes('入睡')) {
    return {
      reply: '夜色渐深，声屿已为你调暗音律。放下屏幕，让柔和的潮汐与白噪音带走一天的疲惫吧。',
      recommendedSceneId: 'sleep',
      sceneTitle: '夜泊星海 · 睡眠过渡',
      recommendedTrackId: 'sleep-drift',
      ambientAdjustments: { waves: 0.45, rain: 0.1, fire: 0.05, wind: 0.2, cafe: 0 },
      rationale: '基于你提到的入睡需求，切换为低心率引导与极简环境音，辅助褪黑素分泌。',
      suggestedFollowUps: ['定时30分钟后关闭', '换成纯海浪声', '音量再调低一点'],
    };
  }

  if (text.includes('跑') || text.includes('运动') || text.includes('健身') || text.includes('活力') || text.includes('燃')) {
    return {
      reply: '换上运动鞋了吗？声屿为你准备了明快稳健的步伐律动，让心率随节拍自然提速。',
      recommendedSceneId: 'workout',
      sceneTitle: '晨曦跃动 · 步伐与心率',
      recommendedTrackId: 'sunrise-stride',
      ambientAdjustments: { wind: 0.3, waves: 0.1, rain: 0, fire: 0, cafe: 0 },
      rationale: '运动场景需要高通透度与120BPM律动支撑，避免杂乱听感。',
      suggestedFollowUps: ['节奏再快一点', '换为无器乐纯鼓点', '进入拉伸休息'],
    };
  }

  if (text.includes('累') || text.includes('歇') || text.includes('下班') || text.includes('放松') || text.includes('放空') || text.includes('休息')) {
    return {
      reply: '辛苦了，先深呼吸一口气。声屿为你点亮了温润的暮色岛屿，听听柔和的风与琴音。',
      recommendedSceneId: 'rest',
      sceneTitle: '暮色海湾 · 舒缓放空',
      recommendedTrackId: 'coastal-rest',
      ambientAdjustments: { waves: 0.3, wind: 0.2, rain: 0.15, fire: 0.1, cafe: 0 },
      rationale: '缓和紧张交感神经，引入自然流水与原声和弦，提供适度的放空包裹感。',
      suggestedFollowUps: ['加点小雨声', '换纯钢琴曲', '开启15分钟番茄休息'],
    };
  }

  if (text.includes('钢琴') || text.includes('古典') || text.includes('纯琴')) {
    return {
      reply: '为你转为纯钢琴独奏流。琴键落下的回响里，时间也会变得从容。',
      recommendedSceneId: currentScene || 'focus',
      sceneTitle: '黑白回响 · 纯粹琴音',
      recommendedTrackId: 'gentle-piano',
      ambientAdjustments: { rain: 0.2, fire: 0.1, waves: 0, wind: 0.1, cafe: 0 },
      rationale: '根据你的偏好纠正，滤除合成器与鼓点，保留木质琴键真实泛音。',
      suggestedFollowUps: ['稍微轻柔一点', '加点微弱雨声', '只保留单曲循环'],
    };
  }

  if (text.includes('安静') || text.includes('吵') || text.includes('去鼓') || text.includes('慢一点') || text.includes('轻一点')) {
    return {
      reply: '已为你调低动态起伏，隐去节拍器与底鼓，留出纯粹的呼吸留白。',
      recommendedSceneId: currentScene || 'focus',
      sceneTitle: '空灵留白 · 极简心境',
      recommendedTrackId: 'tranquil-isle',
      ambientAdjustments: { rain: 0.25, wind: 0.15, waves: 0.1, fire: 0, cafe: 0 },
      rationale: '即时响应修正指令，将能量等级降至最低，确保无干扰陪伴。',
      suggestedFollowUps: ['开启纯音乐模式', '关闭动效', '降低整体音量'],
    };
  }

  // Default focus / coding flow
  return {
    reply: '我在。已为你铺垫平缓的低保真代码流与微雨声，沉下心来，一件件完成即可。',
    recommendedSceneId: 'focus',
    sceneTitle: '夜窗微雨 · 深度专注',
    recommendedTrackId: 'midnight-code',
    ambientAdjustments: { rain: 0.35, fire: 0.1, waves: 0, wind: 0.05, cafe: 0.1 },
    rationale: '稳定中频与65BPM温润律动，有效屏蔽周围杂音，助你维持心流。',
    suggestedFollowUps: ['进入25分钟专注倒计时', '去掉小雨声', '换更轻柔的原声吉他'],
  };
}
