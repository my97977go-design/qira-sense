export const KNOWLEDGE_KEY = "qira-technique-library-v1";
export const ANIMATIONS = [
  "up-glide",
  "large-up-glide",
  "down-glide",
  "large-down-glide",
  "vibrato",
  "slide-vibrato",
  "dayin",
  "return-glide",
  "dianbow",
  "paogong",
  "dianzhi-glide",
];
export function validateLibrary(value) {
  if (
    value?.schemaVersion !== 1 ||
    !Array.isArray(value.entries) ||
    value.entries.length < 1 ||
    value.entries.length > 300
  )
    throw new Error("资料库格式不正确，请使用导出的 JSON 格式。");
  const ids = new Set();
  const entries = value.entries.map((t) => {
    if (
      typeof t.id !== "string" ||
      !/^[-a-z0-9]+$/.test(t.id) ||
      ids.has(t.id) ||
      ["constructor", "prototype"].includes(t.id)
    )
      throw new Error("技法编号需唯一，只使用小写字母、数字和连字符。");
    ids.add(t.id);
    for (const field of [
      "name",
      "shortExplanation",
      "pitchCue",
      "listeningCue",
      "aestheticPrompt",
      "commonConfusion",
      "question",
      "sourceNote",
    ])
      if (
        typeof t[field] !== "string" ||
        !t[field].trim() ||
        t[field].length > 1500
      )
        throw new Error("请完整填写名称、解释、教学提示与来源。");
    if (!ANIMATIONS.includes(t.animation) || !/^#[0-9a-f]{6}$/i.test(t.color))
      throw new Error("请选择有效的动画与颜色。");
    if (
      !Array.isArray(t.examples) ||
      t.examples.some(
        (e) =>
          typeof e.songId !== "string" ||
          !Array.isArray(e.annotationIds) ||
          e.annotationIds.some((id) => typeof id !== "string"),
      )
    )
      throw new Error("录音例证关联格式不正确。");
    return { ...t };
  });
  return {
    schemaVersion: 1,
    title: String(value.title || "中国音乐技法资料库"),
    entries,
  };
}
