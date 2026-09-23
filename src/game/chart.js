import { beatGrid } from "../audio/beat.js";
import { isHumanEvent } from "../learning/learningConfig.js";
// 4 条点技法轨（D F J K）+ 3 条长按轨（1 2 3）。
// 点技法：瞬时动作，到达判定线时点按；长按技法：持续状态，光条带长度，按住即可。
export const LANES = [
  {
    key: "D",
    name: "上滑",
    hint: "向上抵达",
    color: "#efbb79",
    ids: ["up-glide", "large-up-glide"],
  },
  {
    key: "F",
    name: "下滑",
    hint: "落下回转",
    color: "#8ac7cf",
    ids: ["down-glide", "large-down-glide"],
  },
  {
    key: "J",
    name: "弓法",
    hint: "抛弓与垫弓",
    color: "#b8c88c",
    ids: ["paogong", "dianbow"],
  },
  {
    key: "K",
    name: "回滑",
    hint: "滑去又回",
    color: "#9ccdd8",
    ids: ["return-glide"],
  },
  {
    key: "1",
    name: "揉弦",
    hint: "按住长音",
    color: "#bcb4e6",
    ids: ["vibrato"],
    hold: true,
  },
  {
    key: "2",
    name: "滑揉",
    hint: "按住滑动",
    color: "#a7c8ac",
    ids: ["slide-vibrato"],
    hold: true,
  },
  {
    key: "3",
    name: "打音",
    hint: "按住触点",
    color: "#f29583",
    ids: ["dayin"],
    hold: true,
  },
];
export const HIT_WINDOW = 0.18;
export const laneOf = (id) => LANES.findIndex((l) => l.ids.includes(id));
export const activeAt = (song, time) =>
  song.annotations.find(
    (a) => a.enabled !== false && time >= a.start && time < a.end,
  );
