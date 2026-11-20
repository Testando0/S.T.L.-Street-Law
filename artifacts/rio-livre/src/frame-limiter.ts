/**
 * Teto de FPS do laco de render (o `Application.targetFrameRate` do Unity).
 *
 * No mobile o custo e o dobro: um device que roda a 60 fps gasta a bateria e
 * esquenta o dobro para entregar o mesmo jogo. Fixar 30 fps deixa o frame
 * estavel (sem oscilacao de 45/55 fps), segura o clock da GPU e evita os
 * "GC spike > 5ms" quando o sistema precisa de CPU para matar processos.
 */
export class FrameLimiter {
  private interval: number;
  private last = 0;
  private dropped = 0;

  constructor(targetFPS: number) {
    this.interval = 1000 / clampFPS(targetFPS);
  }

  setTargetFPS(fps: number) {
    this.interval = 1000 / clampFPS(fps);
    this.last = 0;
  }

  get targetFPS(): number {
    return Math.round(1000 / this.interval);
  }

  /** Frames descartados pelo limite (o device renderizou mais do que a meta). */
  get droppedFrames(): number {
    return this.dropped;
  }

  /**
   * true quando o frame deve ser simulado e desenhado.
   * O resto do intervalo e descartado sem tocar na cena: nem update, nem render.
   */
  shouldRender(now: number): boolean {
    if (this.last === 0) {
      this.last = now;
      return true;
    }
    const elapsed = now - this.last;
    if (elapsed < this.interval) {
      this.dropped++;
      return false;
    }
    // mantem o resto do intervalo para nao acumular atraso (drift free)
    this.last = now - (elapsed % this.interval);
    return true;
  }

  reset() {
    this.last = 0;
  }
}

const clampFPS = (fps: number) => Math.max(1, Math.min(240, Number.isFinite(fps) ? fps : 30));
