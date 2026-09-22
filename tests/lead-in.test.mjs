import test from "node:test";
import assert from "node:assert/strict";
import { detectLeadSilence, COUNT_IN_SECONDS } from "../src/audio/leadIn.js";

const buffer = (seconds, fill) => {
  const sr = 44100;
  const data = new Float32Array(Math.round(seconds * sr));
  fill(data, sr);
  return {
    sampleRate: sr,
    numberOfChannels: 1,
    length: data.length,
    duration: seconds,
    getChannelData: () => data,
  };
};

test("count-in is three visible steps and hides zero", () => {
  assert.equal(COUNT_IN_SECONDS, 3);
});

test("detectLeadSilence measures the silence before the first sound", () => {
  const b = buffer(5, (d, sr) => {
    const from = Math.round(0.6 * sr);
    for (let i = from; i < d.length; i++)
      d[i] = 0.4 * Math.sin((i / sr) * 2 * Math.PI * 440);
  });
  const lead = detectLeadSilence(b);
  assert.ok(Math.abs(lead - 0.6) < 0.05, `lead=${lead}`);
});

test("detectLeadSilence returns 0 when sound starts immediately", () => {
  const b = buffer(3, (d, sr) => {
    for (let i = 0; i < d.length; i++)
      d[i] = 0.35 * Math.sin((i / sr) * 2 * Math.PI * 330);
  });
  assert.equal(detectLeadSilence(b), 0);
});

test("detectLeadSilence treats a quiet noise floor as silence-free onset", () => {
  // 极低的底噪之后音乐立即开始：不应把底噪段算成长空白
  const b = buffer(3, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      d[i] = 0.35 * Math.sin((i / sr) * 2 * Math.PI * 330);
      if (i < Math.round(0.1 * sr)) d[i] = 0.0004 * Math.sin(i * 0.7);
    }
  });
  const lead = detectLeadSilence(b);
  assert.ok(lead <= 0.12, `lead=${lead}`);
});

test("detectLeadSilence returns 0 for pure silence", () => {
  const b = buffer(2, () => {});
  assert.equal(detectLeadSilence(b), 0);
});
