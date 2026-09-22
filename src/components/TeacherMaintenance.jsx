import { useState } from "react";
import {
  PenLine,
  BookOpen,
  Database,
  Trash2,
  Download,
  Drum,
  Copy,
} from "lucide-react";
import AnnotationStudio from "./AnnotationStudio.jsx";
import TechniqueLibrary from "./TechniqueLibrary.jsx";
import BeatCalibration from "./BeatCalibration.jsx";
import { LEARNER_KEY } from "../learning/learningConfig.js";
import { loadCalibration } from "../game/beatCalibration.js";
import { Eyebrow } from "./Elements.jsx";

// 教师维护区：标注台 / 技法库维护 / 学习数据。
// 学习数据仅本地查看与清除，绝不上传排行榜。
export default function TeacherMaintenance({ game, song, onSongSaved }) {
  const [tab, setTab] = useState("studio");
  const [learnerRaw, setLearnerRaw] = useState(() => {
    try {
      return localStorage.getItem(LEARNER_KEY);
    } catch {
      return null;
    }
  });
  const [notice, setNotice] = useState("");
  const [bakeJson, setBakeJson] = useState("");
  const [bakeNotice, setBakeNotice] = useState("");
  // 固化导出：把当前生效的节拍标定 + 技法标注打包成一份 JSON 复制到剪贴板，
  // 交给开发者回填进代码（beat-builtin.json / song.json），即在任何设备、
  // 任何域名（临时隧道 / localhost / 正式站）永久生效，不必重新标注。
  const bake = async () => {
    const payload = {
      kind: "qira-bake-v1",
      exportedAt: new Date().toISOString(),
      beat: loadCalibration(),
      song,
    };
    const json = JSON.stringify(payload);
    setBakeJson(json);
    try {
      await navigator.clipboard.writeText(json);
      setBakeNotice(
        "节拍+技法数据已复制到剪贴板：粘贴发给开发者即可永久固化。",
      );
    } catch {
      setBakeNotice("自动复制失败：长按下方文本框，全选后手动复制。");
    }
  };
  let learner = null;
  try {
    learner = learnerRaw ? JSON.parse(learnerRaw) : null;
  } catch {
    learner = null;
  }
  const tabs = [
    { id: "studio", label: "标注台", icon: PenLine },
    { id: "beat", label: "节拍标定", icon: Drum },
    { id: "library", label: "技法库维护", icon: BookOpen },
    { id: "data", label: "学习数据", icon: Database },
  ];
  const clearLearner = () => {
    try {
      localStorage.removeItem(LEARNER_KEY);
    } catch {}
    setLearnerRaw(null);
    setNotice("学习记录已清除。");
  };
  const exportLog = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(learner, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "qira-learner-state.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="play-page teacher-page">
      <div className="page-heading">
        <div>
          <Eyebrow>Teacher Maintenance · 教师维护区</Eyebrow>
          <h1>教师维护</h1>
          <p>
            精修毫秒级标注、人工标定节拍、维护技法资料库、查看学习数据。所有数据保存在本浏览器。
          </p>
        </div>
        <button className="text-button" onClick={() => game.navigate("home")}>
          返回课程
        </button>
      </div>
      <div className="teacher-bake">
        <button className="secondary-button" onClick={bake}>
          <Copy size={15} /> 复制固化数据（节拍+技法）
        </button>
        <small>
          标完一遍后点这里：把当前生效的节拍与技法标注复制出来发给开发者回填进代码。
          之后任何设备、任何地址（临时隧道 / localhost / 正式站）都直接带数据，不必重标。
        </small>
        {bakeJson && (
          <textarea
            readOnly
            rows={4}
            value={bakeJson}
            aria-label="固化数据 JSON"
            onFocus={(e) => e.target.select()}
          />
        )}
        {bakeNotice && (
          <p role="status" className="library-notice">
            {bakeNotice}
          </p>
        )}
      </div>
      <div className="teacher-tabs" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      {tab === "studio" && (
        <AnnotationStudio song={song} onSaved={onSongSaved} />
      )}
      {tab === "beat" && <BeatCalibration song={song} />}
      {tab === "library" && (
        <TechniqueLibrary
          song={song}
          initialTeacher
          onListen={(techniqueId, annotationId) => {
            game.navigate("map");
            game.seekToAnnotation?.(annotationId);
          }}
        />
      )}
      {tab === "data" && (
        <div className="teacher-data">
          {notice && (
            <p role="status" className="library-notice">
              {notice}
            </p>
          )}
          {!learner ? (
            <p>当前浏览器没有学习记录（自适应学习作答后会出现）。</p>
          ) : (
            <>
              <div className="teacher-data-summary">
                <div>
                  <b>{learner.log?.length || 0}</b>
                  <span>最近作答记录</span>
                </div>
                <div>
                  <b>
                    {Object.values(learner.techniques || {}).reduce(
                      (s, t) => s + t.attempts,
                      0,
                    )}
                  </b>
                  <span>总作答次数</span>
                </div>
                <div>
                  <b>
                    {Object.values(learner.techniques || {}).reduce(
                      (s, t) => s + t.correct,
                      0,
                    )}
                  </b>
                  <span>正确次数</span>
                </div>
              </div>
              <div className="teacher-data-actions">
                <button className="secondary-button" onClick={exportLog}>
                  <Download size={15} />
                  导出学习记录
                </button>
                <button className="text-button" onClick={clearLearner}>
                  <Trash2 size={14} />
                  清除学习记录
                </button>
              </div>
              <p className="teacher-data-note">
                学习数据仅保存在当前浏览器，用于自适应选题，不会上传排行榜或任何服务器。
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
