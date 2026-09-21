import { useRef, useState } from "react";
import { chapterUnlocked, moreChaptersUnlocked } from "../course/progress.js";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Lock,
  Headphones,
  Activity,
  MessageCircle,
} from "lucide-react";
import syllabus from "../data/course.json";
import StringSculpture from "../visuals/StringSculpture.jsx";
import ParticleField from "../visuals/ParticleField.jsx";

// 入口 id → 页面 screen。
const ENTRY_SCREEN = {
  rhythm: "rhythm",
  soundMap: "map",
  learning: "learning",
  finalTest: "finalTest",
};

export default function CourseHome({ game, muted }) {
  const [chapterNotice, setChapterNotice] = useState("");
  const heroArtRef = useRef(null);
  const { course } = game,
    entries = course.entries || [],
    doneCount = entries.filter((e) => course.progress[e.id]?.completed).length,
    chapterDone = course.chapterDone;
  return (
    <div className="course-home">
      <section className="course-hero">
        <ParticleField holeRef={heroArtRef} />
        <div className="course-hero-copy">
          <div className="brand-kicker">
            <span /> QIRA SENSE <i /> 聆听 · 理解 · 表达
          </div>
          <h1>
            <span className="hero-title-first">
              <em>从</em>听见
            </span>
            <span className="hero-title-second">
              <em>到</em>听懂<i aria-hidden="true">✦</i>
            </span>
          </h1>
          <h2>{syllabus.subtitle}</h2>
          <p className="course-intro">
            听一段中国音乐，看清声音怎样变化，
            <br />
            再用自己的话，说出音乐带来的感受。
          </p>
          <div className="course-method">
            <span>
              <Headphones size={17} />
              听原声
            </span>
            <ArrowRight size={14} />
            <span>
              <Activity size={17} />
              看变化
            </span>
            <ArrowRight size={14} />
            <span>
              <MessageCircle size={17} />
              说感受
            </span>
          </div>
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() =>
                game.navigate(ENTRY_SCREEN[course.next.id] || "rhythm")
              }
            >
              {chapterDone ? "再次体验课程" : "开始完整学习"}
              <ArrowRight size={18} />
            </button>
            <button
              className="secondary-button"
              onClick={() => game.navigate("finalTest")}
            >
              快速听辨测试
              <ArrowUpRight size={16} />
            </button>
            <button
              className="text-button"
              onClick={() => game.navigate("map")}
            >
              先看教学示例
              <ArrowUpRight size={16} />
            </button>
          </div>
          <p className="course-hero-note">
            当前示范课程：《大起板》 · 四个入口全部开放，可直接开始快速听辨测试
          </p>
        </div>
        <div className="course-hero-art" ref={heroArtRef}>
          <StringSculpture muted={muted} />
          <div className="model-caption">触碰弦模型，感受声音的振动</div>
        </div>
      </section>
      <section className="course-route">
        <div className="section-title">
          <div>
            <span className="section-index">学习路径</span>
            <h2>四个入口，自由探索</h2>
            <p>
              节奏、声音地图、技法训练与快速听辨测试
              全部直接开放。已经具备识别能力的学习者可以直接测试，通过即完成本章。
            </p>
          </div>
          <div className="route-progress">
            <b>
              {doneCount}
              <small> / {entries.length}</small>
            </b>
            <span>入口已体验</span>
          </div>
        </div>
        <div className="chapter-heading">
          <span className="chapter-number">第一章</span>
          <div>
            <h3>走进《大起板》</h3>
            <p>高音板胡 · 从节奏感知到无提示识别</p>
          </div>
          <span className="chapter-status">
            {chapterDone ? "本章已完成" : "正在学习"}
          </span>
        </div>
        <div className="lesson-path">
          {entries.map((l) => {
            const done = course.progress[l.id]?.completed,
              isFinal = l.id === "finalTest";
            return (
              <article
                key={l.id}
                className={`lesson-card ${done ? "completed" : "available"} ${
                  isFinal ? "final-entry" : ""
                }`}
              >
                <div className="lesson-top">
                  <span className="lesson-number">0{l.number}</span>
                  <span className="lesson-state">
                    {done ? (
                      <>
                        <Check size={14} />
                        已完成
                      </>
                    ) : (
                      "可以开始"
                    )}
                  </span>
                </div>
                <span className="lesson-step">
                  {isFinal ? "掌握测评" : `入口 ${l.number}`}
                </span>
                <h3>{l.title}</h3>
                <p>{l.subtitle}</p>
                <div className="lesson-bottom">
                  <small>{l.objective}</small>
                  <button
                    className="lesson-enter"
                    onClick={() => game.navigate(ENTRY_SCREEN[l.id])}
                  >
                    {done ? "再次进入" : "进入"}
                    <ArrowRight size={17} />
                  </button>
                </div>
              </article>
            );
          })}
          {(course.secondary || []).map((s) => (
            <article key={s.id} className="lesson-card available egg-entry">
              <div className="lesson-top">
                <span className="lesson-number egg-mark" aria-hidden="true">
                  ✦
                </span>
                <span className="lesson-state egg-state">隐藏彩蛋</span>
              </div>
              <span className="lesson-step">彩蛋关卡</span>
              <h3>{s.title}</h3>
              <p>{s.subtitle}</p>
              <div className="lesson-bottom">
                <small>主线之外的隐藏舞台，光点随乐句坠落。</small>
                <button
                  className="lesson-enter"
                  onClick={() => game.navigate(s.id)}
                >
                  点亮舞台
                  <ArrowRight size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
        <div className="future-chapters">
          {syllabus.chapters.slice(1).map((chapter, i) => (
            <article
              key={chapter.id}
              className={`future-chapter ${chapterUnlocked(chapter.id, course.progress) ? "unlocked" : ""}`}
            >
              <div className="chapter-orbit" aria-hidden="true">
                <span>{String(i + 2).padStart(2, "0")}</span>
              </div>
              <div>
                <span className="section-index">
                  第{i === 0 ? "二" : "三"}章 · 全新曲目
                </span>
                <h3>{chapter.title}</h3>
                <p>{chapter.description}</p>
                <span className="chapter-lock">
                  {chapterUnlocked(chapter.id, course.progress) ? (
                    <Check size={14} />
                  ) : (
                    <Lock size={14} />
                  )}{" "}
                  {chapterUnlocked(chapter.id, course.progress)
                    ? "章节已解锁 · 曲目待接入"
                    : i === 0
                      ? "通过第一章快速听辨测试后解锁"
                      : "通过第二章快速听辨测试后解锁"}
                </span>
              </div>
              <small>新曲目筹备中</small>
            </article>
          ))}
        </div>
        <div className="more-chapters">
          <button
            className="secondary-button"
            onClick={() =>
              setChapterNotice(
                moreChaptersUnlocked(course.progress)
                  ? "前三章已完成，更多课程正在筹备。"
                  : "请先通过第一章与第二章的快速听辨测试，再继续探索后续章节。",
              )
            }
          >
            探索更多章节
            <ArrowRight size={17} />
          </button>
          <span>音乐之旅，还将继续</span>
          {chapterNotice && <p role="status">{chapterNotice}</p>}
        </div>
        {course.progress.perform?.reflection && (
          <div className="saved-reflection">
            <MessageCircle size={20} />
            <div>
              <b>我的听感记录</b>
              <p>{course.progress.perform.reflection}</p>
            </div>
          </div>
        )}
        {!course.saved && (
          <p role="status" className="storage-notice">
            浏览器未能保存进度，本次学习仍可继续。
          </p>
        )}
      </section>
      <section className="teaching-value">
        <div>
          <span className="section-index">教学设计</span>
          <h2>把“好听”，说得更具体</h2>
          <p>以真实录音为依据，将聆听、可视化、互动练习与审美表达连接起来。</p>
        </div>
        <div className="teaching-value-grid">
          <article>
            <b>声音有依据</b>
            <p>原声录音配合人工技法标注，保留可重听的真实片段。</p>
          </article>
          <article>
            <b>理解有支撑</b>
            <p>动画示意、实时音高曲线与一句话解释同步呈现。</p>
          </article>
          <article>
            <b>学习有过程</b>
            <p>通过自适应训练与无提示测评，观察学生如何从感知走向理解。</p>
          </article>
        </div>
      </section>
    </div>
  );
}
