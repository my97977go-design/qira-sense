import { beatGrid } from "../audio/beat.js";
// 5 条点技法轨（D F J K L）+ 3 条长按轨（1 2 3）。
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
    name: "垫指滑音",
    hint: "指间接力滑行",
    color: "#6fb5a2",
    ids: ["dianzhi-glide"],
  },
  {
    key: "L",
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
  // v3：若某区间关联了教师确认的毫秒级事件，直接使用真实事件锚点。
  const confirmedEventsByAnnotation = {};
  for (const e of song.events || [])
    if (
      e.reviewStatus === "confirmed" &&
      (e.timingPrecision === "human-millisecond" ||
        e.timingPrecision === "human-confirmed") &&
      e.annotationId
    )
      (confirmedEventsByAnnotation[e.annotationId] ||= []).push(e);
  const notes = [];
  for (const a of song.annotations.filter((a) => a.enabled !== false)) {
    const lane = laneOf(a.technique);
    if (lane < 0) continue;
    const confirmed = confirmedEventsByAnnotation[a.id];
    const label = a.label.split(" ")[0].replace(/连续.*|四次.*|，.*/g, "");
    if (LANES[lane].hold) {
      // 持续性技法：整段一条长按光条（头 = 起点，尾 = 终点），重在识别不重掐表。
      const spans = confirmed?.length
        ? confirmed.slice().sort((x, y) => x.anchor - y.anchor)
        : [{ anchor: a.start, end: a.end, id: `${a.id}-hold` }];
      spans.forEach((s, i) =>
        notes.push({
          id: s.id,
          time: s.anchor,
          end: s.end ?? a.end,
          lane,
          kind: "hold",
          technique: a.technique,
          label,
          annotationId: a.id,
          eventId: confirmed?.length ? s.id : undefined,
          timingSource: confirmed?.length
            ? "human-millisecond"
            : "manual-interval-span",
          dynamics: a.dynamics,
          indexInAnnotation: i,
        }),
      );
      continue;
    }
    if (confirmed?.length) {
      confirmed
        .sort((x, y) => x.anchor - y.anchor)
        .forEach((e, i) =>
          notes.push({
            id: `${e.id}`,
            time: e.anchor,
            lane,
            kind: "technique",
            technique: e.technique,
            label,
            annotationId: a.id,
            eventId: e.id,
            timingSource: "human-millisecond",
            dynamics: a.dynamics,
            indexInAnnotation: i,
          }),
        );
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
  // Bridge the spaces between gestures. Neutral notes never claim a technique label.
  beats.forEach((time, i) => {
    if (!notes.some((n) => Math.abs(n.time - time) < 0.22))
      notes.push({
        id: `pulse-${i}`,
        time,
        lane: i % 5,
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
