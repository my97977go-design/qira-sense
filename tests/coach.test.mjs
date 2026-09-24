import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { laneOf } from "../src/game/chart.js";
import {
  COACH_STAGES,
  COACH_PASS_AT,
  coachNotes,
  stageNotes,
  stageNewNotes,
} from "../src/game/coachStages.js";

const song = JSON.parse(
  fs.readFileSync(new URL("../src/data/song.json", import.meta.url)),
);

test("coachNotes：41 个采信事件全部转成教练音符", () => {
  assert.equal(song.annotations.length, 13);
  const notes = coachNotes(song);
  assert.equal(notes.length, 41);
  // 锚点升序、id 唯一
  for (let i = 1; i < notes.length; i++)
    assert.ok(notes[i].time >= notes[i - 1].time);
  assert.equal(new Set(notes.map((n) => n.id)).size, 41);
  // 长按轨恰好 4 个：3 段打音 + 1 个揉弦收尾，且都带 end
  const holds = notes.filter((n) => n.kind === "hold");
  assert.equal(holds.length, 4);
  assert.deepEqual(
    holds.map((n) => n.technique),
    ["dayin", "dayin", "dayin", "vibrato"],
  );
  for (const h of holds) assert.ok(h.end > h.time);
});

test("14 阶段：窗口合法、通过率常量存在", () => {
  assert.equal(COACH_STAGES.length, 14);
  assert.equal(COACH_PASS_AT, 0.6);
  for (const s of COACH_STAGES) {
    assert.ok(s.from <= s.newFrom && s.newTo <= s.to, s.id);
    assert.ok(s.title && s.concept, s.id);
    for (const f of s.focus) assert.ok(laneOf(f) >= 0, `${s.id}:${f}`);
  }
});

test("各阶段练习音符数与数据表设计一致（累计复习 + 新增）", () => {
  const notes = coachNotes(song);
  const expectedPractice = [4, 5, 6, 2, 7, 1, 2, 6, 7, 6, 4, 1, 3, 1];
  const expectedNew = [4, 1, 1, 2, 4, 1, 2, 4, 7, 6, 4, 1, 3, 1];
  assert.deepEqual(
    COACH_STAGES.map((s) => stageNotes(s, notes).length),
    expectedPractice,
  );
  assert.deepEqual(
    COACH_STAGES.map((s) => stageNewNotes(s, notes).length),
    expectedNew,
  );
  // 新知识点窗合计恰好无遗漏、无重叠地覆盖全部 41 个音符
  const covered = COACH_STAGES.flatMap((s) => stageNewNotes(s, notes).map((n) => n.id));
  assert.equal(new Set(covered).size, 41);
  assert.deepEqual(
    new Set(covered),
    new Set(notes.map((n) => n.id)),
  );
});

test("难点段：上滑紧接下滑（间隔 <0.2s），配自动重播 drill", () => {
  const notes = coachNotes(song);
  const drill = COACH_STAGES.find((s) => s.drill);
  assert.ok(drill, "存在带 drill 的难点段");
  const inStage = stageNotes(drill, notes);
  assert.equal(inStage.length, 2);
  assert.deepEqual(
    inStage.map((n) => n.technique),
    ["up-glide", "down-glide"],
  );
  assert.ok(inStage[1].time - inStage[0].time < 0.2);
  assert.equal(drill.drill.reps, 4);
});

test("对照段：下滑 vs 回滑左右试听窗各自含对应技件事件", () => {
  const notes = coachNotes(song);
  const cmp = COACH_STAGES.find((s) => s.compare);
  assert.ok(cmp, "存在 compare 阶段");
  for (const side of ["left", "right"]) {
    const c = cmp.compare[side];
    assert.equal(c.technique, side === "left" ? "down-glide" : "return-glide");
    assert.ok(c.to > c.from && c.from >= 0 && c.to <= song.duration, side);
    // 试听窗内必须真的有该技法的事件（回滑试听允许超出本段练习窗）
    assert.ok(
      notes.some(
        (n) => n.technique === c.technique && n.time >= c.from && n.time <= c.to,
      ),
      `${side} 窗内应含 ${c.technique} 事件`,
    );
  }
});

test("前半庆祝与收尾庆祝各就位", () => {
  const celebrate = COACH_STAGES.filter((s) => s.celebrate).map((s) => s.id);
  assert.deepEqual(celebrate, ["dayin2", "vibrato-end"]);
  // 最后一阶段窗覆盖到曲尾
  const last = COACH_STAGES[COACH_STAGES.length - 1];
  assert.ok(last.to >= song.duration - 0.01);
});
