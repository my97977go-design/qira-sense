// V8 学习与测评的统一配置。
// 注意：以下阈值均为可配置的产品默认参数（provisional），
// 不是经过实验验证的科学标准，可在本文件中直接调整。
// 技法两种形态：tap = 点状瞬时动作；hold = 持续状态（游戏中长按光条）。
// 大上滑音/大下滑音并入上滑/下滑轨道；回滑音是正式点状技法（独立 K 轨）。
// 垫指滑音已按教学要求从技法体系中删除。
export const TECHNIQUE_KIND = {
  "up-glide": "tap",
  "down-glide": "tap",
  paogong: "tap",
  dianbow: "tap",
  "return-glide": "tap",
  vibrato: "hold",
  "slide-vibrato": "hold",
  dayin: "hold",
};
export const FINAL_TECHNIQUES = Object.keys(TECHNIQUE_KIND);
export const TAP_TECHNIQUES = FINAL_TECHNIQUES.filter(
  (t) => TECHNIQUE_KIND[t] === "tap",
);
export const HOLD_TECHNIQUES = FINAL_TECHNIQUES.filter(
  (t) => TECHNIQUE_KIND[t] === "hold",
);
export const kindOf = (id) => TECHNIQUE_KIND[id] || "tap";
// 教学参考技法（资料库保留、不进工作集）；目前全部技法均已转正。
export const REFERENCE_TECHNIQUES = [];
export const supportsAnnotation = (id) =>
  id in TECHNIQUE_KIND || REFERENCE_TECHNIQUES.includes(id);
export const FINAL_TEST_TOLERANCE_MS = 180;
export const finalTestPassRule = {
  metric: "overallF1",
  threshold: 0.7,
  status: "provisional",
  note: "可配置的演示默认值，非实验验证标准。",
};
export const LEARNER_KEY = "qira-learner-state-v1";
