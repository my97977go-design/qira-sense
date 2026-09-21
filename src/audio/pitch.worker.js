import { estimatePitch } from "./pitch.js";
self.onmessage = ({ data }) => {
  self.postMessage({
    ...estimatePitch(data.samples, data.sampleRate),
    time: data.time,
    epoch: data.epoch,
  });
};