// 被采信的教师人工事件（打完即生效），按锚点排序；挂到已禁用区间的事件剔除。
export function trustedHumanEvents(song) {
  const enabledIds = new Set(
    song.annotations.filter((a) => a.enabled !== false).map((a) => a.id),
  );
  return (song.events || [])
    .filter(
      (e) =>
        isHumanEvent(e) &&
        laneOf(e.technique) >= 0 &&
        (!e.annotationId || enabledIds.has(e.annotationId)),
    )
    .sort((a, b) => a.anchor - b.anchor);
}
// 当前时间的活动技法层：事件优先（人工打点即生效），事件层为空时回退区间层。
// 返回对象兼容旧 activeAt 字段：technique / start / end / dynamics / repeatCount。
export function activeLayerAt(song, time) {
  const events = trustedHumanEvents(song);
  if (events.length) {
    const byId = new Map(
      song.annotations.filter((a) => a.enabled !== false).map((a) => [a.id, a]),
    );
    for (const e of events) {
      const start = Number.isFinite(e.start) ? e.start : e.anchor;
      // 点状事件给出约半秒的展示活动窗；长按事件用录入的起止。
      const end = Number.isFinite(e.end) ? e.end : start + 0.5;
      if (time >= start && time < end) {
        const a = e.annotationId ? byId.get(e.annotationId) : null;
        return {
          source: "event",
          id: e.id,
          technique: e.technique,
          label: e.label || (a ? a.label : LANES[laneOf(e.technique)].name),
          start,
          end,
          dynamics: a ? a.dynamics : "steady",
          repeatCount: 1,
        };
      }
    }
    return undefined;
  }
  return activeAt(song, time);
}
export function makeChart(song, beat, mode = "challenge") {
  const beats = beatGrid(beat, song.duration);
  if (mode === "rhythm")
    // 一拍按一下：跟随音乐的每一次脉搏触碰。
    return beats.map((time, i) => ({
      id: `beat-${i}`,
      time,
      lane: 0,
      kind: "beat",
      label: "拍",
      index: i,
    }));
  // v3：人工打点即生效——只要存在被采信的事件，谱面完全由事件层驱动；
  // 事件层为空（例如刚从 v2 迁移、尚未标注）时才回退到秒级区间编排。
  const annotations = song.annotations.filter((a) => a.enabled !== false);
  const trusted = trustedHumanEvents(song);
  const notes = [];
  if (trusted.length) {
    const byId = new Map(annotations.map((a) => [a.id, a]));
    const counters = new Map();
    for (const e of trusted) {
      const lane = laneOf(e.technique);
      const a = e.annotationId ? byId.get(e.annotationId) : null;
      const label =
        e.label ||
        (a
          ? a.label.split(" ")[0].replace(/连续.*|四次.*|，.*/g, "")
          : LANES[lane].name);
      const key = e.annotationId || "__orphan__";
      const i = counters.get(key) || 0;
      counters.set(key, i + 1);
      if (LANES[lane].hold) {
        // 持续性技法：事件录入的起止即长按光条的头尾。
        notes.push({
          id: e.id,
          time: e.anchor,
          end: Number.isFinite(e.end) ? e.end : a ? a.end : e.anchor,
          lane,
          kind: "hold",
          technique: e.technique,
          label,
          annotationId: a ? a.id : null,
          eventId: e.id,
          timingSource: e.timingPrecision,
          dynamics: a ? a.dynamics : "steady",
          indexInAnnotation: i,
        });
      } else {
        notes.push({
          id: e.id,
          time: e.anchor,
          lane,
          kind: "technique",
          technique: e.technique,
          label,
          annotationId: a ? a.id : null,
          eventId: e.id,
          timingSource: e.timingPrecision,
          dynamics: a ? a.dynamics : undefined,
        });
      }
    }
  } else {
    for (const a of annotations) {
      const lane = laneOf(a.technique);
      if (lane < 0) continue;
      const label = a.label.split(" ")[0].replace(/连续.*|四次.*|，.*/g, "");
      if (LANES[lane].hold) {
        // 持续性技法：整段一条长按光条（头 = 起点，尾 = 终点），重在识别不重掐表。
        notes.push({
          id: `${a.id}-hold`,
          time: a.start,
          end: a.end,
          lane,
          kind: "hold",
          technique: a.technique,
          label,
          annotationId: a.id,
          timingSource: "manual-interval-span",
          dynamics: a.dynamics,
          indexInAnnotation: 0,
        });
        continue;
      }
      let times;
      if (a.repeatCount > 1)
        times = Array.from(
          { length: a.repeatCount },
          (_, i) => a.start + (i * (a.end - a.start)) / a.repeatCount,
        );
      else times = [a.start];
      times.forEach((time, i) =>
        notes.push({
          id: `${a.id}-${i}`,
          time,
          lane,
          kind: "technique",
          technique: a.technique,
          label,
          annotationId: a.id,
          timingSource:
            a.repeatCount > 1
              ? "legacy-derived-subdivision"
              : "manual-interval-start",
          dynamics: a.dynamics,
        }),
      );
    }
  }
  // Bridge the spaces between gestures. Neutral notes never claim a technique label.
  beats.forEach((time, i) => {
    if (!notes.some((n) => Math.abs(n.time - time) < 0.22))
      notes.push({
        id: `pulse-${i}`,
        time,
        lane: i % 4,
        kind: "beat",
        label: "节拍",
        timingSource: "estimated-beat",
      });
  });
  return notes
    .sort((a, b) => a.time - b.time)
    .map((n, index) => ({ ...n, index }));
}
export function closestNote(notes, results, time, lane) {
  let found = null;
  for (const n of notes)
    if (
      n.lane === lane &&
      n.kind !== "hold" &&
      !results[n.id] &&
      Math.abs(n.time - time) <= HIT_WINDOW + 1e-8 &&
      (!found || Math.abs(n.time - time) < Math.abs(found.time - time))
    )
      found = n;
  return found;
}
// 长按音符：只匹配长按轨上未结算的光条头部。
export function closestHoldNote(notes, results, time, lane) {
  let found = null;
  for (const n of notes)
    if (
      n.lane === lane &&
      n.kind === "hold" &&
      !results[n.id] &&
      Math.abs(n.time - time) <= HIT_WINDOW + 1e-8 &&
      (!found || Math.abs(n.time - time) < Math.abs(found.time - time))
    )
      found = n;
  return found;
}
export function judgement(delta) {
  const d = Math.abs(delta);
  if (d <= 0.07 + 1e-8)
    return {
      grade: "perfect",
      label: "PERFECT",
      points: 1000,
      success: true,
      delta,
    };
  if (d <= HIT_WINDOW + 1e-8)
    return { grade: "good", label: "GOOD", points: 600, success: true, delta };
  return { grade: "miss", label: "MISS", points: 0, success: false, delta };
}
// 长按判定：识别正确为前提，按住达到光条一半即 GOOD，
// 接近整长（80%–140%）为 PERFECT；过早松手 MISS。不惩罚适度超按。
export function judgementHold(holdSec, len) {
  const delta = holdSec - len;
  if (holdSec >= len * 0.8 && holdSec <= len * 1.4)
    return {
      grade: "perfect",
      label: "PERFECT",
      points: 1000,
      success: true,
      delta,
    };
  if (holdSec >= len * 0.5)
    return { grade: "good", label: "GOOD", points: 600, success: true, delta };
  return { grade: "miss", label: "MISS", points: 0, success: false, delta };
}
export function summarize(results, total) {
  const values = Object.values(results),
    hits = values.filter((r) => r.success);
  return {
    score: values.reduce((s, r) => s + r.points, 0),
    accuracy: total ? Math.round((hits.length / total) * 100) : 0,
    hits: hits.length,
    total,
    perfect: values.filter((r) => r.grade === "perfect").length,
    miss: values.filter((r) => r.grade === "miss").length,
    bestCombo: Math.max(0, ...values.map((r) => r.combo || 0)),
    averageError: hits.length
      ? Math.round(
          hits.reduce((s, r) => s + Math.abs(r.delta) * 1000, 0) / hits.length,
        )
      : 0,
  };
}
