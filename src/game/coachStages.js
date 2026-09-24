// 技法训练（教练模式）阶段表：以教师确认的 41 个毫秒事件为唯一依据，
// 按“认识一下 → 听一遍 → 跟一遍”的认知节奏切成 14 个渐进阶段。
// from/to 是练习音频窗（也是本轮参与判定的事件窗）；前半曲的前几段
// from=0 实现“复习前面 + 新增”的累计练习。
// newFrom/newTo 标出本段“新知识点”的事件窗，用于概念展示与试听。
import { LANES, laneOf, trustedHumanEvents } from "./chart.js";

export const COACH_PASS_AT = 0.6; // 默认通过率：本段音符命中 ≥60% 即进入下一段。
export const HOLD_LEAD_WINDOW = 0.5; // 长按起按容错：早/晚 0.5s 内落指都算跟上了开头。
export const HOLD_MIN_RATIO = 0.5; // 按住时长不足一半 → 不判死，提示“再按一次”。

export const COACH_STAGES = [
  {
    id: "up4",
    title: "四个上滑音",
    debut: "4 个上滑音",
    focus: ["up-glide"],
    from: 0,
    to: 2.3,
    newFrom: 0,
    newTo: 2.3,
    concept:
      "乐曲开场是四个连续的上滑音：手指从下方滑上来“够”到音，声音向上挑起。先听一遍这四个上滑，再跟着每一个上滑点一下。",
  },
  {
    id: "dayin1",
    title: "打音 · 打弓长音",
    debut: "打音长音",
    focus: ["dayin"],
    from: 0,
    to: 9.72,
    newFrom: 2.2,
    newTo: 9.72,
    concept:
      "四个上滑之后是一段打音（打弓）：手指在弦上快速连续击打，像颤音一样让长音“波”起来，弓段同时保持贴弦。它是一段长音——请长按住，按满这段时值。早一点、晚一点落指都没关系，按住就好。",
  },
  {
    id: "up-review",
    title: "再遇·上滑",
    focus: ["up-glide"],
    from: 0,
    to: 10.03,
    newFrom: 9.65,
    newTo: 10.03,
    concept:
      "打音收尾，又撞见一个上滑音——刚学过的，正好复习。这次整段跟下来：四个上滑、一段打弓长音，再加这个上滑。",
  },
  {
    id: "up-down",
    title: "难点·上滑接下滑",
    focus: ["up-glide", "down-glide"],
    from: 10.0,
    to: 10.75,
    newFrom: 10.1,
    newTo: 10.65,
    concept:
      "注意！上滑之后不到 0.2 秒就紧接着一个下滑——两个方向相反的动作贴得非常近，是全曲最难跟的地方。我们把它单独拎出来，多练几遍“上、下、上、下”，找到这个来回的节奏感。",
    drill: { reps: 4 },
  },
  {
    id: "down4",
    title: "四个下滑",
    debut: "4 个下滑音",
    focus: ["down-glide"],
    from: 9.65,
    to: 12.2,
    newFrom: 10.7,
    newTo: 12.2,
    concept:
      "难点过后是四个下滑：手指带着音从高处滑下来“落”回去，方向和上滑正好相反。先听这四个下滑，再从头跟一遍刚才的整段。",
  },
  {
    id: "dayin2",
    title: "打音 · 前半收尾",
    focus: ["dayin"],
    from: 11.9,
    to: 18.3,
    newFrom: 12.55,
    newTo: 18.3,
    concept:
      "前半曲在第二段打弓长音里收尾——还是按住不放。跟下这一段，前半曲就拿下了！",
    celebrate: "前半曲完成！歇一口气，我们继续挑战后半段。",
  },
  {
    id: "down-half",
    title: "后半·下滑",
    focus: ["down-glide"],
    from: 19.05,
    to: 20.0,
    newFrom: 19.05,
    newTo: 20.0,
    concept:
      "后半曲从两个下滑开始。它和回滑长得很像，容易混——先分别听听它们的真实声音，再跟着这两个下滑走。",
    compare: {
      hint: "下滑：滑下去就不回来；回滑：滑出去又滑回来。点两边反复听，自己对比。",
      left: { label: "下滑", technique: "down-glide", from: 19.05, to: 19.68 },
      right: { label: "回滑", technique: "return-glide", from: 19.9, to: 21.0 },
    },
  },
  {
    id: "return4",
    title: "四个回滑",
    debut: "4 个回滑音",
    focus: ["return-glide"],
    from: 19.05,
    to: 22.35,
    newFrom: 20.0,
    newTo: 22.35,
    concept:
      "回滑登场：音滑出去又绕回来，像一个回旋。后面一共四个回滑，先听一遍，再连着刚才的两个下滑整段跟下来。",
  },
  {
    id: "up-run-a",
    title: "上滑连击 · 一",
    focus: ["up-glide"],
    from: 22.75,
    to: 27.35,
    newFrom: 22.9,
    newTo: 27.35,
    concept:
      "接下来是七个连续上滑的“连击段”——每个音都向上挑起，间隔半秒左右。先听它跑一遍，再跟上。",
  },
  {
    id: "up-run-b",
    title: "上滑连击 · 二",
    focus: ["up-glide"],
    from: 27.6,
    to: 30.35,
    newFrom: 27.7,
    newTo: 30.35,
    concept:
      "连击还没停！又是六个上滑，间距更紧了。听听这段的速度，跟不上的话随时再来一遍。",
  },
  {
    id: "down-up",
    title: "下滑转上滑",
    focus: ["down-glide", "up-glide"],
    from: 30.75,
    to: 33.45,
    newFrom: 30.9,
    newTo: 33.45,
    concept:
      "一段下滑接三个上滑——方向又换回来了。连击过后手该热了，跟上新方向。",
  },
  {
    id: "dayin3",
    title: "打音 · 第三段",
    focus: ["dayin"],
    from: 33.5,
    to: 34.9,
    newFrom: 33.7,
    newTo: 34.9,
    concept: "第三次打弓：一段短一些的打音长音，长按住，这次应该已经很熟了。",
  },
  {
    id: "return-down",
    title: "回滑与下滑",
    focus: ["return-glide", "down-glide"],
    from: 35.3,
    to: 37.75,
    newFrom: 35.5,
    newTo: 37.75,
    concept:
      "尾声前的组合：一个回滑，接两个下滑。回旋之后干脆利落地落下——全是学过的动作，跟上不算难。",
  },
  {
    id: "vibrato-end",
    title: "揉弦 · 收尾长音",
    debut: "揉弦长音",
    focus: ["vibrato"],
    from: 37.9,
    to: 38.877,
    newFrom: 38.0,
    newTo: 38.877,
    concept:
      "最后一个音：揉弦长音。手指在弦上均匀揉动，长按住这个音，直到全曲结束——整首《大起板》就练完了！",
    celebrate: "全曲跟练完成！你已经把整首《大起板》的技法全部走了一遍。",
  },
];

