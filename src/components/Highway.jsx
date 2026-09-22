import { LANES } from "../game/chart.js";
const LANE_W = 100 / LANES.length;
export default function Highway({ game, previewNotes = [] }) {
  const preview =
    game.status === "ready" ||
    game.status === "loading" ||
    game.status === "analyzing";
  const time = preview ? 0 : game.time,
    travel = 2.5 / game.speed;
  const notes = (preview ? previewNotes : game.notes).filter(
    (n) =>
      !game.results[n.id] && n.time - time < travel && n.time - time > -0.24,
  );
  const now = performance.now();
  const yOf = (t) => 83 - ((t - time) / travel) * 83;
  return (
    <div
      className="highway"
      aria-label="连续下落八轨：D F J K L 点技法，1 2 3 长按技法"
    >
      <div className="highway-light" />
      <div className="lane-grid">
        {LANES.map((lane, i) => (
          <div
            key={lane.key}
            className={`lane ${lane.hold ? "hold-lane" : ""} ${
              now - game.padFlashes[i] < 140 ? "lit" : ""
            }`}
            style={{ "--lane": lane.color }}
          >
            <span className="lane-number">0{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="beat-lines">
        {Array.from({ length: 7 }, (_, i) => (
          <i
            key={i}
            style={{
              top: `${((((time * game.speed * 30 + i * 17) % 119) + 119) % 119) - 19}%`,
            }}
          />
        ))}
      </div>
      <div className="note-field">
        {notes.map((note) => {
          if (note.kind === "hold") {
            // 长按光条：头（起点）在下、尾（终点）在上，长度即持续时间提示
            const headY = Math.min(83, yOf(note.time));
            const tailY = Math.max(-30, yOf(note.end));
            const held = game.holding?.noteId === note.id;
            return (
              <div
                key={note.id}
                className={`hold-note ${held ? "held" : ""}`}
                style={{
                  "--lane": LANES[note.lane].color,
                  left: `${(note.lane + 0.5) * LANE_W}%`,
                  top: `${tailY}%`,
                  height: `${Math.max(2, headY - tailY)}%`,
                }}
                data-note-id={note.id}
              >
                <span>{note.label}</span>
                <i />
              </div>
            );
          }
          const y = yOf(note.time);
          return (
            <div
              key={note.id}
              className={`falling-note ${note.kind === "beat" ? "neutral-note" : ""}`}
              style={{
                "--lane": LANES[note.lane].color,
                left: `${(note.lane + 0.5) * LANE_W}%`,
                top: `${y}%`,
              }}
              data-note-id={note.id}
            >
              <span>{note.kind === "beat" ? "·" : note.label}</span>
              <i />
            </div>
          );
        })}
      </div>
      <div className="judgment-line">
        <span />
        <b>判定线</b>
      </div>
      {LANES.map(
        (lane, index) =>
          game.feedback?.success &&
          now - game.padFlashes[index] < 260 && (
            <div
              className="hit-burst"
              key={`${lane.key}-${game.padFlashes[index]}`}
              style={{
                left: `${(index + 0.5) * LANE_W}%`,
                "--lane": lane.color,
              }}
              aria-hidden="true"
            >
              <b />
              {Array.from({ length: 7 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    "--dx": `${(i - 3) * 12}px`,
                    "--dy": `${-24 - Math.sin(i * 0.8) * 25}px`,
                  }}
                />
              ))}
            </div>
          ),
      )}
      <div className="lane-pads">
        {LANES.map((lane, index) => (
          <button
            key={lane.key}
            style={{ "--lane": lane.color }}
            className={`${now - game.padFlashes[index] < 140 ? "pressed" : ""} ${
              lane.hold ? "hold-pad" : ""
            } ${game.holding?.lane === index ? "holding" : ""}`}
            aria-label={`${lane.key} ${lane.name}${lane.hold ? "（按住）" : ""}`}
            onPointerDown={(e) => {
              if (e.button === 0) {
                e.preventDefault();
                if (lane.hold) game.holdStart(index);
                else game.tap(index);
              }
            }}
            onPointerUp={() => lane.hold && game.holdEnd(index)}
            onPointerLeave={() => lane.hold && game.holdEnd(index)}
            onClick={(e) => {
              if (e.detail === 0 && !lane.hold) game.tap(index);
            }}
            disabled={game.status !== "playing"}
          >
            <kbd>{lane.key}</kbd>
            <span>{lane.hold ? `${lane.name} · 长按` : lane.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
