import originalV2 from "../data/song.json" with { type: "json" };
import {
  FINAL_TECHNIQUES,
  supportsAnnotation,
} from "../learning/learningConfig.js";

// V8 schema v3：毫秒级事件数据架构。
// 读取顺序：v3 → 旧 v2（自动迁移）→ 随项目原始标注（自动迁移）。
// 旧 v2 数据永远不会覆盖已经保存的 v3 数据。
export const DATA_KEY = "qira-human-annotations-v3";
export const LEGACY_KEY = "qira-human-annotations-v2";

export const LAYERS = ["technique", "expression"];
export const TIMING_PRECISIONS = [
  "human-millisecond",
  "human-confirmed",
  "legacy-derived-subdivision",
];
export const REVIEW_STATUSES = ["confirmed", "needs-review", "rejected"];
export const DYNAMICS = ["steady", "crescendo", "diminuendo"];
const ID_PATTERN = /^[-a-zA-Z0-9]+$/;
const FORBIDDEN_IDS = ["constructor", "prototype"];

const validId = (id) =>
  typeof id === "string" && ID_PATTERN.test(id) && !FORBIDDEN_IDS.includes(id);

// 将 v2 秒级区间标注迁移为 v3：区间加上 layer，事件表初始为空。
// 不伪造毫秒事件——等分位置只在游戏编排时作为 legacy fallback 生成。
export function migrateV2toV3(v2) {
  if (!v2 || v2.schemaVersion !== 2 || !Array.isArray(v2.annotations))
    throw new Error("无法迁移：不是 schemaVersion 2 的标注。");
  return {
    ...v2,
    audio: originalV2.audio,
    schemaVersion: 3,
    annotations: v2.annotations.map((a) => ({
      ...a,
      layer: LAYERS.includes(a.layer) ? a.layer : "technique",
    })),
    events: [],
    migrationNote:
      "由 v2 秒级区间标注自动迁移。毫秒级事件需教师在标注台中精修确认。",
    annotationVersion: Math.max(3, Number(v2.annotationVersion) || 3),
  };
}

function cleanAnnotation(a) {
  const repeatCount = a.repeatCount ?? 1;
  return {
    ...a,
    layer: LAYERS.includes(a.layer) ? a.layer : "technique",
    repeatCount,
    label: String(a.label || a.technique).slice(0, 200),
    description: String(a.description || a.label || "").slice(0, 500),
  };
}

function cleanEvent(e) {
  return {
    id: e.id,
    annotationId: typeof e.annotationId === "string" ? e.annotationId : null,
    technique: e.technique,
    anchor: e.anchor,
    start: Number.isFinite(e.start) ? e.start : undefined,
    end: Number.isFinite(e.end) ? e.end : undefined,
    timingPrecision: TIMING_PRECISIONS.includes(e.timingPrecision)
      ? e.timingPrecision
      : "human-confirmed",
    reviewStatus: REVIEW_STATUSES.includes(e.reviewStatus)
      ? e.reviewStatus
      : "needs-review",
    label: typeof e.label === "string" ? e.label.slice(0, 200) : "",
  };
}

