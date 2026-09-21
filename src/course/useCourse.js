import { useState } from "react";
import {
  ENTRIES,
  SECONDARY,
  LESSONS,
  PROGRESS_KEY,
  validProgress,
  isUnlocked,
  recordCompletion,
  chapterComplete,
} from "./progress.js";
export default function useCourse() {
  const [progress, setProgress] = useState(() => {
      try {
        return validProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY)));
      } catch {
        return {};
      }
    }),
    [saved, setSaved] = useState(true);
  const complete = (id, summary, reflection) =>
    setProgress((previous) => {
      const next = recordCompletion(previous, id, summary, reflection);
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
        setSaved(true);
      } catch {
        setSaved(false);
      }
      return next;
    });
  // 推荐下一步：未完成的核心入口；全部完成则指向 Final Test。
  const next =
    ENTRIES.find((e) => !progress[e.id]?.completed) ||
    ENTRIES.find((e) => e.id === "finalTest") ||
    ENTRIES[0];
  return {
    progress,
    complete,
    saved,
    next,
    entries: ENTRIES,
    secondary: SECONDARY,
    lessons: LESSONS,
    chapterDone: chapterComplete("daqiban", progress),
    isUnlocked: (id) => isUnlocked(id, progress),
  };
}
