// Serve the included production build. No npm install is required.
import http from "node:http";
import { createRankingStore } from "./ranking.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
if (!fs.existsSync(path.join(root, "index.html"))) {
  console.error("Build missing. Run npm ci and npm run build first.");
  process.exit(1);
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};
const store = createRankingStore(
  process.env.QIRA_RANKING_FILE ||
    fileURLToPath(new URL("../runtime/leaderboard.json", import.meta.url)),
  JSON.parse(
    fs.readFileSync(
      new URL("../src/data/leaderboard.json", import.meta.url),
      "utf8",
    ),
  ),
);
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
const server = http.createServer((req, res) => {
  if (req.url?.split("?")[0] === "/api/leaderboard") {
    if (req.method === "GET") {
      json(res, 200, { entries: store.list() });
      return;
    }
    if (req.method !== "POST") {
      json(res, 405, { error: "不支持的请求方式" });
      return;
    }
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}` &&
      req.headers.origin !== `https://${req.headers.host}`
    ) {
      json(res, 403, { error: "请求来源不匹配" });
      return;
    }
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 4096) {
        json(res, 413, { error: "提交内容过长" });
        req.destroy();
      }
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      try {
        const body = JSON.parse(data);
        store.submit(body);
        json(res, 200, { entries: store.list() });
      } catch (error) {
        json(res, 400, { error: error.message });
      }
    });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const file = path.resolve(root, "." + pathname.replaceAll("\\", "/"));
  if (!file.startsWith(root) && file !== path.resolve(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  const target = pathname === "/" ? path.join(root, "index.html") : file;
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(target)] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(target).pipe(res);
  });
});
const port = Number(process.env.PORT) || 5188;
server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `Qira Sense: http://127.0.0.1:${port}\nKeep this window open. Press Ctrl+C to stop.`,
  ),
);
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is in use. Close the previous Qira window or set PORT to another port.`
      : error.message,
  );
  process.exit(1);
});
