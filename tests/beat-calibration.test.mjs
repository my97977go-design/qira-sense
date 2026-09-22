import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeTaps,
  detectTempoSegments,
  loadCalibration,
} from "../src/game/beatCalibration.js";

// 构造理想打拍序列：bpm 150（周期 0.4s）、首拍相位 0.12s
const grid = (bpm, offset, count, jitter = 0, seed = 1) => {
  const period = 60 / bpm;
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1; // [-1, 1)
  };
  return Array.from(
    { length: count },
    (_, i) => offset + i * period + (jitter ? rand() * jitter : 0),
  );
};

test("analyzeTaps recovers exact bpm and offset from a perfect tap grid", () => {
  const res = analyzeTaps(grid(150, 0.12, 40));
  assert.ok(res);
  assert.equal(res.bpm, 150);
  assert.ok(Math.abs(res.offset - 0.12) < 1e-6);
  assert.equal(res.tapCount, 40);
  assert.equal(res.meanDevMs, 0);
  assert.equal(res.method, "human-tap");
});

test("analyzeTaps tolerates human jitter within ±20ms", () => {
  const res = analyzeTaps(grid(165, 0.09, 60, 0.02));
  assert.ok(res);
  assert.ok(Math.abs(res.bpm - 165) < 1, `bpm=${res.bpm}`);
  assert.ok(Math.abs(res.offset - 0.09) < 0.03, `offset=${res.offset}`);
  assert.ok(res.meanDevMs <= 20);
});

test("analyzeTaps rejects too few taps", () => {
  assert.equal(analyzeTaps(grid(120, 0, 7)), null);
  assert.equal(analyzeTaps([]), null);
});

test("analyzeTaps rejects wildly irregular tapping", () => {
  const taps = [1, 1.9, 2.4, 3.7, 4.1, 5.6, 6.0, 7.8, 8.1, 9.9];
  assert.equal(analyzeTaps(taps), null);
});

test("analyzeTaps rejects tempos outside 30-300 BPM", () => {
  assert.equal(analyzeTaps(grid(20, 0, 20)), null); // 周期 3s
  assert.equal(analyzeTaps(grid(400, 0, 40)), null); // 周期 0.15s
});

test("analyzeTaps is order-insensitive and rounds output", () => {
  const taps = grid(100, 0.25, 30);
  const shuffled = [...taps].reverse();
  const a = analyzeTaps(taps);
  const b = analyzeTaps(shuffled);
  assert.deepEqual(a, b);
  assert.equal(a.bpm, 100);
  assert.ok(Number.isInteger(a.meanDevMs));
  assert.ok(a.taps.every((t) => Number.isFinite(t)));
});

// 构造：前后各 12 拍稳定 0.4s（150 BPM），中段 count 拍改用 segPeriod
const withMiddle = (segPeriod, count, basePeriod = 0.4) => {
  const taps = [0];
  const push = (period, n) => {
    for (let i = 0; i < n; i++) taps.push(taps[taps.length - 1] + period);
  };
  push(basePeriod, 12);
  push(segPeriod, count);
  push(basePeriod, 12);
  return taps;
};

test("detectTempoSegments returns nothing for a steady tempo", () => {
  assert.deepEqual(detectTempoSegments(grid(150, 0.12, 40), 150), []);
});

test("detectTempoSegments records a speeding-up (accel) stretch", () => {
  // 中段 8 拍周期 0.34s ≈ 176 BPM（比 150 快 17%）
  const segs = detectTempoSegments(withMiddle(0.34, 8), 150);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].trend, "accel");
  // 滑窗均值会把段落向两侧各延伸约 2–3 拍，断言放宽到实际行为
  assert.ok(segs[0].start >= 3.5 && segs[0].start <= 4.9);
  assert.ok(segs[0].end >= 7.4 && segs[0].end <= 8.8);
  assert.ok(segs[0].bpm > 155);
});

test("detectTempoSegments records a slowing-down (ritard) stretch", () => {
  // 中段 8 拍周期 0.47s ≈ 128 BPM（比 150 慢 15%）
  const segs = detectTempoSegments(withMiddle(0.47, 8), 150);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].trend, "ritard");
  assert.ok(segs[0].bpm < 145);
});

test("detectTempoSegments needs enough samples and a sane baseline", () => {
  assert.deepEqual(detectTempoSegments(grid(150, 0, 10), 150), []);
  assert.deepEqual(detectTempoSegments(withMiddle(0.34, 8), NaN), []);
  // 中段太短（不足约 3 拍）不算“渐快”
  assert.deepEqual(detectTempoSegments(withMiddle(0.34, 1), 150), []);
});

test("analyzeTaps persists detected accel/ritard segments alongside bpm", () => {
  assert.deepEqual(analyzeTaps(grid(150, 0.12, 40)).segments, []);
  const res = analyzeTaps(withMiddle(0.34, 8));
  assert.ok(res);
  assert.equal(res.segments.length, 1);
  assert.equal(res.segments[0].trend, "accel");
});

test("loadCalibration is safe without localStorage and returns valid data", () => {
  // Node 环境没有 localStorage：不得抛错；内置固化数据为 null 时返回 null，
  // 固化后（beat-builtin.json 回填）则必须返回带合法 bpm/offset 的对象。
  const cal = loadCalibration();
  assert.ok(
    cal === null ||
      (typeof cal.bpm === "number" &&
        cal.bpm >= 30 &&
        cal.bpm <= 300 &&
        typeof cal.offset === "number"),
  );
});
