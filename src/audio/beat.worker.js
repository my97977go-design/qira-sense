import { analyzeBeat } from "./beat.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: analyzeBeat(data.samples, data.sampleRate) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
