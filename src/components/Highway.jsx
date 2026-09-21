import { LANES } from "../game/chart.js";
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
  return (
    <div className="highway" aria-label="连续下落四轨，使用 D F J K 对应音轨">
      <div className="highway-light" />
      <div className="lane-grid">
        {LANES.map((lane, i) => (
          <div
            key={lane.key}
            className={`lane ${now - game.padFlashes[i] < 140 ? "lit" : ""}`}
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
          const y = 83 - ((note.time - time) / travel) * 83;
          return (
            <div
              key={note.id}
              className={`falling-note ${note.kind === "beat" ? "neutral-note" : ""}`}
              style={{
                "--lane": LANES[note.lane].color,
                left: `${note.lane * 25 + 2}%`,
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
              style={{ left: `${index * 25 + 12.5}%`, "--lane": lane.color }}
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
            className={now - game.padFlashes[index] < 140 ? "pressed" : ""}
            aria-label={`${lane.key} ${lane.name}`}
            onPointerDown={(e) => {
              if (e.button === 0) {
                e.preventDefault();
                game.tap(index);
              }
            }}
            onClick={(e) => {
              if (e.detail === 0) game.tap(index);
            }}
            disabled={game.status !== "playing"}
          >
            <kbd>{lane.key}</kbd>
            <span>{lane.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
