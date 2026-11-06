// Static scene artwork. Songs and playback are supplied by the shared application core.
import rest from "../src/assets/images/soundisle_rest_cover_1793256767416.jpg";
import focus from "../src/assets/images/soundisle_focus_cover_1793256767137.jpg";
import sleep from "../src/assets/images/soundisle_sleep_cover_1793256767790.jpg";
import rhythm from "../src/assets/images/soundisle_rhythm_cover_1793256768456.jpg";

export const scenes = [
  {
    name: "放松",
    label: "把忙碌留在身后",
    cover: rest,
    title: "给自己，一段留白",
    subtitle: "轻柔旋律，陪你慢慢放松。",
    track: 0,
  },
  {
    name: "专注",
    label: "进入自己的节奏",
    cover: focus,
    title: "留一点空间给专注",
    subtitle: "让思绪落定，让灵感发生。",
    track: 1,
  },
  {
    name: "好眠",
    label: "今晚，睡个好觉",
    cover: sleep,
    title: "让今天，轻轻落幕",
    subtitle: "把未完成的事，留给明天。",
    track: 2,
  },
  {
    name: "活力",
    label: "让心情动起来",
    cover: rhythm,
    title: "跟着节奏，向前走",
    subtitle: "从一首轻快的歌开始。",
    track: 3,
  },
];
export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
