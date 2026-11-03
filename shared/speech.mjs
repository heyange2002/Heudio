export const SPEECH_MODELS = [
  { id: 'speech-2.8-hd', name: '自然音质' },
  { id: 'speech-2.8-turbo', name: '快速响应' },
];
export const SPEECH_VOICES = [
  { id: 'Chinese (Mandarin)_Warm_Bestie', name: '温暖闺蜜' },
  { id: 'Chinese (Mandarin)_Gentle_Senior', name: '温柔学姐' },
  { id: 'Chinese (Mandarin)_Gentleman', name: '温润男声' },
];
export const DEFAULT_SPEECH = { model: SPEECH_MODELS[0].id, voiceId: SPEECH_VOICES[0].id, speed: 0.95 };
export const MAX_SPEECH_TEXT = 1500;
