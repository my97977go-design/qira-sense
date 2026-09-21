import { useState } from "react";
import { LEARNER_KEY, FINAL_TECHNIQUES } from "./learningConfig.js";
import samplesData from "../data/samples.json";

// 自适应技法学习的学习者状态。纯本地持久化，绝不提交排行榜。
const blank = () => ({
  schemaVersion: 1,
  techniques: Object.fromEntries(
    FINAL_TECHNIQUES.map((t) => [t, { attempts: 0, correct: 0 }]),
  ),
  confusion: {}, // "真实>误选": count
  log: [], // 最近的作答记录
  lastSampleId: null,
});
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(LEARNER_KEY));
    if (v?.schemaVersion !== 1) return blank();
    return {
      ...blank(),
      ...v,
      techniques: { ...blank().techniques, ...(v.techniques || {}) },
      confusion: v.confusion || {},
      log: Array.isArray(v.log) ? v.log.slice(-200) : [],
    };
  } catch {
    return blank();
  }
}

// 弱项权重 = 1 - 正确率（未作答视为最弱）。
export function weaknessWeight(state, technique) {
  const t = state.techniques[technique];
  if (!t || !t.attempts) return 1;
  return 1 - t.correct / t.attempts;
}

// 选题：按弱项权重挑技法 → 在对应样本中避免紧邻重复同一 sample。
export function nextQuestion(state, samples) {
  const pool = samples.filter((s) => s.kind === "contextual" || s.kind === "canonical");
  if (!pool.length) return null;
  const byTechnique = {};
  for (const s of pool) (byTechnique[s.technique] ||= []).push(s);
  const techniques = Object.keys(byTechnique);
  const weighted = techniques.map((t) => ({
    t,
    w: weaknessWeight(state, t) + 0.08,
  }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  let technique = techniques[0];
  for (const x of weighted) {
    r -= x.w;
    if (r <= 0) {
      technique = x.t;
      break;
    }
  }
  let candidates = byTechnique[technique];
  const fresh = candidates.filter((s) => s.id !== state.lastSampleId);
  if (fresh.length) candidates = fresh;
  const sample = candidates[Math.floor(Math.random() * candidates.length)];
  // 干扰项：优先选有混淆史的技法。
  const distractors = FINAL_TECHNIQUES.filter((t) => t !== technique)
    .map((t) => ({
      t,
      w: (state.confusion[`${technique}>${t}`] || 0) + 1,
    }))
    .sort((a, b) => b.w - a.w || Math.random() - 0.5)
    .slice(0, 2)
    .map((x) => x.t);
  const choices = [technique, ...distractors].sort(() => Math.random() - 0.5);
  return { sample, answer: technique, choices };
}

export default function useLearner() {
  const [state, setState] = useState(load);
  const recordAnswer = ({ sample, answer, choice, correct }) =>
    setState((prev) => {
      const t = prev.techniques[answer] || { attempts: 0, correct: 0 };
      const confusion = { ...prev.confusion };
      if (!correct) {
        const key = `${answer}>${choice}`;
        confusion[key] = (confusion[key] || 0) + 1;
      }
      const next = {
        ...prev,
        techniques: {
          ...prev.techniques,
          [answer]: {
            attempts: t.attempts + 1,
            correct: t.correct + (correct ? 1 : 0),
          },
        },
        confusion,
        lastSampleId: sample.id,
        log: [
          ...prev.log,
          {
            at: new Date().toISOString(),
            sampleId: sample.id,
            answer,
            choice,
            correct,
          },
        ].slice(-200),
      };
      try {
        localStorage.setItem(LEARNER_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const reset = () => {
    const next = blank();
    try {
      localStorage.removeItem(LEARNER_KEY);
    } catch {}
    setState(next);
  };
  return { state, recordAnswer, reset };
}
export { samplesData };
