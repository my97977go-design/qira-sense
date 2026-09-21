import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  selectOfficialEvents,
  scoreFinalTest,
} from "../src/learning/finalTest.js";
import {
  FINAL_TECHNIQUES,
  FINAL_TEST_TOLERANCE_MS,
} from "../src/learning/learningConfig.js";

const song = JSON.parse(
  fs.readFileSync(new URL("../src/data/song.json", import.meta.url)),
);
song.schemaVersion = 3;
song.events = [];

test("selectOfficialEvents only trusts confirmed human-millisecond events", () => {
  const base = structuredClone(song);
  // 没有事件 → 非正式，列出全部缺失技法。
  const none = selectOfficialEvents(base);
  assert.equal(none.official, false);
  assert.deepEqual(none.missingTechniques, FINAL_TECHNIQUES);
  // 只有 needs-review / legacy 事件 → 仍非正式。
  base.events = [
    {
      id: "e1",
      technique: "vibrato",
      anchor: 2,
      timingPrecision: "human-millisecond",
      reviewStatus: "needs-review",
      annotationId: null,
    },
    {
      id: "e2",
      technique: "dayin",
      anchor: 25,
      timingPrecision: "legacy-derived-subdivision",
      reviewStatus: "confirmed",
      annotationId: null,
    },
  ];
  assert.equal(selectOfficialEvents(base).official, false);
  // 加入确认的毫秒级事件 → 正式，缺失技法正确更新。
  base.events.push({
    id: "e3",
    technique: "up-glide",
    anchor: 1.2,
    timingPrecision: "human-millisecond",
    reviewStatus: "confirmed",
    annotationId: null,
  });
  const official = selectOfficialEvents(base);
  assert.equal(official.official, true);
  assert.equal(official.events.length, 1);
  assert.ok(!official.missingTechniques.includes("up-glide"));
  assert.ok(official.missingTechniques.includes("vibrato"));
  // 关联已禁用区间的事件被排除。
  const disabled = structuredClone(base);
  disabled.annotations[0].enabled = false;
  disabled.events.push({
    id: "e4",
    technique: "down-glide",
    anchor: 1.5,
    timingPrecision: "human-millisecond",
    reviewStatus: "confirmed",
    annotationId: disabled.annotations[0].id,
  });
  assert.equal(selectOfficialEvents(disabled).events.length, 1);
});

test("scoreFinalTest matches events within tolerance and computes P/R/F1", () => {
  const events = [
    { id: "a", technique: "up-glide", anchor: 1.0 },
    { id: "b", technique: "vibrato", anchor: 5.0 },
    { id: "c", technique: "dayin", anchor: 25.0 },
  ];
  const tol = FINAL_TEST_TOLERANCE_MS;
  assert.equal(tol, 180);
  // 完美作答：3 TP，P=R=F1=1。
  const perfect = scoreFinalTest(
    [
      { time: 1.05, technique: "up-glide" },
      { time: 4.9, technique: "vibrato" },
      { time: 25.1, technique: "dayin" },
    ],
    events,
    tol,
  );
  assert.equal(perfect.tp, 3);
  assert.equal(perfect.fp, 0);
  assert.equal(perfect.fn, 0);
  assert.equal(perfect.misclassified, 0);
  assert.equal(perfect.overall.f1, 1);
  // 超出容差 → 漏检 + 误报。
  const late = scoreFinalTest(
    [{ time: 1.0 + (tol + 10) / 1000, technique: "up-glide" }],
    events,
    tol,
  );
  assert.equal(late.tp, 0);
  assert.equal(late.fn, 3);
  assert.equal(late.fp, 1);
  assert.equal(late.overall.precision, 0);
  assert.equal(late.overall.recall, 0);
  assert.equal(late.overall.f1, null);
  // 技法错误 → 误分类，计入事件技法的 misclassified 与作答技法的 fp。
  const wrong = scoreFinalTest(
    [
      { time: 1.0, technique: "down-glide" },
      { time: 5.0, technique: "vibrato" },
      { time: 25.0, technique: "dayin" },
    ],
    events,
    tol,
  );
  assert.equal(wrong.tp, 2);
  assert.equal(wrong.misclassified, 1);
  assert.equal(wrong.perTechnique["up-glide"].misclassified, 1);
  assert.equal(wrong.perTechnique["down-glide"].fp, 1);
  // 一个响应只匹配一个事件（不重复计分）。
  const dup = scoreFinalTest(
    [
      { time: 1.0, technique: "up-glide" },
      { time: 1.02, technique: "up-glide" },
    ],
    [
      { id: "a", technique: "up-glide", anchor: 1.0 },
      { id: "b", technique: "up-glide", anchor: 1.05 },
    ],
    tol,
  );
  assert.equal(dup.tp, 2);
  assert.equal(dup.fp, 0);
});
