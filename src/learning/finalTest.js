import { FINAL_TECHNIQUES, FINAL_TEST_TOLERANCE_MS } from "./learningConfig.js";

// Final Test 只使用教师确认的毫秒级事件作为正式答案。
// 返回 { events, official, missingTechniques }：
// official=false 表示当前数据不足以正式计分，页面应降级为演示模式。
export function selectOfficialEvents(song) {
  const enabledIds = new Set(
    song.annotations.filter((a) => a.enabled !== false).map((a) => a.id),
  );
  const events = (song.events || [])
    .filter(
      (e) =>
        e.reviewStatus === "confirmed" &&
        e.timingPrecision === "human-millisecond" &&
        (!e.annotationId || enabledIds.has(e.annotationId)),
    )
    .sort((a, b) => a.anchor - b.anchor);
  const covered = new Set(events.map((e) => e.technique));
  const missingTechniques = FINAL_TECHNIQUES.filter((t) => !covered.has(t));
  return { events, official: events.length > 0, missingTechniques };
}

// 事件级匹配评分：±tolerance 内贪心最近匹配。
// TP = 技法正确；misclassified = 有响应但技法错误；FP = 无匹配响应；FN = 未响应事件。
export function scoreFinalTest(responses, events, toleranceMs = FINAL_TEST_TOLERANCE_MS) {
  const tol = toleranceMs / 1000;
  const matches = []; // { event, response | null, delta }
  const used = new Set();
  // 每个事件找容差内最近的未用响应（贪心，按时间顺序）。
  for (const e of events) {
    let best = null;
    for (const r of responses) {
      if (used.has(r)) continue;
      const d = Math.abs(r.time - e.anchor);
      if (d <= tol && (!best || d < Math.abs(best.time - e.anchor))) best = r;
    }
    if (best) used.add(best);
    matches.push({ event: e, response: best, delta: best ? best.time - e.anchor : null });
  }
  const perTechnique = {};
  for (const t of FINAL_TECHNIQUES)
    perTechnique[t] = { tp: 0, misclassified: 0, fp: 0, fn: 0 };
  let tp = 0,
    misclassified = 0,
    fn = 0;
  for (const m of matches) {
    if (!m.response) {
      fn++;
      perTechnique[m.event.technique].fn++;
    } else if (m.response.technique === m.event.technique) {
      tp++;
      perTechnique[m.event.technique].tp++;
    } else {
      misclassified++;
      perTechnique[m.event.technique].misclassified++;
      perTechnique[m.response.technique].fp++;
    }
  }
  const fp = responses.length - used.size;
  for (const r of responses) if (!used.has(r)) perTechnique[r.technique].fp++;
  const metric = (p) => {
    const precision = p.tp + p.fp ? p.tp / (p.tp + p.fp) : null;
    const recall = p.tp + p.fn ? p.tp / (p.tp + p.fn) : null;
    const f1 =
      precision != null && recall != null && precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : null;
    return { ...p, precision, recall, f1 };
  };
  const overall = metric({
    tp,
    misclassified,
    fp,
    fn,
  });
  return {
    matches,
    tp,
    misclassified,
    fp,
    fn,
    overall,
    perTechnique: Object.fromEntries(
      Object.entries(perTechnique).map(([t, p]) => [t, metric(p)]),
    ),
  };
}
