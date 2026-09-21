import {
  ArrowRight,
  ArrowUpRight,
  Play,
  Headphones,
  AudioLines,
} from "lucide-react";
import { Eyebrow } from "./Elements.jsx";
import StringSculpture from "../visuals/StringSculpture.jsx";
import TechniqueRibbon from "../visuals/TechniqueRibbon.jsx";
export default function Home({ game, song, muted }) {
  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-copy">
          <Eyebrow>
            <span className="tiny-spark" /> CHINESE MUSIC, IN MOTION
          </Eyebrow>
          <h1>
            听见弦外，
            <br />
            玩进<span>音乐。</span>
          </h1>
          <p className="hero-description">
            从一拍的默契，到指尖的连奏。
            <br />
            让传统器乐，成为你的下一场游戏。
          </p>
          <div className="hero-track">
            <span className="track-stamp">弦</span>
            <div>
              <b>大起板</b>
              <span>
                {song.instrument} <i /> 38.88 秒原声片段
              </span>
            </div>
            <AudioLines size={31} strokeWidth={1} />
          </div>
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => game.navigate("challenge")}
            >
              进入技法挑战 <ArrowUpRight size={18} />
            </button>
            <button
              className="text-button"
              onClick={() => game.navigate("map")}
            >
              <Play size={13} fill="currentColor" /> 先听听看
            </button>
          </div>
          <div className="hero-footnote">
            <Headphones size={13} /> 戴上耳机，让每次触碰更有感觉。
          </div>
        </div>
        <StringSculpture muted={muted} />
      </section>
      <section className="journey" aria-label="选择体验">
        <div className="journey-caption">
          <span>以你的方式，进入声音</span>
          <span>
            EXPLORE THE RECORDING <ArrowRight size={14} />
          </span>
        </div>
        <div className="journey-grid">
          <button
            className="journey-card"
            onClick={() => game.navigate("rhythm")}
          >
            <span className="card-number">01</span>
            <div>
              <h2>节奏感测试</h2>
              <p>找到拍速，每一拍都跟上。</p>
            </div>
            <span className="card-graphic beat-graphic">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <ArrowUpRight size={18} />
          </button>
          <button className="journey-card" onClick={() => game.navigate("map")}>
            <span className="card-number">02</span>
            <div>
              <h2>声音地图</h2>
              <p>看见技法，听懂声音的动作。</p>
            </div>
            <span className="card-graphic">
              <TechniqueRibbon mini technique="vibrato" />
            </span>
            <ArrowUpRight size={18} />
          </button>
          <button
            className="journey-card featured"
            onClick={() => game.navigate("challenge")}
          >
            <span className="card-number">03</span>
            <div>
              <h2>
                技法挑战 <span>PLAY</span>
              </h2>
              <p>四轨连奏，一路接住音乐。</p>
            </div>
            <span className="card-graphic keys-graphic">
              <i />
              <i />
              <i />
              <i />
            </span>
            <ArrowUpRight size={18} />
          </button>
        </div>
      </section>
    </div>
  );
}
