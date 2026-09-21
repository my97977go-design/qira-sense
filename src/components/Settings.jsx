import { useEffect, useRef, useState } from "react";
import { X, Download, Upload, ChevronRight } from "lucide-react";
import { validateSong, original } from "../game/data.js";
import { Eyebrow, running, formatBpm } from "./Elements.jsx";
export default function Settings({ game, song, onImport, close }) {
  const dialog = useRef(null),
    file = useRef(null),
    [notice, setNotice] = useState(""),
    [bpmDraft, setBpmDraft] = useState(game.manualBpm ?? "");
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(song, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "daqiban-human-annotations.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const locked =
    running(game.status) || ["loading", "analyzing"].includes(game.status);
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-labelledby="settings-title"
    >
      <button
        className="icon-button dialog-close"
        onClick={close}
        aria-label="关闭设置"
      >
        <X size={20} />
      </button>
      <Eyebrow>MAKE IT FEEL RIGHT</Eyebrow>
      <h2 id="settings-title">声音与手感</h2>
      <p className="settings-intro">为你的耳机和习惯，做一点调整。</p>
      <label className="setting-row">
        <span>
          输入时差补偿{" "}
          <b>
            {game.calibration > 0 ? "+" : ""}
            {game.calibration} ms
          </b>
        </span>
        <input
          type="range"
          min="-250"
          max="250"
          step="10"
          value={game.calibration}
          onChange={(e) => game.setCalibration(Number(e.target.value))}
        />
        <small>如果判定总是偏晚，增加补偿数值。</small>
      </label>
      <label className="setting-row">
        <span>
          拍速 BPM{" "}
          <input
            type="number"
            min="30"
            max="300"
            step=".5"
            disabled={locked}
            value={bpmDraft}
            placeholder={formatBpm(game.detectedBeat?.bpm) || "自动"}
            onChange={(e) => setBpmDraft(e.target.value)}
            onBlur={() => {
              if (bpmDraft === "") {
                game.setManualBpm(null);
                return;
              }
              const value = Number(bpmDraft);
              if (Number.isFinite(value) && value >= 30 && value <= 300) {
                game.setManualBpm(value);
                setNotice("拍速将在下一轮生效。");
              } else {
                setNotice("请输入 30 到 300 之间的 BPM。");
                setBpmDraft(game.manualBpm ?? "");
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </span>
        <small>
          {locked
            ? "本轮结束或返回首页后，可修改拍速。"
            : "留空时从音频自动估算。自由速度演奏可按听感微调。"}
        </small>
      </label>
      <div className="data-info">
        <span className="small-label">ANNOTATION SOURCE</span>
        <h3>人工技法标注</h3>
        <p>《大起板 技法时间点.xlsx》 · {song.annotations.length} 个区间</p>
        <p>
          四连动作在原区间内等分为四次游戏落点；揉弦按估算节拍编排。音符间隙由中性节拍衔接。“滑柔”保留表格原名。
        </p>
        <details>
          <summary>
            查看原始标注时间 <ChevronRight size={14} />
          </summary>
          <div className="source-table">
            {song.annotations.map((a) => (
              <div key={a.id}>
                <time>
                  {a.start}—{a.end} s
                </time>
                <span>{a.label}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
      <div className="data-actions">
        <button className="secondary-button" onClick={download}>
          <Download size={15} />
          导出标注
        </button>
        <button
          className="secondary-button"
          onClick={() => file.current.click()}
        >
          <Upload size={15} />
          导入修订
        </button>
        <button
          className="text-button"
          onClick={() => {
            onImport(original);
            setNotice("已恢复随项目提供的人工标注。");
          }}
        >
          恢复原标注
        </button>
      </div>
      <input
        ref={file}
        hidden
        type="file"
        accept="application/json,.json"
        onChange={async (e) => {
          try {
            const f = e.target.files?.[0];
            if (!f) return;
            const next = validateSong(JSON.parse(await f.text()));
            const saved = onImport(next);
            setNotice(
              saved
                ? "修订已载入，下轮使用新标注。"
                : "修订已载入本次会话，浏览器未能保存，请导出备份。",
            );
          } catch (error) {
            setNotice(error.message);
          }
          e.target.value = "";
        }}
      />
      {notice && (
        <p role="status" className="settings-notice">
          {notice}
        </p>
      )}
      <p className="settings-footnote">
        录音 {song.duration.toFixed(2)} 秒 · 节拍分析在本机完成
      </p>
    </dialog>
  );
}