// v3 校验：只有真正的数据错误才抛错（阻止载入）。
// 同层重叠只产生 warning；跨层重叠允许。
export function validateSong(input) {
  if (!input || input.sourceSha256 !== originalV2.sourceSha256)
    throw new Error("标注必须对应当前《大起板》录音。");
  if (input.schemaVersion === 2) return validateSong(migrateV2toV3(input));
  if (
    input.schemaVersion !== 3 ||
    !Array.isArray(input.annotations) ||
    !input.annotations.length ||
    input.annotations.length > 1000
  )
    throw new Error("请选择新版导出的标注 JSON（schemaVersion: 3）。");
  const annotationIds = new Set();
  const annotations = input.annotations
    .map((a) => {
      if (!validId(a.id) || annotationIds.has(a.id))
        throw new Error("标注编号无效或重复。");
      annotationIds.add(a.id);
      if (
        !Number.isFinite(a.start) ||
        !Number.isFinite(a.end) ||
        a.start < 0 ||
        a.end <= a.start ||
        a.end > originalV2.duration
      )
        throw new Error("标注区间超出录音范围。");
      if (!supportsAnnotation(a.technique))
        throw new Error("标注含有尚未支持的技法。");
      const repeatCount = a.repeatCount ?? 1;
      if (
        !Number.isInteger(repeatCount) ||
        repeatCount < 1 ||
        repeatCount > 8 ||
        (a.end - a.start) / repeatCount < 0.12
      )
        throw new Error("重复次数或间隔无效。");
      if (!DYNAMICS.includes(a.dynamics))
        throw new Error("强弱变化字段无效。");
      return cleanAnnotation(a);
    })
    .sort((a, b) => a.start - b.start);
  const enabled = annotations.filter((a) => a.enabled !== false);
  if (!enabled.length) throw new Error("请保留至少一个启用的技法区间。");
  // 同层重叠：仅 warning，不阻止载入。
  const warnings = [];
  for (const layer of LAYERS) {
    const rows = enabled
      .filter((a) => a.layer === layer)
      .sort((a, b) => a.start - b.start);
    rows.forEach((a, i) => {
      if (i > 0 && a.start < rows[i - 1].end)
        warnings.push({
          code: "overlap",
          layer,
          ids: [rows[i - 1].id, a.id],
          message: `${layer} 层存在重叠区间（${rows[i - 1].id} 与 ${a.id}），请复核。`,
        });
    });
  }
  // 事件校验。
  const rawEvents = Array.isArray(input.events) ? input.events : [];
  if (rawEvents.length > 5000) throw new Error("事件数量超出限制。");
  const eventIds = new Set();
  const events = rawEvents.map((e) => {
    if (!validId(e.id) || eventIds.has(e.id))
      throw new Error("事件编号无效或重复。");
    eventIds.add(e.id);
    if (!FINAL_TECHNIQUES.includes(e.technique))
      throw new Error("事件含有尚未支持的技法。");
    if (
      !Number.isFinite(e.anchor) ||
      e.anchor < 0 ||
      e.anchor > originalV2.duration
    )
      throw new Error("事件锚点超出录音范围。");
    if (e.annotationId != null && !annotationIds.has(e.annotationId))
      throw new Error("事件关联了不存在的标注区间。");
    if (Number.isFinite(e.start) || Number.isFinite(e.end)) {
      const start = Number.isFinite(e.start) ? e.start : e.anchor;
      const end = Number.isFinite(e.end) ? e.end : e.anchor;
      if (
        start < 0 ||
        end > originalV2.duration ||
        end < start ||
        e.anchor < start - 1e-6 ||
        e.anchor > end + 1e-6
      )
        throw new Error("事件区间或锚点位置无效。");
    }
    return cleanEvent(e);
  });
  return {
    ...originalV2,
    ...input,
    audio: originalV2.audio,
    schemaVersion: 3,
    annotations,
    events,
    validationWarnings: warnings,
    annotationVersion: Math.max(3, Number(input.annotationVersion) || 3),
  };
}

// 随项目内置的原始标注。固化后 song.json 可直接是 v3（教师导出回填），
// 此时跳过迁移、走同一套校验；旧 v2 文件仍自动迁移，两种格式都能启动。
export const original =
  originalV2.schemaVersion === 3 ? validateSong(originalV2) : migrateV2toV3(originalV2);

export function loadSong() {
  // 先读 v3；没有再读旧 v2 并迁移；最后回退到随项目原始标注（迁移后）。
  try {
    const v3 = JSON.parse(localStorage.getItem(DATA_KEY));
    if (v3) return validateSong(v3);
  } catch {
    /* fall through to legacy */
  }
  try {
    const v2 = JSON.parse(localStorage.getItem(LEGACY_KEY));
    if (v2) return validateSong(v2);
  } catch {
    /* fall through to original */
  }
  return original;
}

// 恢复固化数据：删除本机两代标注键，下次载入即回退到随代码的 song.json。
export function clearLocalSong() {
  try {
    localStorage.removeItem(DATA_KEY);
    localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

// 本机是否存在标注覆盖（存在则 loadSong 不会用到固化数据）。
export function hasLocalSong() {
  try {
    return !!(localStorage.getItem(DATA_KEY) || localStorage.getItem(LEGACY_KEY));
  } catch {
    return false;
  }
}

export function saveSong(song) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(song));
    return true;
  } catch {
    return false;
  }
}
export { originalV2 };
