// YIN cumulative mean normalized difference. Unreliable frames stay missing.
export function estimatePitch(input, sampleRate) {
  const stride = 2,
    n = Math.floor(input.length / stride),
    rate = sampleRate / stride;
  const x = new Float32Array(n);
  let energy = 0,
    mean = 0;
  for (let i = 0; i < n; i++) {
    x[i] = (input[i * stride] + input[i * stride + 1]) * 0.5;
    mean += x[i];
  }
  mean /= n;
  for (let i = 0; i < n; i++) {
    x[i] -= mean;
    energy += x[i] * x[i];
  }
  const rms = Math.sqrt(energy / n);
  if (rms < 0.003) return { pitch: null, confidence: 0, rms };
  const min = Math.max(2, Math.floor(rate / 3000)),
    max = Math.min(Math.floor(rate / 90), Math.floor(n / 2) - 1),
    length = n - max,
    diff = new Float64Array(max + 1);
  let sum = 0;
  for (let lag = 1; lag <= max; lag++) {
    let d = 0;
    for (let i = 0; i < length; i++) {
      const z = x[i] - x[i + lag];
      d += z * z;
    }
    sum += d;
    diff[lag] = sum ? (d * lag) / sum : 1;
  }
  let chosen = -1;
  for (let lag = min; lag < max; lag++)
    if (diff[lag] < 0.15) {
      while (lag + 1 <= max && diff[lag + 1] < diff[lag]) lag++;
      chosen = lag;
      break;
    }
  if (chosen < 0) {
    let best = 1;
    for (let lag = min; lag <= max; lag++)
      if (diff[lag] < best) {
        best = diff[lag];
        chosen = lag;
      }
    if (best > 0.25) return { pitch: null, confidence: 1 - best, rms };
  }
  const a = diff[chosen - 1] || diff[chosen],
    b = diff[chosen],
    c = diff[chosen + 1] || b,
    den = a - 2 * b + c;
  const refined = chosen + (den ? (a - c) / (2 * den) : 0),
    pitch = rate / refined;
  return {
    pitch: pitch >= 90 && pitch <= 3000 ? pitch : null,
    confidence: 1 - b,
    rms,
  };
}
