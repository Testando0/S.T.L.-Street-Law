import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.resolve(artifactDir, "../rio-livre/dist");
const indexPath = path.join(publicDir, "index.html");
const apkPath = path.join(artifactDir, "apk/rio-livre.apk");

let apkHashCache: { key: string; hash: string } | null = null;
// O hash e recalculado se o arquivo mudar em disco (deploy sem reiniciar o processo).
const apkSha256 = () => {
  try {
    const stat = statSync(apkPath);
    const key = `${stat.mtimeMs}:${stat.size}`;
    if (apkHashCache && apkHashCache.key === key) return apkHashCache.hash;
    const hash = createHash("sha256").update(readFileSync(apkPath)).digest("hex");
    apkHashCache = { key, hash };
    return hash;
  } catch {
    return "desconhecido";
  }
};

app.disable("x-powered-by");
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

app.use("/api", router);

app.get("/ws", (_req, res) => {
  res.status(426).json({ error: "WebSocket upgrade required" });
});

app.get("/download/rio-livre.apk", (req, res, next) => {
  if (!existsSync(apkPath)) {
    next();
    return;
  }
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("X-Apk-Sha256", apkSha256());
  res.download(apkPath, "rio-livre.apk", (error) => {
    if (error && !res.headersSent) next(error);
  });
});

app.use(
  express.static(publicDir, {
    index: false,
    fallthrough: true,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (path.extname(req.path)) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(indexPath, (error) => {
    if (error) next(error);
  });
});

export default app;
