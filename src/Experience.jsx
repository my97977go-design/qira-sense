import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Headphones,
  SlidersHorizontal,
} from "lucide-react";
import useSession from "./game/useSession.js";
import { loadSong, saveSong } from "./game/data.js";
import { transport } from "./audio/transport.js";
import { Wordmark, clock, running } from "./components/Elements.jsx";
import Home from "./components/CourseHome.jsx";
import useCourse from "./course/useCourse.js";
import syllabus from "./data/course.json";
import TechniqueLibrary from "./components/TechniqueLibrary.jsx";
import Rhythm from "./components/Rhythm.jsx";
import SoundMap from "./components/SoundMap.jsx";
import Challenge from "./components/Challenge.jsx";
import AdaptiveLearning from "./components/AdaptiveLearning.jsx";
import FinalListeningTest from "./components/FinalListeningTest.jsx";
import TeacherMaintenance from "./components/TeacherMaintenance.jsx";
import Settings from "./components/Settings.jsx";
import GameOverlay from "./components/GameOverlay.jsx";

import useRanking from "./ranking/useRanking.js";
import RankingDialog from "./components/Ranking.jsx";
import { Trophy } from "lucide-react";

export default function App() {
  const [song, setSong] = useState(loadSong),
    baseGame = useSession(song),
    course = useCourse(),
    ranking = useRanking(baseGame),
    [activeLesson, setActiveLesson] = useState(null),
    [lessonRun, setLessonRun] = useState(0),
    [mapRequest, setMapRequest] = useState(null),
    [muted, setMuted] = useState(false),
    [settings, setSettings] = useState(false),
    current = useRef(null);
  const enterLesson = (id) => {
    // V8：核心入口直接导航，不再有解锁前置。
    const entryScreen = {
      rhythm: "rhythm",
      soundMap: "map",
      learning: "learning",
      finalTest: "finalTest",
      challenge: "challenge",
    };
    if (entryScreen[id]) {
      setActiveLesson(null);
      setMapRequest(null);
      baseGame.navigate(entryScreen[id]);
      return;
    }
    const lesson = course.lessons.find((l) => l.id === id);
    if (!lesson) return;
    setActiveLesson(id);
    setLessonRun((n) => n + 1);
    setMapRequest(null);
    baseGame.navigate(lesson.mode);
  };
  const navigate = (screen) => {
    if (
      ["home", "map", "library", "learning", "finalTest", "teacher"].includes(
        screen,
      )
    ) {
      setActiveLesson(null);
      setMapRequest(null);
    }
    baseGame.navigate(screen);
  };
  const game = {
    ...baseGame,
    course,
    ranking,
    lesson: course.lessons.find((l) => l.id === activeLesson),
    enterLesson,
    navigate,
    seekToAnnotation: (annotationId) => {
      const a = song.annotations.find((x) => x.id === annotationId);
      if (!a) return;
      setActiveLesson(null);
      setMapRequest({ techniqueId: a.technique, annotationId });
      baseGame.navigate("map");
    },
    restartLesson: () => {
      if (activeLesson === "recognize") enterLesson(activeLesson);
      else baseGame.start();
    },
  };
  current.current = game;
  useEffect(() => {
    if (
      baseGame.status === "finished" &&
      baseGame.summary &&
      activeLesson &&
      activeLesson !== "perform"
    )
      course.complete(activeLesson, baseGame.summary);
  }, [baseGame.status, baseGame.summary, activeLesson]);
  const nav = [
    { id: "home", label: "课程首页" },
    { id: "map", label: "声音地图" },
    { id: "library", label: "技法资料库" },
    { id: "teacher", label: "教师维护" },
  ];
  useEffect(() => {
    const key = (e) => {
      if (
        settings ||
        ranking.opened ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) ||
        e.target.isContentEditable
      )
        return;
      const g = current.current;
      if (
        [
          "Space",
          "KeyD",
          "KeyF",
          "KeyJ",
          "KeyK",
          "Digit1",
          "Digit2",
          "Digit3",
          "Digit4",
        ].includes(e.code) &&
        e.repeat
      ) {
        e.preventDefault();
        return;
      }
      if (e.code === "Escape" && running(g.status)) {
        e.preventDefault();
        g.togglePause();
        return;
      }
      if (g.screen === "challenge") {
        const i = ["KeyD", "KeyF", "KeyJ", "KeyK"].indexOf(e.code);
        if (i >= 0) {
          e.preventDefault();
          g.tap(i);
          return;
        }
        const h = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
        if (h >= 0) {
          e.preventDefault();
          if (!e.repeat) g.holdStart(4 + h);
        }
      }
      if (
        e.code === "Space" &&
        g.status === "armed"
      ) {
        // 桌面端快捷确认：加载完直接空格开倒数
        e.preventDefault();
        g.confirm();
      } else if (
        e.code === "Space" &&
        g.screen === "rhythm" &&
        g.status === "playing"
      ) {
        e.preventDefault();
        g.tap(0);
      } else if (
        e.code === "Space" &&
        g.screen === "map" &&
        !["BUTTON", "A"].includes(e.target.tagName)
      ) {
        e.preventDefault();
        running(g.status) ? g.togglePause() : g.start("map");
      }
    };
    window.addEventListener("keydown", key);
    const keyUp = (e) => {
      const g = current.current;
      if (g.screen !== "challenge") return;
      const h = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
      if (h >= 0) g.holdEnd(4 + h);
    };
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", keyUp);
    };
  }, [settings, ranking.opened]);
  const openSettings = () => {
    if (game.status === "playing") game.togglePause();
    setSettings(true);
  };
  const importSong = (next) => {
    game.navigate("home");
    setSong(next);
    return saveSong(next);
  };
  return (
    <div className={`app screen-${game.screen}`}>
      <header className="site-header">
        <button
          className="brand-button"
          onClick={() => game.navigate("home")}
          aria-label="Qira Sense 首页"
        >
          <Wordmark />
        </button>
        <nav aria-label="主要导航">
          {nav.map((item, i) => (
            <button
              key={item.id}
              className={
                game.screen === item.id || (item.id === "home" && activeLesson)
                  ? "active"
                  : ""
              }
              aria-current={
                game.screen === item.id || (item.id === "home" && activeLesson)
                  ? "page"
                  : undefined
              }
              onClick={() => game.navigate(item.id)}
            >
              <span>0{i + 1}</span>
              {item.label}
              {item.id === "challenge" && <i />}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <span className="edition">
            本项目为：
            <br />
            {syllabus.project.program}
            <br />
            <strong>{syllabus.project.stage}</strong>
          </span>
          <button
            className="icon-button"
            aria-label="查看排行榜"
            onClick={ranking.open}
          >
            <Trophy size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={muted ? "取消静音" : "静音"}
            aria-pressed={muted}
            onClick={() => {
              transport.setVolume(muted ? 0.8 : 0);
              setMuted(!muted);
            }}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            className="icon-button"
            aria-label="声音与标注设置"
            onClick={openSettings}
          >
            <SlidersHorizontal size={17} />
          </button>
        </div>
      </header>
      <main className="main-content">
        {/* key=screen：切屏即重挂载，触发 .screen-swap 转场动画 */}
        <div className="screen-swap" key={game.screen}>
          {game.screen === "home" ? (
            <Home game={game} song={song} muted={muted} />
          ) : game.screen === "learning" ? (
            <AdaptiveLearning game={game} song={song} />
          ) : game.screen === "finalTest" ? (
            <FinalListeningTest game={game} song={song} />
          ) : game.screen === "teacher" ? (
            <TeacherMaintenance
              game={game}
              song={song}
              onSongSaved={setSong}
            />
          ) : (
            <div className="session-page">
              {game.screen === "rhythm" && <Rhythm game={game} />}{" "}
              {game.screen === "map" && (
                <SoundMap game={game} song={song} request={mapRequest} />
              )}{" "}
              {game.screen === "challenge" && (
                <Challenge game={game} song={song} />
              )}
              {game.screen === "library" && (
                <TechniqueLibrary
                  song={song}
                  onListen={(techniqueId, annotationId) => {
                    setActiveLesson(null);
                    setMapRequest({ techniqueId, annotationId });
                    baseGame.navigate("map");
                  }}
                />
              )}
              <GameOverlay game={game} />
            </div>
          )}
        </div>
      </main>
      <footer className="site-footer">
        <div className="footer-track">
          <span
            className={`equalizer ${game.status === "playing" && game.time >= 0 ? "playing" : ""}`}
          >
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            大起板 <small>高音板胡</small>
          </span>
        </div>
        <div className="footer-center">
          {["home", "library", "learning", "finalTest", "teacher"].includes(
            game.screen,
          ) ? (
            <span>中国音乐审美体验 · 交互式教学</span>
          ) : (
            <>
              <button
                className="icon-button"
                disabled={
                  !running(game.status) &&
                  !(game.screen === "map" && game.status === "finished")
                }
                onClick={() =>
                  game.status === "finished"
                    ? game.start("map")
                    : game.togglePause()
                }
                aria-label={game.status === "playing" ? "暂停播放" : "继续播放"}
              >
                {game.status === "playing" ? (
                  <Pause size={14} />
                ) : (
                  <Play size={14} />
                )}
              </button>
              <time>{clock(game.time)}</time>
              <div
                className="progress-bar"
                role="progressbar"
                aria-label="录音进度"
                aria-valuemin={0}
                aria-valuemax={Math.ceil(song.duration)}
                aria-valuenow={Math.round(Math.max(0, game.time))}
              >
                <i
                  style={{
                    width: `${Math.min(100, (Math.max(0, game.time) / song.duration) * 100)}%`,
                  }}
                />
              </div>
              <time>{clock(song.duration)}</time>
            </>
          )}
        </div>
        <div className="footer-right">
          <Headphones size={13} />
          <span>从听见到听懂</span>
          {game.screen !== "home" && <kbd>ESC 暂停</kbd>}
        </div>
      </footer>
      {ranking.opened && <RankingDialog ranking={ranking} />}
      {settings && (
        <Settings
          game={game}
          song={song}
          onImport={importSong}
          close={() => setSettings(false)}
        />
      )}
    </div>
  );
}
