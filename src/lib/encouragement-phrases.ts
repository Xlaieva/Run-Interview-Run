/** Rotating pool of upbeat phrases the mascot shows above its head — plain canned text, no AI call needed for this. */
export const ENCOURAGEMENT_PHRASES = [
  "今天也要元气满满地刷题哦！",
  "休息一下也没关系，慢慢来～",
  "你已经很棒啦，再接再厉！",
  "每一次尝试都是进步～",
  "卡住了就点我聊聊，别自己扛～",
  "刷完这道，奖励自己喝口水吧！",
  "面试官都在偷偷佩服你了！",
  "今天的努力，明天会看见～",
  "小小的坚持，大大的成长！",
  "累了就歇会儿，我在这陪你～",
];

export function randomEncouragement(): string {
  return ENCOURAGEMENT_PHRASES[Math.floor(Math.random() * ENCOURAGEMENT_PHRASES.length)];
}
