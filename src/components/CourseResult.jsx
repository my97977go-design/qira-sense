import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
export default function CourseResult({ game }) {
  const [reflection, setReflection] = useState(
      game.course.progress.perform?.reflection || "",
    ),
    [notice, setNotice] = useState("");
  const lesson = game.lesson,
    done = game.course.progress[lesson.id]?.completed,
    passed = game.summary.accuracy >= (lesson.passAccuracy || 0);
  const next = game.course.lessons.find((l) => l.number === lesson.number + 1);
  return (
    <div className="course-result">
      <div className={`course-result-status ${done ? "passed" : ""}`}>
        {done ? (
          <>
            <Check size={18} />第 {lesson.number} 关已完成
            {game.course.lessons.every(
              (l) => game.course.progress[l.id]?.completed,
            )
              ? "，第二章已解锁"
              : "，可继续体验其他关卡"}
          </>
        ) : passed && lesson.id === "perform" ? (
          "挑战达标，写下一句听感即可完成本关"
        ) : (
          "继续练习，命中率达到 50% 即可通关"
        )}
      </div>
      {lesson.id === "perform" && passed && (
        <div className="reflection-form">
          <label htmlFor="reflection">
            用一句话说说：哪一种技法改变了你对这段音乐的感受？
          </label>
          <textarea
            id="reflection"
            maxLength={800}
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="例如：我听见音高连续向上滑动，感觉乐句更有向前推进的力量。"
          />
          <p>感受没有唯一答案。试着说出你听到的声音变化及其带来的感受。</p>
          <button
            className="secondary-button"
            disabled={reflection.trim().length < 4}
            onClick={() => {
              game.course.complete(lesson.id, game.summary, reflection);
              setNotice("听感已记录。");
            }}
          >
            {done ? "更新听感记录" : "保存听感，完成本关"}
          </button>
          {notice && <span role="status">{notice}</span>}
        </div>
      )}
      {done && next && (
        <button
          className="primary-button"
          onClick={() => game.enterLesson(next.id)}
        >
          进入第 {next.number} 关 · {next.title}
          <ArrowRight size={17} />
        </button>
      )}
      <button className="text-button" onClick={() => game.navigate("home")}>
        返回课程地图
      </button>
    </div>
  );
}
