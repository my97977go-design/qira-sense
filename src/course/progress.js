import course from "../data/course.json" with { type: "json" };
import { finalTestPassRule } from "../learning/learningConfig.js";

// V8：第一章四个核心入口全部开放，无强制顺序。
// 章节完成 = Final Test 达到可配置的掌握标准（默认 overallF1 >= 0.7，provisional）。
export const ENTRIES = course.chapters[0].entries || [];
export const SECONDARY = course.chapters[0].secondary || [];
// 兼容旧进度键（pulse/recognize/perform）。
export const LESSONS = course.chapters[0].lessons || [];
export const PROGRESS_KEY = "qira-course-daqiban-v1";

// 所有入口与旧关卡键均可直接进入，无前置条件。
export const isUnlocked = (id, progress = {}) =>
  [...ENTRIES, ...SECONDARY, ...LESSONS].some((e) => e.id === id);

// 只有具备 entries 的实装章节能通过 Final Test 完成；
// planned 章节没有自己的 Final Test，永远视为未完成。
export const chapterComplete = (id, progress) => {
  const chapter = course.chapters.find((c) => c.id === id);
  return (
    !!chapter &&
    Array.isArray(chapter.entries) &&
    progress.finalTest?.completed === true
  );
};
export const chapterUnlocked = (id, progress) => {
  const chapter = course.chapters.find((c) => c.id === id);
  return (
    !!chapter &&
    (!chapter.prerequisiteChapter ||
      chapterComplete(chapter.prerequisiteChapter, progress))
  );
};
export const moreChaptersUnlocked = (progress) =>
  course.chapters.slice(0, 3).every((c) => chapterComplete(c.id, progress));

const cleanEntry = (v) => {
  if (!v || typeof v !== "object") return null;
  const entry = {
    completed: v.completed === true,
    bestAccuracy: Math.min(100, Math.max(0, Number(v.bestAccuracy) || 0)),
    reflection:
      typeof v.reflection === "string" ? v.reflection.slice(0, 800) : "",
    completedAt: typeof v.completedAt === "string" ? v.completedAt : null,
  };
  if (Number.isFinite(v.f1)) entry.f1 = v.f1;
  if (v.official === true) entry.official = true;
  return entry;
};

// 兼容旧三关进度（pulse/recognize/perform）与新四入口 + finalTest。
export function validProgress(value) {
  const result = {};
  if (!value || typeof value !== "object") return result;
  for (const l of [...ENTRIES, ...SECONDARY, ...LESSONS, { id: "finalTest" }]) {
    const v = cleanEntry(value[l.id]);
    if (v) result[l.id] = v;
  }
  return result;
}

// 记录一次活动结果。
// finalTest：summary.passed（由 Final Test 引擎按 finalTestPassRule 判定）才算完成。
// rhythm / challenge / pulse / perform：达到各自 passAccuracy 即记录 bestAccuracy，
// 但它们不再是章节完成的必要条件。
export function recordCompletion(progress, id, summary, reflection = "") {
  if (!summary || typeof summary !== "object") return progress;
  const entry =
    [...ENTRIES, ...SECONDARY, ...LESSONS].find((e) => e.id === id) ||
    (id === "finalTest" ? { id: "finalTest" } : null);
  if (!entry) return progress;
  let passed = false;
  if (id === "finalTest") passed = summary.passed === true;
  else if (id === "recognize")
    passed = summary.hits === 3 && summary.total === 3;
  else if (Number.isFinite(entry.passAccuracy))
    passed = (summary.accuracy || 0) >= entry.passAccuracy;
  else passed = summary.completed === true || summary.accuracy > 0;
  if (id === "perform" && passed)
    passed = reflection.trim().length >= 4 || !!progress[id]?.completed;
  const old = progress[id] || {};
  return {
    ...progress,
    [id]: {
      ...old,
      completed: old.completed || passed,
      bestAccuracy: Math.max(old.bestAccuracy || 0, summary.accuracy || 0),
      reflection: reflection.trim() || old.reflection || "",
      completedAt:
        old.completedAt || (passed ? new Date().toISOString() : null),
      ...(id === "finalTest"
        ? {
            f1: Number.isFinite(summary.f1) ? summary.f1 : old.f1 ?? null,
            official: summary.official === true || old.official === true,
          }
        : {}),
    },
  };
}
export { finalTestPassRule };
