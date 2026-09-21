import { beatGrid } from "../audio/beat.js";
export const LANES = [
  {
    key: "D",
    name: "上滑",
    hint: "向上抵达",
    color: "#efbb79",
    ids: ["up-glide"],
  },
  {
    key: "F",
    name: "下滑 / 回滑",
    hint: "落下与回转",
    color: "#8ac7cf",
    ids: ["down-glide", "return-glide"],
  },
  {
    key: "J",
    name: "揉弦 / 滑柔",
    hint: "音高的起伏",
    color: "#bcb4e6",
    ids: ["vibrato", "slide-vibrato"],
  },
  {
    key: "K",
    name: "打音",
    hint: "短促的触碰",
    color: "#f29583",
    ids: ["dayin"],
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
    return beats
      .filter((_, i) => i % 2 === 0)
      .map((time, i) => ({
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
            label: a.label.split(" ")[0].replace(/连续.*|四次.*|，.*/g, ""),
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
    else if (a.technique === "vibrato") {
      times = beats.filter((t) => t >= a.start && t < a.end);
      if (!times.length) times = [a.start];
    } else times = [a.start];
    times.forEach((time, i) =>
      notes.push({
        id: `${a.id}-${i}`,
        time,
        lane,
        kind: "technique",
        technique: a.technique,
        label: a.label.split(" ")[0].replace(/连续.*|四次.*|，.*/g, ""),
        annotationId: a.id,
        timingSource:
          a.repeatCount > 1
            ? "legacy-derived-subdivision"
            : a.technique === "vibrato"
              ? "estimated-beat-in-manual-interval"
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
