import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { estimatePitch } from "../src/audio/pitch.js";
import { validateLibrary } from "../src/knowledge/store.js";
import {
  chapterUnlocked,
  recordCompletion,
  validProgress,
  isUnlocked,
} from "../src/course/progress.js";
const library = JSON.parse(
  fs.readFileSync(new URL("../src/data/techniques.json", import.meta.url)),
);
const song = JSON.parse(
  fs.readFileSync(new URL("../src/data/song.json", import.meta.url)),
);
test("pitch tracks known fundamentals and rejects silence and deterministic noise", () => {
  for (const rate of [44100, 48000])
    for (const frequency of [110, 220, 440, 880, 1760]) {
      const frame = Float32Array.from(
        { length: 4096 },
        (_, i) =>
          0.3 * Math.sin((2 * Math.PI * frequency * i) / rate) +
          0.12 * Math.sin((4 * Math.PI * frequency * i) / rate),
      );
      const measured = estimatePitch(frame, rate);
      assert.ok(
        Math.abs(measured.pitch - frequency) / frequency < 0.015,
        `${frequency}: ${measured.pitch}`,
      );
      assert.ok(measured.confidence > 0.9);
    }
  assert.equal(estimatePitch(new Float32Array(4096), 44100).pitch, null);
  let seed = 17;
  const noise = Float32Array.from({ length: 4096 }, () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  });
  assert.equal(estimatePitch(noise, 44100).pitch, null);
});
test("library examples reference actual annotations; conceptual large glide never relabels recording", () => {
  const checked = validateLibrary(library);
  assert.equal(checked.entries.length, 10);
  for (const t of checked.entries)
    for (const example of t.examples) {
      assert.equal(example.songId, song.id);
      for (const id of example.annotationIds)
        assert.ok(song.annotations.some((a) => a.id === id));
    }
  assert.equal(
    checked.entries.find((t) => t.id === "large-up-glide").examples.length,
    0,
  );
  for (const mutate of [
    (l) => (l.entries[0].shortExplanation = ""),
    (l) => (l.entries[0].animation = "made-up"),
    (l) => (l.entries[1].id = l.entries[0].id),
    (l) =>
      (l.entries[0].examples = [{ songId: song.id, annotationIds: "bad" }]),
  ]) {
    const copy = structuredClone(library);
    mutate(copy);
    assert.throws(() => validateLibrary(copy));
  }
});
test("all four entries open immediately; chapter completes only via passing Final Test", () => {
  let p = {};
  // 四入口与提示挑战全部直接进入，无前置条件。
  for (const id of ["rhythm", "soundMap", "learning", "finalTest", "challenge"])
    assert.equal(isUnlocked(id, p), true);
  // 未通过 Final Test 时，后续章节不解锁。
  assert.equal(chapterUnlocked("timbre", p), false);
  // 完成节奏热身不解锁下一章（不再是章节完成的条件）。
  p = recordCompletion(p, "rhythm", { accuracy: 80 });
  assert.equal(p.rhythm.completed, true);
  assert.equal(chapterUnlocked("timbre", p), false);
  // 演示模式（未通过）的 Final Test 不算完成。
  p = recordCompletion(p, "finalTest", { passed: false, f1: 0.4, accuracy: 40 });
  assert.equal(p.finalTest.completed, false);
  assert.equal(chapterUnlocked("timbre", p), false);
  // 通过 Final Test（official，F1 达标）→ 本章完成，解锁下一章。
  p = recordCompletion(p, "finalTest", {
    passed: true,
    f1: 0.78,
    accuracy: 78,
    official: true,
  });
  assert.equal(p.finalTest.completed, true);
  assert.equal(p.finalTest.f1, 0.78);
  assert.equal(chapterUnlocked("timbre", p), true);
  assert.equal(chapterUnlocked("expression", p), false);
  assert.equal(chapterUnlocked("invented", p), false);
  assert.deepEqual(validProgress(JSON.parse(JSON.stringify(p))), p);
});
test("legacy three-lesson progress still loads and old completions are preserved", () => {
  let p = recordCompletion(
    {},
    "perform",
    { accuracy: 75 },
    "音高上滑使乐句更有推动力",
  );
  assert.equal(p.perform.completed, true);
  p = recordCompletion(p, "pulse", { accuracy: 49 });
  assert.ok(!p.pulse.completed);
  p = recordCompletion(p, "pulse", { accuracy: 50 });
  assert.equal(p.pulse.completed, true);
  p = recordCompletion(p, "recognize", { hits: 2, total: 3, accuracy: 67 });
  assert.ok(!p.recognize.completed);
  p = recordCompletion(p, "recognize", { hits: 3, total: 3, accuracy: 100 });
  assert.equal(p.recognize.completed, true);
  const restored = validProgress(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored, p);
  // 旧进度不含 finalTest，章节仍未完成。
  assert.equal(chapterUnlocked("timbre", p), false);
});
