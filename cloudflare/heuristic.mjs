// Offline conversation never pretends to start a song or change audio settings.
export function heuristicAnalysis(message, currentScene = 'focus') {
  const text = String(message || '');
  const scene = /睡|困|晚安/.test(text) ? 'sleep' : /运动|跑步|健身/.test(text) ? 'workout' : /累|下班|休息|放松/.test(text) ? 'rest' : currentScene;
  return {
    reply: /累|下班|休息/.test(text) ? '辛苦了，先给自己一点喘口气的时间。我在这里，想说说今天吗？' : '我在听。现在是离线回复，可以先聊聊；选歌需要连接陪伴模型和 QQ 音乐。',
    recommendedSceneId: scene, sceneTitle: '陪你片刻', rationale: '', suggestedFollowUps: [],
  };
}
