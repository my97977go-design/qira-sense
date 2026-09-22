import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { analyzeBeat, beatGrid } from "../src/audio/beat.js";
import {
  makeChart,
  closestNote,
  closestHoldNote,
  judgement,
  judgementHold,
  summarize,
  activeAt,
  LANES,
} from "../src/game/chart.js";
import { validateSong } from "../src/game/data.js";
import { AudioTransport } from "../src/audio/transport.js";
const song = JSON.parse(
  fs.readFileSync(new URL("../src/data/song.json", import.meta.url)),
);
const beat = JSON.parse(
  fs.readFileSync(new URL("../src/data/beat-preview.json", import.meta.url)),
);
const features = JSON.parse(
  fs.readFileSync(new URL("../src/data/features.json", import.meta.url)),
);

test("recording, measurements and manual intervals retain their source identity", () => {
  const bytes = fs.readFileSync(
    new URL("../public/audio/daqiban.wav", import.meta.url),
  );
  assert.equal(
    crypto.createHash("sha256").update(bytes).digest("hex"),
    song.sourceSha256,
  );
  assert.equal(features.sourceSha256, song.sourceSha256);
  assert.equal(song.annotations.length, 13);
  assert.deepEqual(
    song.annotations.map((a) => [a.start, a.end]),
    [
      [1, 2],
      [2, 6],
      [6, 9],
      [10, 13],
      [13, 16],
      [16, 18],
      [21, 22],
      [23, 24],
      [25, 26],
      [26, 27],
      [27, 28],
      [32, 33],
      [34, 35],
    ],
  );
  assert.ok(
    song.annotations.every(
      (a, i) =>
        a.reviewStatus === "confirmed" &&
        a.annotationSource === "human-workbook" &&
        a.source.row === i + 2,
    ),
  );
  assert.equal(song.annotations[6].label, "滑柔");
  assert.equal(song.annotations[12].technique, "return-glide");
});
test("three groups of four preserve all repetitions with honest legacy subdivision provenance", () => {
  const chart = makeChart(song, beat);
  for (const id of ["manual-01", "manual-04", "manual-11"]) {
    const a = song.annotations.find((a) => a.id === id),
      notes = chart.filter((n) => n.annotationId === id);
    assert.equal(notes.length, 4);
    assert.ok(
      notes.every(
        (n) =>
          n.time >= a.start &&
          n.time < a.end &&
          n.timingSource === "legacy-derived-subdivision",
      ),
    );
  }
  assert.equal(chart.filter((n) => n.technique === "dayin").length, 1);
  // 回滑音已转正为点状技法：谱面中出现专属 L 轨音符
  const glideNotes = chart.filter((n) => n.technique === "return-glide");
  assert.ok(glideNotes.length > 0);
  assert.ok(glideNotes.every((n) => LANES[n.lane].key === "L"));
  // 持续性技法整段一条长按光条
  const holds = chart.filter((n) => n.technique === "slide-vibrato");
  assert.equal(holds.length, 4);
  assert.ok(holds.every((n) => n.kind === "hold" && n.end > n.time));
});
test("continuous chart has no answer windows or gaps caused by feedback", () => {
  const chart = makeChart(song, beat);
  assert.ok(chart.length >= 100);
  assert.equal(new Set(chart.map((n) => n.id)).size, chart.length);
  for (let i = 0; i < chart.length; i++) {
    const n = chart[i];
    assert.ok(
      n.time >= 0 && n.time < song.duration && n.lane >= 0 && n.lane < 8,
    );
    if (i) assert.ok(n.time - chart[i - 1].time <= 0.76);
    if (n.kind === "technique" || n.kind === "hold") {
      const a = song.annotations.find((a) => a.id === n.annotationId);
      assert.ok(n.time >= a.start && n.time < a.end);
      if (n.kind === "hold") assert.ok(n.end > n.time && n.end <= a.end + 1e-6);
    } else assert.equal(n.technique, undefined);
  }
  assert.equal(activeAt(song, 6).dynamics, "diminuendo");
  assert.equal(activeAt(song, 20), undefined);
});
test("rhythm means one target per estimated beat, including manual BPM overrides", () => {
  for (const bpm of [60, 82.75, 165.5, 240]) {
    const grid = makeChart(song, { bpm, offset: 0.08 }, "rhythm");
    assert.ok(grid.length > 10);
    for (let i = 1; i < grid.length; i++)
      assert.ok(
        Math.abs(grid[i].time - grid[i - 1].time - 60 / bpm) < 0.000002,
      );
  }
  assert.deepEqual(beatGrid({ bpm: NaN }, 40), []);
});
test("timing uses the correct lane, finds the nearest unresolved note, and never repeats a hit", () => {
  const notes = makeChart(song, beat).filter(
      (n) => n.annotationId === "manual-01",
    ),
    done = {};
  assert.equal(closestNote(notes, done, 1, 1), null);
  for (const note of notes) {
    assert.equal(closestNote(notes, done, note.time, 0).id, note.id);
    done[note.id] = judgement(0);
    assert.equal(closestNote(notes, done, note.time, 0), null);
  }
  for (const d of [-0.07, 0, 0.07]) assert.equal(judgement(d).grade, "perfect");
  assert.equal(judgement(0.18).grade, "good");
  assert.equal(judgement(0.181).grade, "miss");
});
test("hold judgement: half-length hits, near-full perfect, early release misses", () => {
  assert.equal(judgementHold(1.0, 2.0).grade, "good"); // 正好半长
  assert.equal(judgementHold(1.7, 2.0).grade, "perfect"); // 85%
  assert.equal(judgementHold(2.6, 2.0).grade, "perfect"); // 超按 130% 不罚
  assert.equal(judgementHold(3.4, 2.0).grade, "good"); // 超按过多仍算识别成功
  assert.equal(judgementHold(0.9, 2.0).grade, "miss"); // 过早松手
  assert.equal(judgementHold(0, 2.0).grade, "miss");
});
test("hold lanes own hold notes; tap lanes never match them", () => {
  const notes = makeChart(song, beat);
  const hold = notes.find((n) => n.kind === "hold");
  assert.ok(hold);
  assert.equal(LANES[hold.lane].hold, true);
  assert.equal(LANES.filter((l) => l.hold).length, 3);
  assert.equal(LANES.filter((l) => !l.hold).length, 5);
  assert.equal(closestNote(notes, {}, hold.time, hold.lane), null);
  assert.equal(closestHoldNote(notes, {}, hold.time, hold.lane).id, hold.id);
  assert.equal(closestHoldNote(notes, {}, hold.time, 0), null);
  // 点技法音符不会落到长按匹配里
  const tapNote = notes.find((n) => n.kind === "technique");
  assert.equal(closestHoldNote(notes, {}, tapNote.time, tapNote.lane), null);
});
test("misses resolve once and later successful notes build a fresh combo", () => {
  const results = {
    a: { ...judgement(0), combo: 1 },
    b: { ...judgement(Infinity), combo: 0 },
    c: { ...judgement(-0.04), combo: 1 },
  };
  const s = summarize(results, 3);
  assert.equal(s.hits, 2);
  assert.equal(s.miss, 1);
  assert.equal(s.bestCombo, 1);
  assert.equal(s.accuracy, 67);
  assert.equal(s.averageError, 20);
});
test("BPM detection recovers synthetic pulse trains and rejects silence", () => {
  const sr = 22050;
  for (const bpm of [90, 120, 165]) {
    const samples = new Float32Array(sr * 16);
    for (let t = 0.4; t < 16; t += 60 / bpm)
      for (let j = 0; j < 1300 && Math.floor(t * sr) + j < samples.length; j++)
        samples[Math.floor(t * sr) + j] +=
          Math.sin(j * 1.71) * Math.exp(-j / 170);
    const result = analyzeBeat(samples, sr);
    assert.ok(
      Math.abs(result.bpm - bpm) <= 1,
      `${bpm} detected as ${result.bpm}`,
    );
  }
  assert.throws(() => analyzeBeat(new Float32Array(sr * 3), sr), /节奏信息/);
});
test("import rejects wrong audio, old drafts, duplicate IDs, invalid intervals and bad events", () => {
  const valid = structuredClone(song);
  valid.audio = "https://example.com/other.wav";
  assert.equal(validateSong(valid).audio, song.audio);
  for (const change of [
    (s) => (s.sourceSha256 = "bad"),
    (s) => (s.schemaVersion = 1),
    (s) => (s.annotations[1].id = s.annotations[0].id),
    (s) => (s.annotations[0].start = -1),
    (s) => (s.annotations[0].repeatCount = 99),
    (s) => (s.annotations[0].id = "constructor"),
    (s) => (s.annotations[0].technique = "invented"),
    (s) =>
      ((s.schemaVersion = 3),
      (s.events = [{ id: "e1", technique: "invented", anchor: 1 }])),
    (s) =>
      ((s.schemaVersion = 3),
      (s.events = [{ id: "e1", technique: "vibrato", anchor: 9999 }])),
    (s) =>
      ((s.schemaVersion = 3),
      (s.events = [
        { id: "e1", technique: "vibrato", anchor: 1 },
        { id: "e1", technique: "dayin", anchor: 2 },
      ])),
    (s) =>
      ((s.schemaVersion = 3),
      (s.events = [
        {
          id: "e1",
          technique: "vibrato",
          anchor: 1,
          annotationId: "does-not-exist",
        },
      ])),
  ]) {
    const s = structuredClone(song);
    change(s);
    assert.throws(() => validateSong(s));
  }
});
test("v3: same-layer overlap is a warning, cross-layer overlap is fine, v2 auto-migrates", () => {
  const overlapped = structuredClone(song);
  overlapped.schemaVersion = 3;
  overlapped.annotations[1].start = 1.5; // manual-02 与 manual-01 同层重叠
  const result = validateSong(overlapped);
  assert.ok(result.validationWarnings.length >= 1);
  assert.equal(result.validationWarnings[0].code, "overlap");
  // 跨层重叠不产生 warning。
  const cross = structuredClone(song);
  cross.schemaVersion = 3;
  cross.annotations[1].layer = "expression";
  cross.annotations[1].start = 1.5;
  assert.equal(validateSong(cross).validationWarnings.length, 0);
  // v2 输入自动迁移为 v3，事件表为空，不伪造毫秒事件。
  const v2 = structuredClone(song);
  v2.schemaVersion = 2;
  delete v2.events;
  const migrated = validateSong(v2);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.events, []);
  assert.ok(migrated.annotations.every((a) => a.layer === "technique"));
});
test("confirmed millisecond events replace legacy subdivision in the chart", () => {
  const v3 = structuredClone(song);
  v3.schemaVersion = 3;
  v3.events = [
    {
      id: "evt-a",
      annotationId: "manual-01",
      technique: "up-glide",
      anchor: 1.234,
      timingPrecision: "human-millisecond",
      reviewStatus: "confirmed",
    },
    {
      id: "evt-b",
      annotationId: "manual-01",
      technique: "up-glide",
      anchor: 1.7,
      timingPrecision: "human-millisecond",
      reviewStatus: "confirmed",
    },
    {
      id: "evt-c",
      annotationId: "manual-01",
      technique: "up-glide",
      anchor: 1.9,
      timingPrecision: "legacy-derived-subdivision",
      reviewStatus: "confirmed",
    },
  ];
  const clean = validateSong(v3);
  const notes = makeChart(clean, beat).filter(
    (n) => n.annotationId === "manual-01",
  );
  assert.equal(notes.length, 2);
  assert.ok(notes.every((n) => n.timingSource === "human-millisecond"));
  assert.deepEqual(
    notes.map((n) => n.time),
    [1.234, 1.7],
  );
});
function fake() {
  const t = new AudioTransport(),
    sources = [];
  t.buffer = { duration: song.duration };
  t.gain = {};
  t.context = {
    currentTime: 10,
    resume: async () => {},
    createBufferSource: () => {
      const s = {
        playbackRate: { value: 1 },
        connect() {},
        disconnect() {},
        stop() {
          this.stopped = true;
        },
        start(...args) {
          this.args = args;
        },
      };
      sources.push(s);
      return s;
    },
  };
  return { t, sources };
}
test("pausing during countdown preserves the remaining count-in and audio starts once", async () => {
  const { t, sources } = fake();
  t.play(0, 2.5);
  t.context.currentTime += 0.5;
  t.pause();
  assert.equal(t.time, -2);
  t.context.currentTime += 30;
  assert.equal(t.time, -2);
  await t.resume();
  assert.equal(sources[1].args[1], 0);
  t.context.currentTime += 2.15;
  assert.ok(Math.abs(t.time) < 1e-8);
});
test("pause freezes the audio clock; resume and late onended callbacks cannot finish another run", async () => {
  const { t, sources } = fake();
  t.play();
  const old = sources[0].onended;
  t.context.currentTime += 4;
  t.pause();
  assert.equal(t.time, 4);
  t.context.currentTime += 10;
  assert.equal(t.time, 4);
  await t.resume();
  t.context.currentTime += 0.15;
  assert.ok(Math.abs(t.time - 4) < 1e-8);
  old();
  assert.equal(t.phase, "playing");
  t.stop();
  assert.equal(t.time, 0);
  assert.equal(t.phase, "idle");
});
