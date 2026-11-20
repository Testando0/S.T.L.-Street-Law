import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(root, "../rio-livre/dist");
const destination = path.resolve(root, "assets/game");
const server = (process.env.RIO_SERVER_URL ?? "").trim().replace(/\/+$/, "");

if (!fs.existsSync(path.join(source, "index.html"))) {
  throw new Error(`Game build not found at ${source}`);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, {
  recursive: true,
  filter: (file) => !file.endsWith(".map"),
});

const indexPath = path.join(destination, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
const boot = `window.__RIO_APK__=true;window.__RIO_DEFAULT_SERVER__=${JSON.stringify(server).replace(/</g, "\\u003c")};`;
const scriptPattern = /<script type="module" crossorigin src="([^"]+)"><\/script>/;
const match = html.match(scriptPattern);
if (match) {
  html = html.replace(scriptPattern, `<script>${boot}</script>\n    <script defer src="${match[1]}"></script>`);
  html = html.replace(/ crossorigin/g, "");
}
fs.writeFileSync(indexPath, html);
console.log("Prepared RedRP APK assets.");
