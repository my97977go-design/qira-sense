// V8 学习与测评的统一配置。
// 注意：以下阈值均为可配置的产品默认参数（provisional），
// 不是经过实验验证的科学标准，可在本文件中直接调整。
export const FINAL_TECHNIQUES = [
  "up-glide",
  "down-glide",
  "vibrato",
  "slide-vibrato",
  "dayin",
  "return-glide",
];
export const FINAL_TEST_TOLERANCE_MS = 180;
export const finalTestPassRule = {
  metric: "overallF1",
  threshold: 0.7,
  status: "provisional",
  note: "可配置的演示默认值，非实验验证标准。",
};
export const LEARNER_KEY = "qira-learner-state-v1";