// 事件 → 教练音符：time=anchor（判定时刻），长按用录入的 end。
export function eventNote(e) {
  const lane = laneOf(e.technique);
  const hold = Boolean(LANES[lane]?.hold);
  return {
    id: e.id,
    time: e.anchor,
    end: hold ? e.end : undefined,
    lane,
    kind: hold ? "hold" : "technique",
    technique: e.technique,
    label: e.label || LANES[lane].name,
  };
}

// 全曲 41 个教练音符（按 anchor 升序）。
export function coachNotes(song) {
  return trustedHumanEvents(song).map(eventNote);
}

// 落在 [from,to] 窗内、应参与判定的音符（长按以 anchor 计归属）。
export function stageNotes(stage, allNotes) {
  return allNotes.filter(
    (n) => n.time >= stage.from - 1e-6 && n.time <= stage.to + 1e-6,
  );
}

// 本段“新知识点”窗内的音符（概念面板高亮用）。
export function stageNewNotes(stage, allNotes) {
  return allNotes.filter(
    (n) =>
      n.time >= stage.newFrom - 1e-6 && n.time <= stage.newTo + 1e-6,
  );
}

// 阶段涉及的按键轨道（去重，供触摸板/键位提示）。
export function stageLanes(stage, allNotes) {
  const lanes = new Set(stageNotes(stage, allNotes).map((n) => n.lane));
  return [...lanes].sort((a, b) => a - b);
}
