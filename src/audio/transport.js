// One decoded recording, one clock. Visuals and input judgement read this clock.
export class AudioTransport {
  constructor() {
    this.context = null;
    this.buffer = null;
    this.source = null;
    this.phase = "idle";
    this.offset = 0;
    this.limit = 0;
    this.startedAt = 0;
    this.volume = 0.8;
    this.rate = 1;
    this.loadPromise = null;
  }
  async load(url) {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context)
        throw new Error("当前浏览器不支持声音播放，请使用新版浏览器。");
      this.context = new Context();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 4096;
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
      this.analyser.connect(this.gain);
    }
    await this.context.resume();
    if (!this.buffer) {
      this.loadPromise ||= fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error("录音加载失败，请重试。");
          return r.arrayBuffer();
        })
        .then((bytes) => this.context.decodeAudioData(bytes))
        .then((buffer) => {
          this.buffer = buffer;
        })
        .catch((error) => {
          this.loadPromise = null;
          throw error;
        });
      await this.loadPromise;
    }
  }
  get time() {
    return this.phase === "playing"
      ? Math.min(
          this.limit,
          this.offset + (this.context.currentTime - this.startedAt) * this.rate,
        )
      : this.offset;
  }
  // 倒计时剩余秒数：播放已排程但声音尚未开始的阶段 > 0，开始后恒为 0。
  get timeUntilStart() {
    if (this.phase !== "playing" || !this.context) return 0;
    return Math.max(0, this.startedAt - this.context.currentTime);
  }
  play(offset = 0, delay = 0, end = this.buffer?.duration) {
    if (!this.buffer) return;
    this.disconnectSource();
    this.offset = Math.max(0, Math.min(offset, this.buffer.duration));
    this.limit = Math.min(end, this.buffer.duration);
    this.startedAt = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.rate;
    // 慢速精标时保留真实音高走向（滑音轮廓可闻），只拉伸时间不变调。
    if ("preservesPitch" in source) source.preservesPitch = true;
    source.connect(this.analyser || this.gain);
    this.source = source;
    this.phase = "playing";
    source.onended = () => {
      if (this.source !== source) return;
      this.offset = this.limit;
      this.phase = "ended";
      this.source = null;
      source.disconnect();
    };
    source.start(
      this.startedAt,
      this.offset,
      Math.max(0.001, this.limit - this.offset),
    );
  }
  pause() {
    if (this.phase !== "playing") return;
    this.offset = this.time;
    this.disconnectSource();
    this.phase = "paused";
  }
  async resume() {
    if (this.phase !== "paused") return;
    const offset = this.offset,
      limit = this.limit;
    await this.context.resume();
    if (this.phase === "paused" && this.offset === offset)
      this.play(Math.max(0, offset), 0.15 + Math.max(0, -offset), limit);
  }
  stop() {
    this.disconnectSource();
    this.phase = "idle";
    this.offset = 0;
  }
  disconnectSource() {
    const old = this.source;
    this.source = null;
    if (old) {
      old.onended = null;
      try {
        old.stop();
      } catch {
        /* Already ended. */
      }
      old.disconnect();
    }
  }
  // 变速播放：正在播放时从当前位置无缝切换倍速（time 始终报告录音真实位置）。
  setRate(rate) {
    const next = Math.max(0.05, Math.min(4, Number(rate) || 1));
    if (next === this.rate) return;
    this.rate = next;
    if (this.phase === "playing") {
      const t = this.time,
        limit = this.limit;
      this.play(t, 0, limit);
    }
  }
  seek(t) {
    const max = this.buffer ? this.buffer.duration : t;
    const clamped = Math.max(0, Math.min(t, max));
    if (this.phase === "playing") this.play(clamped, 0, this.limit);
    else this.offset = clamped;
  }
  setVolume(value) {
    this.volume = value;
    if (this.gain)
      this.gain.gain.setTargetAtTime(value, this.context.currentTime, 0.03);
  }
}
export const transport = new AudioTransport();
