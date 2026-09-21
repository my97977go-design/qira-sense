import { useRef, useState } from "react";
import { Plus, Download, Upload, Edit3, Play, Save, X } from "lucide-react";
import { useKnowledge } from "../knowledge/KnowledgeContext.jsx";
import { ANIMATIONS, validateLibrary } from "../knowledge/store.js";
import TechniqueRibbon from "../visuals/TechniqueRibbon.jsx";
const fields = [
  ["name", "技法名称"],
  ["shortExplanation", "一句话解释"],
  ["pitchCue", "曲线观察点"],
  ["listeningCue", "聆听提示"],
  ["aestheticPrompt", "审美提问"],
  ["commonConfusion", "容易混淆的地方"],
  ["question", "课堂引导问题"],
  ["sourceNote", "来源与修订说明"],
];
export default function TechniqueLibrary({ song, onListen, initialTeacher = false }) {
  const { library, save } = useKnowledge(),
    [selected, setSelected] = useState("large-up-glide"),
    [editing, setEditing] = useState(null),
    [teacher, setTeacher] = useState(initialTeacher),
    [notice, setNotice] = useState(""),
    input = useRef(null);
  const entry =
    library.entries.find((t) => t.id === selected) || library.entries[0];
  const ids = entry.examples
      .filter((e) => e.songId === song.id)
      .flatMap((e) => e.annotationIds),
    examples = song.annotations.filter(
      (a) => ids.includes(a.id) && a.enabled !== false,
    );
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(library, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "中国音乐技法资料库.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const commit = () => {
    try {
      const exists = library.entries.some((t) => t.id === editing.id);
      const entries = exists
        ? library.entries.map((t) => (t.id === editing.id ? editing : t))
        : [...library.entries, editing];
      const persisted = save({ ...library, entries });
      setSelected(editing.id);
      setEditing(null);
      setNotice(
        persisted
          ? "技法资料已保存，并同步用于声音地图。"
          : "本次会话已更新；浏览器未能保存，请导出资料库备份。",
      );
    } catch (e) {
      setNotice(e.message);
    }
  };
  return (
    <section className="play-page knowledge-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">教学资源 · 可持续扩充</p>
          <h1>中国音乐技法资料库</h1>
          <p>把演奏动作、声音变化与审美理解联系起来。</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            setTeacher(!teacher);
            setEditing(null);
            setNotice("");
          }}
        >
          <Edit3 size={16} />
          {teacher ? "返回学习视图" : "教师维护"}
        </button>
      </div>
      {teacher && (
        <div className="library-toolbar">
          <span>
            共 {library.entries.length} 个条目 ·
            修改保存在当前浏览器，导出可备份或迁移
          </span>
          <button
            onClick={() => {
              setEditing({
                id: `technique-${Date.now().toString(36)}`,
                name: "",
                shortExplanation: "",
                pitchCue: "",
                listeningCue: "",
                aestheticPrompt: "",
                commonConfusion: "",
                question: "",
                sourceNote: "",
                animation: "up-glide",
                color: "#e3c394",
                reviewStatus: "teaching-draft",
                examples: [],
              });
              setNotice("");
            }}
          >
            <Plus size={15} />
            新增技法
          </button>
          <button onClick={download}>
            <Download size={15} />
            导出资料库
          </button>
          <button onClick={() => input.current.click()}>
            <Upload size={15} />
            导入资料库
          </button>
          <input
            type="file"
            accept=".json,application/json"
            hidden
            ref={input}
            onChange={async (e) => {
              try {
                const file = e.target.files?.[0];
                if (!file) return;
                const next = validateLibrary(JSON.parse(await file.text()));
                const persisted = save(next);
                setEditing(null);
                setSelected(next.entries[0].id);
                setNotice(
                  persisted ? "资料库已导入。" : "已导入本次会话；请导出备份。",
                );
              } catch (error) {
                setNotice(error.message);
              }
              e.target.value = "";
            }}
          />
        </div>
      )}
      {notice && (
        <p className="library-notice" role="status">
          {notice}
        </p>
      )}
      <div className="knowledge-layout">
        <aside className="knowledge-menu" aria-label="技法目录">
          {library.entries.map((t) => (
            <button
              key={t.id}
              className={selected === t.id && !editing ? "active" : ""}
              style={{ "--tech": t.color }}
              onClick={() => {
                setSelected(t.id);
                setEditing(null);
                setNotice("");
              }}
            >
              <span style={{ background: t.color }} />
              <b>{t.name}</b>
              <small>
                {t.examples.some(
                  (e) =>
                    e.songId === song.id &&
                    e.annotationIds.some((id) =>
                      song.annotations.some((a) => a.id === id),
                    ),
                )
                  ? "有原声例证"
                  : "概念学习"}
              </small>
            </button>
          ))}
        </aside>
        {editing ? (
          <div className="knowledge-editor">
            <div className="editor-heading">
              <h2>
                {library.entries.some((t) => t.id === editing.id)
                  ? "编辑技法资料"
                  : "新增技法资料"}
              </h2>
              <button
                className="icon-button"
                aria-label="取消编辑"
                onClick={() => setEditing(null)}
              >
                <X size={18} />
              </button>
            </div>
            <p>
              一个条目对应一种技法。教学解释可调整，原声例证通过曲目和标注编号关联。
            </p>
            <div className="editor-fields">
              {fields.map(([key, label]) => (
                <label key={key}>
                  {label}
                  {key === "name" ? (
                    <input
                      value={editing[key]}
                      onChange={(e) =>
                        setEditing({ ...editing, [key]: e.target.value })
                      }
                    />
                  ) : (
                    <textarea
                      rows={2}
                      maxLength={1500}
                      value={editing[key]}
                      onChange={(e) =>
                        setEditing({ ...editing, [key]: e.target.value })
                      }
                    />
                  )}
                </label>
              ))}
              <label>
                动画类型
                <select
                  value={editing.animation}
                  onChange={(e) =>
                    setEditing({ ...editing, animation: e.target.value })
                  }
                >
                  {ANIMATIONS.map((id) => (
                    <option key={id} value={id}>
                      {library.entries.find((t) => t.id === id)?.name || id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                标识颜色
                <input
                  type="color"
                  value={editing.color}
                  onChange={(e) =>
                    setEditing({ ...editing, color: e.target.value })
                  }
                />
              </label>
              <label className="example-picker">
                关联《大起板》原声例证
                <small>可多选；没有确认例证时留空，不会生成模拟录音。</small>
                <select
                  multiple
                  size={5}
                  value={editing.examples
                    .filter((e) => e.songId === song.id)
                    .flatMap((e) => e.annotationIds)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      examples: [
                        ...editing.examples.filter(
                          (ex) => ex.songId !== song.id,
                        ),
                        {
                          songId: song.id,
                          annotationIds: [...e.target.selectedOptions].map(
                            (o) => o.value,
                          ),
                        },
                      ],
                    })
                  }
                >
                  {song.annotations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.start}—{a.end} 秒 · {a.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="editor-actions">
              <button className="primary-button" onClick={commit}>
                <Save size={16} />
                保存技法资料
              </button>
              <button className="text-button" onClick={() => setEditing(null)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <article
            className="knowledge-detail"
            style={{ "--tech": entry.color }}
          >
            <div className="knowledge-title">
              <div>
                <span>技法与审美理解</span>
                <h2>{entry.name}</h2>
              </div>
              {teacher && (
                <button
                  className="secondary-button"
                  onClick={() => setEditing(structuredClone(entry))}
                >
                  <Edit3 size={15} />
                  编辑此条目
                </button>
              )}
            </div>
            <p className="one-sentence">{entry.shortExplanation}</p>
            <div className="knowledge-animation">
              <span>动作示意</span>
              <TechniqueRibbon technique={entry.id} />
            </div>
            <div className="knowledge-prompts">
              <section>
                <h3>看哪里</h3>
                <p>{entry.pitchCue}</p>
              </section>
              <section>
                <h3>听什么</h3>
                <p>{entry.listeningCue}</p>
              </section>
              <section className="aesthetic-question">
                <h3>想一想，怎么表达</h3>
                <p>{entry.aestheticPrompt}</p>
              </section>
            </div>
            <div className="example-section">
              <h3>原声例证</h3>
              {examples.length ? (
                <div className="example-buttons">
                  {examples.map((a) => (
                    <button key={a.id} onClick={() => onListen(entry.id, a.id)}>
                      <Play size={14} />
                      《大起板》 {a.start}—{a.end} 秒
                    </button>
                  ))}
                </div>
              ) : (
                <p>
                  当前先学习概念。教师补充并确认录音例证后，可在此对照真实音高曲线聆听。
                </p>
              )}
            </div>
            <details className="knowledge-details">
              <summary>进一步理解与教学提示</summary>
              <h3>容易混淆的地方</h3>
              <p>{entry.commonConfusion}</p>
              <h3>课堂引导问题</h3>
              <p>{entry.question}</p>
              <h3>来源与修订说明</h3>
              <p>{entry.sourceNote}</p>
            </details>
          </article>
        )}
      </div>
    </section>
  );
}
