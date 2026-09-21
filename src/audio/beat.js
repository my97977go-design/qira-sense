// Spectral-flux onset envelope → tempo autocorrelation → aligned pulse grid.
// This estimates a pulse, not a score's time signature or technique labels.
function fft(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len *= 2) {
    const angle = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      let wr = 1,
        wi = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j,
          b = a + len / 2;
        const tr = wr * real[b] - wi * imag[b],
          ti = wr * imag[b] + wi * real[b];
        real[b] = real[a] - tr;
        imag[b] = imag[a] - ti;
        real[a] += tr;
        imag[a] += ti;
        const next = wr * Math.cos(angle) - wi * Math.sin(angle);
        wi = wr * Math.sin(angle) + wi * Math.cos(angle);
        wr = next;
      }
    }
  }
}

export function analyzeBeat(samples, sampleRate) {
  if (!samples?.length || sampleRate <= 0)
    throw new Error("没有可分析的音频。");
  const stride = Math.max(1, Math.round(sampleRate / 22050));
  const rate = sampleRate / stride,
    size = 1024,
    hop = 256,
    step = hop / rate;
  const real = new Float64Array(size),
    imag = new Float64Array(size),
    previous = new Float64Array(size / 2);
  const envelope = [];
  for (
    let offset = 0;
    offset + size * stride <= samples.length;
    offset += hop * stride
  ) {
    for (let i = 0; i < size; i++) {
      real[i] =
        samples[offset + i * stride] *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
      imag[i] = 0;
    }
    fft(real, imag);
    let flux = 0;
    for (let k = 2; k < size / 2; k++) {
      const magnitude = Math.log1p(12 * Math.hypot(real[k], imag[k]));
      flux += Math.max(0, magnitude - previous[k]);
      previous[k] = magnitude;
    }
    envelope.push(flux);
  }
  const mean = envelope.reduce((a, b) => a + b, 0) / (envelope.length || 1);
  if (mean < 0.00001 || envelope.length < 100)
    throw new Error("录音太短或没有足够的节奏信息，请手动设置 BPM。");
  const onset = envelope.map((v, i) => {
    const neighbors = envelope.slice(Math.max(0, i - 10), i + 11);
    return Math.max(
      0,
      v - neighbors.reduce((a, b) => a + b, 0) / neighbors.length,
    );
  });
  const energy = onset.reduce((s, v) => s + v * v, 0);
  const at = (a, x) => {
    const i = Math.floor(x);
    return (a[i] || 0) * (1 - x + i) + (a[i + 1] || 0) * (x - i);
  };
  const correlate = (lag) => {
    let sum = 0;
    for (let i = Math.ceil(lag); i < onset.length; i++)
      sum += onset[i] * at(onset, i - lag);
    return sum / (energy || 1);
  };
  const candidates = [];
  for (let bpm = 65; bpm <= 185; bpm += 0.25) {
    const lag = 60 / bpm / step;
    const correlation = correlate(lag);
    const score =
      (correlation + 0.5 * correlate(lag * 2) + 0.25 * correlate(lag * 4)) *
      Math.exp(-0.1 * Math.log2(bpm / 115) ** 2);
    candidates.push({ bpm, score, correlation });
  }
  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0],
    period = 60 / winner.bpm;
  let phase = 0,
    best = -Infinity;
  for (let p = 0; p < period; p += step / 2) {
    let score = 0;
    for (let t = p; t < samples.length / sampleRate; t += period) {
      const index = (t - size / rate / 2) / step;
      score +=
        at(onset, index) +
        0.5 * at(onset, index - 1) +
        0.5 * at(onset, index + 1);
    }
    if (score > best) {
      best = score;
      phase = p;
    }
  }
  return {
    bpm: winner.bpm,
    offset: Number(phase.toFixed(4)),
    confidence: winner.correlation >= 0.14 ? "medium" : "low",
    method: "spectral-flux-autocorrelation",
    duration: samples.length / sampleRate,
  };
}

export function beatGrid(beat, duration) {
  if (!Number.isFinite(beat?.bpm) || beat.bpm < 30 || beat.bpm > 300) return [];
  const period = 60 / beat.bpm,
    offset = (((beat.offset || 0) % period) + period) % period;
  const beats = [];
  for (let t = offset; t < duration - 0.2; t += period)
    if (t >= 0.35) beats.push(Number(t.toFixed(6)));
  return beats;
}
