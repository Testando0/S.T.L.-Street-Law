import "./style.css";
import { Game } from "./game";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");

const fail = (error: unknown) => {
  console.error(error);
  const label = document.querySelector("#loading-label");
  const percent = document.querySelector("#loading-percent");
  if (label) label.textContent = "Não foi possível iniciar o mundo. Recarregue a página.";
  if (percent) percent.textContent = "ERRO";
  document.querySelector("#loading-screen")?.classList.remove("fade-out");
};

if (canvas) {
  const game = new Game(canvas);
  (window as unknown as { __rioGame?: Game }).__rioGame = game;
  game.boot().catch(fail);
  window.addEventListener("unhandledrejection", (event) => {
    console.error(event.reason);
  });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    });
  }
} else {
  fail(new Error("Canvas não encontrado"));
}
