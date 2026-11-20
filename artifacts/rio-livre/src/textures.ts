import * as THREE from "three";
import { STOREFRONT_SHOPS } from "./config";
import { Rng } from "./util";

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
};

const asTexture = (
  c: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = colorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
};

const speckle = (ctx: CanvasRenderingContext2D, w: number, h: number, count: number, colors: string[], rng: Rng, max = 2.4) => {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[rng.int(0, colors.length - 1)]!;
    const s = rng.range(0.6, max);
    ctx.fillRect(rng.range(0, w), rng.range(0, h), s, s);
  }
};

const spacedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  spacing: number,
) => {
  const widths = Array.from(text).map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = "left";
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i]!, x, y);
    x += widths[i]! + spacing;
  }
  ctx.textAlign = "center";
};

const heartPath = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.38);
  ctx.bezierCurveTo(x - size * 1.05, y - size * 0.3, x - size * 0.78, y - size * 1.05, x, y - size * 0.52);
  ctx.bezierCurveTo(x + size * 0.78, y - size * 1.05, x + size * 1.05, y - size * 0.3, x, y + size * 0.38);
  ctx.closePath();
};

const FACADES = [
  ["#f2e3c6", "#c4a57b", "#5f93a6", "#ffd37a"],
  ["#dce9e0", "#a1bdb4", "#4c7b89", "#ffda86"],
  ["#ead6d2", "#b99a93", "#5c8a98", "#ffd27b"],
  ["#d7e4ed", "#9db3c3", "#426f8a", "#ffcf70"],
  ["#f1cf9f", "#c4935a", "#537a8b", "#ffe09a"],
  ["#ccd8d2", "#8c9f99", "#3b6573", "#ffcc6a"],
  ["#e4b8a0", "#b2765c", "#497480", "#ffc97a"],
  ["#efede1", "#b3b4a7", "#587b87", "#ffd781"],
];

export interface FacadeResult {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
}

export const makeFacadeTextures = (index: number, nightDensity = 0.55): FacadeResult => {
  const palette = FACADES[index % FACADES.length]!;
  const rng = new Rng(index * 991 + 17);
  const size = 512;
  const cols = 4;
  const rows = 3;
  const cellW = size / cols;
  const cellH = size / rows;
  const { c, ctx } = canvas(size, size);
  const { c: ce, ctx: ctxE } = canvas(size, size);
  const { c: cb, ctx: ctxB } = canvas(size, size);
  const { c: cr, ctx: ctxR } = canvas(size, size);

  ctxE.fillStyle = "#000";
  ctxE.fillRect(0, 0, size, size);
  ctxB.fillStyle = "#7c7c7c";
  ctxB.fillRect(0, 0, size, size);
  ctxR.fillStyle = "#d2d2d2";
  ctxR.fillRect(0, 0, size, size);

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, palette[0]!);
  grad.addColorStop(0.7, palette[1]!);
  grad.addColorStop(1, palette[1]!);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  speckle(ctx, size, size, 1500, ["rgba(255,255,255,.04)", "rgba(50,46,38,.05)", "rgba(120,110,90,.05)"], rng, 3);
  for (let i = 0; i < 10; i++) {
    const x = rng.range(0, size);
    ctx.fillStyle = `rgba(38,42,38,${rng.range(0.02, 0.06)})`;
    ctx.fillRect(x, 0, rng.range(4, 20), size);
  }
  for (let f = 0; f < rows; f++) {
    const y = f * cellH;
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.fillRect(0, y, size, 5);
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.fillRect(0, y + 5, size, 4);
    ctxB.fillStyle = "#9e9e9e";
    ctxB.fillRect(0, y, size, 9);
  }

  for (let f = 0; f < rows; f++) {
    for (let col = 0; col < cols; col++) {
      const bx = col * cellW;
      const by = f * cellH;
      const wx = bx + cellW * 0.2;
      const wy = by + cellH * 0.24;
      const ww = cellW * 0.6;
      const wh = cellH * 0.5;
      const frame = 4;

      ctx.fillStyle = "rgba(38,48,50,.9)";
      ctx.fillRect(wx - frame, wy - frame, ww + frame * 2, wh + frame * 2);
      const glass = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
      const lit = rng.chance(0.045);
      if (lit) {
        glass.addColorStop(0, "rgba(255,226,166,.92)");
        glass.addColorStop(0.55, "rgba(212,178,120,.85)");
        glass.addColorStop(1, "rgba(126,106,82,.95)");
      } else {
        glass.addColorStop(0, palette[2]!);
        glass.addColorStop(0.5, "rgba(48,69,77,.96)");
        glass.addColorStop(1, "rgba(22,32,36,.98)");
      }
      ctx.fillStyle = glass;
      ctx.fillRect(wx, wy, ww, wh);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(wx, wy + wh * 0.62);
      ctx.lineTo(wx + ww * 0.5, wy);
      ctx.lineTo(wx + ww * 0.72, wy);
      ctx.lineTo(wx, wy + wh * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "rgba(12,20,22,.7)";
      ctx.fillRect(wx + ww * 0.49, wy, 2.5, wh);
      if (rng.chance(0.24)) {
        ctx.fillStyle = "rgba(235,228,208,.5)";
        ctx.fillRect(wx, wy, ww, wh * rng.range(0.12, 0.35));
      }
      ctx.fillStyle = palette[1]!;
      ctx.fillRect(wx - 7, wy + wh + 3, ww + 14, 5);
      ctx.fillStyle = "rgba(0,0,0,.22)";
      ctx.fillRect(wx - 7, wy + wh + 8, ww + 14, 3);

      if (rng.chance(0.58)) {
        const balconyY = wy + wh + 13;
        ctx.fillStyle = "rgba(20,27,29,.48)";
        ctx.fillRect(wx - 6, balconyY, ww + 12, 3);
        ctx.fillStyle = "rgba(232,224,207,.82)";
        ctx.fillRect(wx - 6, balconyY + 3, ww + 12, 4);
        ctx.strokeStyle = "rgba(42,55,58,.92)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(wx - 6, balconyY + 4);
        ctx.lineTo(wx + ww + 6, balconyY + 4);
        ctx.moveTo(wx - 6, balconyY + 15);
        ctx.lineTo(wx + ww + 6, balconyY + 15);
        for (let bar = 0; bar <= 6; bar++) {
          const bx = wx - 5 + (bar / 6) * (ww + 10);
          ctx.moveTo(bx, balconyY + 4);
          ctx.lineTo(bx, balconyY + 15);
        }
        ctx.stroke();
        ctxB.fillStyle = "#bcbcbc";
        ctxB.fillRect(wx - 6, balconyY + 2, ww + 12, 8);
        ctxB.fillStyle = "#555";
        ctxB.fillRect(wx - 6, balconyY + 9, ww + 12, 8);
      }

      ctxB.fillStyle = "#d6d6d6";
      ctxB.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
      ctxB.fillStyle = "#505050";
      ctxB.fillRect(wx, wy, ww, wh);
      ctxB.fillStyle = "#9a9a9a";
      ctxB.fillRect(wx - 5, wy + wh + 2, ww + 10, 5);
      ctxR.fillStyle = "#8c8c8c";
      ctxR.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      ctxR.fillStyle = "#242424";
      ctxR.fillRect(wx, wy, ww, wh);

      if (rng.chance(nightDensity)) {
        const eg = ctxE.createLinearGradient(wx, wy, wx, wy + wh);
        const warm = rng.chance(0.8);
        eg.addColorStop(0, warm ? "rgba(255,226,160,.95)" : "rgba(182,235,228,.85)");
        eg.addColorStop(0.6, warm ? "rgba(255,184,96,.7)" : "rgba(120,210,210,.55)");
        eg.addColorStop(1, "rgba(0,0,0,.15)");
        ctxE.fillStyle = eg;
        ctxE.fillRect(wx, wy, ww, wh);
        if (rng.chance(0.35)) {
          ctxE.fillStyle = "rgba(0,0,0,.55)";
          ctxE.fillRect(wx, wy, ww, wh * rng.range(0.2, 0.5));
        }
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(40,44,38,${rng.range(0.02, 0.05)})`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(30, 110), rng.range(2, 8));
  }
  return {
    map: asTexture(c),
    emissive: asTexture(ce),
    bump: asTexture(cb, 1, 1, THREE.NoColorSpace),
    roughness: asTexture(cr, 1, 1, THREE.NoColorSpace),
  };
};

export interface StorefrontResult {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
}

export const storefrontBays = (index: number, bayCount = 2): string[] => {
  const out: string[] = [];
  for (let bay = 0; bay < bayCount; bay++) {
    out.push(STOREFRONT_SHOPS[(index * bayCount + bay) % STOREFRONT_SHOPS.length]!);
  }
  return out;
};

export const makeStorefrontTexture = (index: number, bayCount = 2): StorefrontResult => {
  const rng = new Rng(index * 433 + 71);
  const w = 256 * bayCount;
  const h = 256;
  const { c, ctx } = canvas(w, h);
  const { c: ce, ctx: ctxE } = canvas(w, h);
  const { c: cb, ctx: ctxB } = canvas(w, h);
  const { c: cr, ctx: ctxR } = canvas(w, h);
  const awnings = ["#c94f3d", "#1f7a68", "#d4a62d", "#2e6e91", "#8f4f78"];
  const walls = ["#d8cdb5", "#cfd8d2", "#e0cdc4", "#c9d3dc"];
  const wall = ctx.createLinearGradient(0, 0, 0, h);
  const wallColor = walls[index % walls.length]!;
  wall.addColorStop(0, wallColor);
  wall.addColorStop(1, "#a89d88");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, h);
  ctxE.fillStyle = "#000";
  ctxE.fillRect(0, 0, w, h);
  ctxB.fillStyle = "#808080";
  ctxB.fillRect(0, 0, w, h);
  ctxR.fillStyle = "#b4b4b4";
  ctxR.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 700, ["rgba(255,255,255,.05)", "rgba(50,44,36,.07)"], rng, 3);

  const productColors = ["#d9534f", "#f0ad4e", "#5bc0de", "#5cb85c", "#e8d9b0", "#9b6fb5", "#f7f1e1"];

  for (let bay = 0; bay < bayCount; bay++) {
    const bx = bay * 256;
    const name = STOREFRONT_SHOPS[(index * bayCount + bay) % STOREFRONT_SHOPS.length]!;
    const awn = awnings[rng.int(0, awnings.length - 1)]!;

    ctx.fillStyle = "rgba(0,0,0,.14)";
    ctx.fillRect(bx, 0, 4, h);
    ctx.fillRect(bx + 252, 0, 4, h);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(bx + 4, 0, 2, h);

    const signX = bx + 10;
    const signY = 16;
    const signW = 236;
    const signH = 56;
    const board = ctx.createLinearGradient(0, signY, 0, signY + signH);
    board.addColorStop(0, "#343a3a");
    board.addColorStop(1, "#1b1f1f");
    ctx.fillStyle = "#0e1111";
    ctx.fillRect(signX - 3, signY - 3, signW + 6, signH + 6);
    ctx.fillStyle = board;
    ctx.fillRect(signX, signY, signW, signH);
    ctx.fillStyle = awn;
    ctx.fillRect(signX, signY + signH - 8, signW, 8);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(signX, signY, signW, 2);
    ctx.strokeStyle = "rgba(247,231,189,.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(signX + 6, signY + 6, signW - 12, signH - 20);
    ctx.textAlign = "center";
    ctx.font = "900 30px Trebuchet MS, Arial, sans-serif";
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillText(name, bx + 130, signY + 36);
    ctx.fillStyle = "#fbeec5";
    ctx.fillText(name, bx + 128, signY + 34);
    ctxE.fillStyle = "#ffd489";
    ctxE.font = "900 30px Trebuchet MS, Arial, sans-serif";
    ctxE.textAlign = "center";
    ctxE.fillText(name, bx + 128, signY + 34);
    ctxE.fillStyle = awn;
    ctxE.fillRect(signX, signY + signH - 8, signW, 8);
    ctxE.strokeStyle = "rgba(255,210,130,.7)";
    ctxE.lineWidth = 1.5;
    ctxE.strokeRect(signX + 6, signY + 6, signW - 12, signH - 20);
    ctxB.fillStyle = "#b8b8b8";
    ctxB.fillRect(signX - 3, signY - 3, signW + 6, signH + 6);

    ctx.fillStyle = awn;
    ctx.fillRect(bx + 8, 78, 240, 9);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(bx + 8, 87, 240, 4);

    const gx = bx + 20;
    const gy = 96;
    const gw = 216;
    const gh = 118;
    ctx.fillStyle = "#12171a";
    ctx.fillRect(gx - 6, gy - 6, gw + 12, gh + 12);
    const glass = ctx.createLinearGradient(gx, gy, gx, gy + gh);
    glass.addColorStop(0, "#35494c");
    glass.addColorStop(0.5, "#6d5c3e");
    glass.addColorStop(1, "#2a2218");
    ctx.fillStyle = glass;
    ctx.fillRect(gx, gy, gw, gh);

    const shelfRows = 3;
    for (let r = 0; r < shelfRows; r++) {
      const sy = gy + 24 + r * 32;
      ctx.fillStyle = "rgba(20,14,8,.7)";
      ctx.fillRect(gx + 8, sy + 22, gw - 16, 4);
      let px = gx + 12;
      while (px < gx + gw - 26) {
        const pw = rng.range(10, 22);
        const ph = rng.range(10, 20);
        ctx.fillStyle = productColors[rng.int(0, productColors.length - 1)]!;
        ctx.fillRect(px, sy + 22 - ph, pw, ph);
        ctx.fillStyle = "rgba(255,255,255,.22)";
        ctx.fillRect(px, sy + 22 - ph, pw, 2);
        px += pw + rng.range(3, 8);
      }
    }
    ctx.fillStyle = "rgba(255,225,170,.5)";
    ctx.fillRect(gx + 8, gy + 8, gw - 16, 5);
    ctx.fillStyle = "#1a1512";
    ctx.fillRect(gx, gy + gh - 18, gw, 18);

    const hasDoor = bay % 2 === 0 && index % 2 === 0;
    if (hasDoor) {
      ctx.fillStyle = "#0f1517";
      ctx.fillRect(gx + gw * 0.6, gy, gw * 0.4, gh);
      const door = ctx.createLinearGradient(gx + gw * 0.62, gy, gx + gw * 0.62, gy + gh);
      door.addColorStop(0, "#3d5a5e");
      door.addColorStop(1, "#16222a");
      ctx.fillStyle = door;
      ctx.fillRect(gx + gw * 0.62, gy + 4, gw * 0.36, gh - 4);
      ctx.fillStyle = "#d6dbd4";
      ctx.fillRect(gx + gw * 0.64, gy + gh * 0.45, 3, 16);
    }
    ctx.fillStyle = "#12171a";
    ctx.fillRect(gx + gw * 0.33, gy, 4, gh);

    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(gx, gy + gh * 0.75);
    ctx.lineTo(gx + gw * 0.42, gy);
    ctx.lineTo(gx + gw * 0.58, gy);
    ctx.lineTo(gx, gy + gh);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#6f675b";
    ctx.fillRect(bx + 4, 220, 248, 36);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    for (let tx = 0; tx < 248; tx += 31) ctx.fillRect(bx + 4 + tx, 220, 2, 36);
    ctx.fillRect(bx + 4, 238, 248, 2);
    ctx.fillStyle = "rgba(255,255,255,.14)";
    ctx.fillRect(bx + 4, 220, 248, 3);

    ctxB.fillStyle = "#b8b8b8";
    ctxB.fillRect(gx - 6, gy - 6, gw + 12, gh + 12);
    ctxB.fillStyle = "#3a3a3a";
    ctxB.fillRect(gx, gy, gw, gh);
    ctxB.fillStyle = "#9a9a9a";
    ctxB.fillRect(gx + gw * 0.33, gy, 4, gh);
    ctxB.fillStyle = "#6a6a6a";
    for (let tx = 0; tx < 248; tx += 31) ctxB.fillRect(bx + 4 + tx, 220, 2, 36);
    ctxR.fillStyle = "#4a4a4a";
    ctxR.fillRect(gx, gy, gw, gh);
    ctxR.fillStyle = "#8a8a8a";
    ctxR.fillRect(bx + 4, 220, 248, 36);
    ctxE.fillStyle = "rgba(255,200,120,.32)";
    ctxE.fillRect(gx, gy + 6, gw, gh - 24);
    ctxE.fillStyle = "rgba(255,225,170,.7)";
    ctxE.fillRect(gx + 8, gy + 8, gw - 16, 5);
  }
  return {
    map: asTexture(c),
    emissive: asTexture(ce),
    bump: asTexture(cb, 1, 1, THREE.NoColorSpace),
    roughness: asTexture(cr, 1, 1, THREE.NoColorSpace),
  };
};

export const makeUpperFloorTextures = (index: number): FacadeResult => {
  const palette = FACADES[(index + 3) % FACADES.length]!;
  const rng = new Rng(index * 577 + 131);
  const size = 512;
  const floorH = size / 2;
  const cellW = size / 2;
  const { c, ctx } = canvas(size, size);
  const { c: ce, ctx: ctxE } = canvas(size, size);
  const { c: cb, ctx: ctxB } = canvas(size, size);
  const { c: cr, ctx: ctxR } = canvas(size, size);

  const wall = ctx.createLinearGradient(0, 0, 0, size);
  wall.addColorStop(0, palette[0]!);
  wall.addColorStop(1, palette[1]!);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, 1600, ["rgba(255,255,255,.05)", "rgba(50,46,38,.06)", "rgba(110,100,80,.05)"], rng, 3);
  ctxE.fillStyle = "#000";
  ctxE.fillRect(0, 0, size, size);
  ctxB.fillStyle = "#808080";
  ctxB.fillRect(0, 0, size, size);
  ctxR.fillStyle = "#d0d0d0";
  ctxR.fillRect(0, 0, size, size);

  const curtains = ["#e8d9b8", "#c97b6d", "#8fb3a5", "#d9c27a", "#b7a6c9"];
  for (let f = 0; f < 2; f++) {
    const fy = f * floorH;
    ctx.fillStyle = "rgba(255,255,255,.2)";
    ctx.fillRect(0, fy + floorH - 14, size, 3);
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.fillRect(0, fy + floorH - 11, size, 8);
    ctxB.fillStyle = "#a4a4a4";
    ctxB.fillRect(0, fy + floorH - 14, size, 4);
    for (let cx = 0; cx < 2; cx++) {
      const x0 = cx * cellW;
      const ww = 132;
      const wh = 150;
      const wx = x0 + (cellW - ww) / 2;
      const wy = fy + 50;
      const state = rng.int(0, 4);

      ctx.fillStyle = "rgba(0,0,0,.16)";
      ctx.fillRect(wx - 12, wy - 10, ww + 24, wh + 36);
      ctx.fillStyle = "#e9e2d1";
      ctx.fillRect(wx - 8, wy - 8, ww + 16, 8);
      ctx.fillStyle = "#1c2327";
      ctx.fillRect(wx - 5, wy - 2, ww + 10, wh + 10);
      const glass = ctx.createLinearGradient(wx, wy, wx + ww * 0.7, wy + wh);
      glass.addColorStop(0, "#7ea5b3");
      glass.addColorStop(0.5, "#35525e");
      glass.addColorStop(1, "#1b2d36");
      ctx.fillStyle = glass;
      ctx.fillRect(wx, wy + 3, ww, wh);

      if (state === 1) {
        ctx.fillStyle = curtains[rng.int(0, curtains.length - 1)]!;
        ctx.fillRect(wx, wy + 3, ww, wh * 0.55);
        ctx.fillStyle = "rgba(255,255,255,.18)";
        for (let s = 0; s < ww; s += 12) ctx.fillRect(wx + s, wy + 3, 3, wh * 0.55);
      } else if (state === 2) {
        ctx.fillStyle = "#d9d6cc";
        for (let s = 0; s < wh * 0.7; s += 9) ctx.fillRect(wx, wy + 3 + s, ww, 6);
      } else if (state === 3) {
        ctx.fillStyle = "#3f6b4c";
        ctx.fillRect(wx - 16, wy - 2, 18, wh + 10);
        ctx.fillRect(wx + ww - 2, wy - 2, 18, wh + 10);
        ctx.fillStyle = "rgba(0,0,0,.25)";
        for (let s = 0; s < wh; s += 8) {
          ctx.fillRect(wx - 16, wy + s, 18, 2);
          ctx.fillRect(wx + ww - 2, wy + s, 18, 2);
        }
      }

      ctx.fillStyle = "#1c2327";
      ctx.fillRect(wx + ww / 2 - 2, wy + 3, 4, wh);
      ctx.fillRect(wx, wy + wh * 0.42, ww, 4);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(wx, wy + wh * 0.8);
      ctx.lineTo(wx + ww * 0.5, wy + 3);
      ctx.lineTo(wx + ww * 0.72, wy + 3);
      ctx.lineTo(wx, wy + wh);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#f0ebdd";
      ctx.fillRect(wx - 10, wy + wh + 8, ww + 20, 8);
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(wx - 6, wy + wh + 16, ww + 12, 4);
      const stain = ctx.createLinearGradient(0, wy + wh + 16, 0, wy + wh + 16 + 56);
      stain.addColorStop(0, "rgba(40,36,30,.16)");
      stain.addColorStop(1, "rgba(40,36,30,0)");
      ctx.fillStyle = stain;
      ctx.fillRect(wx + 8, wy + wh + 16, ww - 16, 56);

      if (state === 4 && cx === 0) {
        ctx.fillStyle = "#cfd3d1";
        ctx.fillRect(x0 + 8, wy + wh + 22, 46, 30);
        ctx.fillStyle = "#8d9593";
        ctx.fillRect(x0 + 12, wy + wh + 26, 38, 22);
        ctx.fillStyle = "#6b7270";
        for (let s = 0; s < 4; s++) ctx.fillRect(x0 + 14, wy + wh + 29 + s * 5, 34, 2);
      }

      ctxB.fillStyle = "#b4b4b4";
      ctxB.fillRect(wx - 5, wy - 2, ww + 10, wh + 10);
      ctxB.fillStyle = "#454545";
      ctxB.fillRect(wx, wy + 3, ww, wh);
      ctxB.fillStyle = "#c0c0c0";
      ctxB.fillRect(wx - 10, wy + wh + 8, ww + 20, 8);
      ctxR.fillStyle = "#3a3a3a";
      ctxR.fillRect(wx, wy + 3, ww, wh);

      const lit = rng.chance(0.62);
      if (lit) {
        const warm = ctxE.createLinearGradient(wx, wy, wx, wy + wh);
        warm.addColorStop(0, "rgba(255,214,140,.95)");
        warm.addColorStop(1, "rgba(255,170,90,.8)");
        ctxE.fillStyle = warm;
        ctxE.fillRect(wx + 4, wy + 7, ww - 8, wh - 8);
        ctxE.fillStyle = "#000";
        ctxE.fillRect(wx + ww / 2 - 2, wy + 3, 4, wh);
        ctxE.fillRect(wx, wy + wh * 0.42, ww, 4);
      }
    }
  }
  return {
    map: asTexture(c),
    emissive: asTexture(ce),
    bump: asTexture(cb, 1, 1, THREE.NoColorSpace),
    roughness: asTexture(cr, 1, 1, THREE.NoColorSpace),
  };
};

export const makeFavelaTexture = () => {
  const rng = new Rng(9187);
  const { c, ctx } = canvas(256, 256);
  const { c: cb, ctx: ctxB } = canvas(256, 256);
  ctx.fillStyle = "#e3ddd1";
  ctx.fillRect(0, 0, 256, 256);
  ctxB.fillStyle = "#858585";
  ctxB.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const g = 190 + rng.int(0, 55);
    ctx.fillStyle = `rgba(${g},${g - 4},${g - 12},.25)`;
    ctx.fillRect(rng.range(0, 256), rng.range(0, 256), rng.range(1, 5), rng.range(1, 5));
  }
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = "rgba(126,86,64,.18)";
    ctx.fillRect(rng.range(0, 230), rng.range(0, 240), rng.range(10, 30), rng.range(6, 15));
  }
  const wx = 78;
  const wy = 54;
  const ww = 100;
  const wh = 82;
  ctx.fillStyle = "rgba(48,54,51,.9)";
  ctx.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
  ctx.fillStyle = "#2a3433";
  ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = "rgba(160,190,190,.35)";
  ctx.fillRect(wx + 8, wy + 8, ww - 16, 18);
  ctx.fillStyle = "rgba(120,140,140,.35)";
  ctx.fillRect(wx + ww * 0.48, wy, 5, wh);
  ctx.fillRect(wx, wy + wh * 0.5, ww, 5);
  ctx.fillStyle = "#b24434";
  ctx.fillRect(wx - 8, wy + wh + 2, ww + 16, 8);
  const dx = 88;
  const dy = 178;
  ctx.fillStyle = "#35403e";
  ctx.fillRect(dx, dy, 80, 78);
  ctx.fillStyle = "#1d2624";
  ctx.fillRect(dx + 7, dy + 7, 66, 64);
  ctx.fillStyle = "#c7b78f";
  ctx.fillRect(dx + 63, dy + 44, 5, 7);
  ctxB.fillStyle = "#d2d2d2";
  ctxB.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
  ctxB.fillStyle = "#585858";
  ctxB.fillRect(wx, wy, ww, wh);
  ctxB.fillStyle = "#ababab";
  ctxB.fillRect(dx, dy, 80, 78);
  ctxB.fillStyle = "#4e4e4e";
  ctxB.fillRect(dx + 7, dy + 7, 66, 64);
  return { map: asTexture(c), bump: asTexture(cb, 1, 1, THREE.NoColorSpace) };
};

export const makeRoofTexture = () => {
  const rng = new Rng(5123);
  const { c, ctx } = canvas(256, 256);
  const { c: cb, ctx: ctxB } = canvas(256, 256);
  ctx.fillStyle = "#555b57";
  ctx.fillRect(0, 0, 256, 256);
  ctxB.fillStyle = "#909090";
  ctxB.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const g = 68 + rng.int(0, 46);
    ctx.fillStyle = `rgba(${g},${g + 3},${g},.45)`;
    ctx.fillRect(rng.range(0, 256), rng.range(0, 256), rng.range(1, 3), rng.range(1, 3));
    ctxB.fillStyle = `rgba(${g + 50},${g + 50},${g + 50},.4)`;
    ctxB.fillRect(rng.range(0, 256), rng.range(0, 256), rng.range(1, 3), rng.range(1, 3));
  }
  ctx.strokeStyle = "rgba(30,32,30,.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 256, 256);
  return asTexture(c);
};

export const makePromenadeTexture = () => {
  const rng = new Rng(7331);
  const { c, ctx } = canvas(512, 512);
  const { c: cb, ctx: ctxB } = canvas(512, 512);
  ctx.fillStyle = "#e9dec1";
  ctx.fillRect(0, 0, 512, 512);
  ctxB.fillStyle = "#909090";
  ctxB.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "#3a3932";
  ctx.lineWidth = 22;
  for (let y = -96; y < 640; y += 96) {
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const yy = y + Math.sin((x / 512) * Math.PI * 2) * 30;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,.4)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 500; i++) {
    const g = 72 + rng.int(0, 30);
    ctx.fillStyle = `rgba(${g},${g},${g - 4},${rng.range(0.01, 0.05)})`;
    ctx.fillRect(rng.range(0, 512), rng.range(0, 512), rng.range(1, 3), rng.range(1, 3));
  }
  return asTexture(c, 1.4, 14);
};

export const makeSandTexture = () => {
  const rng = new Rng(611);
  const { c, ctx } = canvas(512, 512);
  const { c: cb, ctx: ctxB } = canvas(512, 512);
  ctx.fillStyle = "#e5cd96";
  ctx.fillRect(0, 0, 512, 512);
  ctxB.fillStyle = "#8f8f8f";
  ctxB.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    const r = 150 + rng.int(0, 70);
    const g = 120 + rng.int(0, 60);
    const b = 60 + rng.int(0, 50);
    ctx.fillStyle = `rgba(${r},${g},${b},${rng.range(0.05, 0.22)})`;
    ctx.fillRect(rng.range(0, 512), rng.range(0, 512), rng.range(1, 2.6), rng.range(1, 2.6));
    ctxB.fillStyle = `rgba(${100 + rng.int(0, 60)},${100 + rng.int(0, 60)},${100 + rng.int(0, 60)},.28)`;
    ctxB.fillRect(rng.range(0, 512), rng.range(0, 512), rng.range(1, 3), rng.range(1, 3));
  }
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(255,240,200,${rng.range(0.04, 0.13)})`;
    ctx.lineWidth = rng.range(1, 3);
    ctx.beginPath();
    const y = rng.range(0, 512);
    for (let x = 0; x <= 512; x += 16) {
      const yy = y + Math.sin((x / 512) * Math.PI * 4 + i) * 7;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  return { map: asTexture(c, 10, 22), bump: asTexture(cb, 10, 22, THREE.NoColorSpace) };
};

export const makeAsphaltTextures = () => {
  const rng = new Rng(2401);
  const { c, ctx } = canvas(512, 512);
  const { c: cb, ctx: ctxB } = canvas(512, 512);
  const { c: cr, ctx: ctxR } = canvas(512, 512);
  ctx.fillStyle = "#303638";
  ctx.fillRect(0, 0, 512, 512);
  ctxB.fillStyle = "#828282";
  ctxB.fillRect(0, 0, 512, 512);
  ctxR.fillStyle = "#c8c8c8";
  ctxR.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6500; i++) {
    const g = 44 + rng.int(0, 50);
    ctx.fillStyle = `rgba(${g},${g + 2},${g + 1},${rng.range(0.08, 0.4)})`;
    const x = rng.range(0, 512);
    const y = rng.range(0, 512);
    const s = rng.range(0.7, 2.3);
    ctx.fillRect(x, y, s, s);
    if (rng.chance(0.55)) {
      ctxB.fillStyle = `rgba(${100 + rng.int(0, 90)},${100 + rng.int(0, 90)},${100 + rng.int(0, 90)},.35)`;
      ctxB.fillRect(x, y, s, s);
    }
  }
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = `rgba(22,26,27,${rng.range(0.08, 0.2)})`;
    ctx.beginPath();
    ctx.ellipse(rng.range(40, 470), rng.range(40, 470), rng.range(20, 70), rng.range(12, 44), rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
    ctxR.fillStyle = "rgba(80,80,80,.5)";
    ctxR.beginPath();
    ctx.ellipse(rng.range(40, 470), rng.range(40, 470), rng.range(20, 70), rng.range(12, 44), rng.range(0, 3), 0, Math.PI * 2);
    ctxR.fill();
  }
  for (let i = 0; i < 7; i++) {
    let x = rng.range(60, 450);
    let y = rng.range(60, 450);
    ctx.strokeStyle = `rgba(16,19,20,${rng.range(0.25, 0.55)})`;
    ctx.lineWidth = rng.range(1, 2.4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += rng.range(-22, 22);
      y += rng.range(8, 28);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return {
    map: asTexture(c),
    bump: asTexture(cb, 1, 1, THREE.NoColorSpace),
    roughness: asTexture(cr, 1, 1, THREE.NoColorSpace),
  };
};

export const makeSidewalkTexture = () => {
  const rng = new Rng(8842);
  const { c, ctx } = canvas(512, 512);
  const { c: cb, ctx: ctxB } = canvas(512, 512);
  ctx.fillStyle = "#c4bca9";
  ctx.fillRect(0, 0, 512, 512);
  ctxB.fillStyle = "#858585";
  ctxB.fillRect(0, 0, 512, 512);
  const step = 128;
  for (let y = 0; y < 512; y += step) {
    for (let x = 0; x < 512; x += step) {
      const tone = 190 + rng.int(0, 24);
      ctx.fillStyle = `rgb(${tone},${tone - 6},${tone - 20})`;
      ctx.fillRect(x + 4, y + 4, step - 8, step - 8);
      ctxB.fillStyle = "#b2b2b2";
      ctxB.fillRect(x + 4, y + 4, step - 8, step - 8);
      ctx.strokeStyle = "rgba(88,82,70,.22)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, y + 4, step - 8, step - 8);
    }
  }
  speckle(ctx, 512, 512, 1800, ["rgba(70,64,52,.08)", "rgba(255,255,255,.08)"], rng, 2.2);
  return {
    map: asTexture(c, 7, 7),
    bump: asTexture(cb, 7, 7, THREE.NoColorSpace),
  };
};

export const makeCityGroundTexture = () => {
  const rng = new Rng(3301);
  const { c, ctx } = canvas(512, 512);
  ctx.fillStyle = "#b8b09d";
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 512, 3800, ["rgba(255,255,255,.05)", "rgba(68,62,52,.06)", "rgba(120,112,98,.05)"], rng, 3);
  for (let i = 0; i < 20; i++) {
    ctx.strokeStyle = "rgba(90,84,72,.08)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const y = rng.range(0, 512);
    ctx.moveTo(0, y);
    ctx.lineTo(512, y + rng.range(-12, 12));
    ctx.stroke();
  }
  return asTexture(c, 24, 26);
};

export const makeGrassTexture = () => {
  const rng = new Rng(5501);
  const { c, ctx } = canvas(512, 512);
  ctx.fillStyle = "#61784f";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const g = 70 + rng.int(0, 60);
    ctx.fillStyle = `rgba(${g - 18},${g + 18},${g - 26},${rng.range(0.08, 0.3)})`;
    ctx.fillRect(rng.range(0, 512), rng.range(0, 512), rng.range(0.8, 2.4), rng.range(1.2, 4.2));
  }
  return asTexture(c, 18, 18);
};

/** Piso do salao das lojas: porcelanato xadrez com rejunte. */
export const makeShopFloorTexture = () => {
  const rng = new Rng(4417);
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#b9b2a4";
  ctx.fillRect(0, 0, 256, 256);
  const tile = 64;
  for (let y = 0; y < 256; y += tile) {
    for (let x = 0; x < 256; x += tile) {
      const dark = ((x / tile + y / tile) & 1) === 0;
      const base = dark ? 206 : 232;
      ctx.fillStyle = `rgb(${base},${base - 4},${base - (dark ? 16 : 8)})`;
      ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
      ctx.strokeStyle = "rgba(90,84,74,.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, tile - 4, tile - 4);
    }
  }
  speckle(ctx, 256, 256, 700, ["rgba(60,54,46,.07)", "rgba(255,255,255,.09)"], rng, 1.6);
  return asTexture(c, 6, 6);
};

/** Parede do salao: papel de parede listrado com rodape. */
export const makeShopWallTexture = () => {
  const rng = new Rng(9133);
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#efe3cd";
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = "rgba(196,176,142,.22)";
    ctx.fillRect(x, 0, 8, 256);
  }
  ctx.fillStyle = "rgba(120,104,80,.16)";
  ctx.fillRect(0, 0, 256, 12);
  speckle(ctx, 256, 256, 500, ["rgba(90,78,58,.06)", "rgba(255,255,255,.08)"], rng, 1.4);
  return asTexture(c, 3, 1.4);
};

export const makeSignTexture = (title: string, sub: string, bg = "#11221d", fg = "#ffd166", accent = "#ff6b35") => {
  const { c, ctx } = canvas(1024, 384);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 384);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 26, 384);
  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.fillRect(26, 0, 998, 7);
  ctx.textAlign = "center";
  ctx.fillStyle = fg;
  ctx.font = "900 116px Impact, Arial Black, sans-serif";
  ctx.fillText(title.toUpperCase().slice(0, 18), 526, 176);
  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.font = "700 44px Trebuchet MS, sans-serif";
  ctx.fillText(sub.toUpperCase().slice(0, 40), 526, 266);
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 7;
  ctx.strokeRect(46, 30, 932, 320);
  return asTexture(c);
};

export const makeGhostCitySignTexture = () => {
  const w = 2048;
  const h = 640;
  const { c, ctx } = canvas(w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#472033");
  bg.addColorStop(0.5, "#21121f");
  bg.addColorStop(1, "#100d19");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w / 2, 250, 30, w / 2, 250, 720);
  glow.addColorStop(0, "rgba(255,117,157,.28)");
  glow.addColorStop(0.45, "rgba(255,174,190,.08)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#e8a6b9";
  ctx.lineWidth = 10;
  ctx.strokeRect(38, 38, w - 76, h - 76);
  ctx.strokeStyle = "rgba(255,221,230,.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(62, 62, w - 124, h - 124);

  ctx.fillStyle = "rgba(255,255,255,.04)";
  ctx.beginPath();
  ctx.moveTo(70, 470);
  ctx.lineTo(520, 70);
  ctx.lineTo(760, 70);
  ctx.lineTo(70, 560);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.shadowColor = "#ff6b9d";
  ctx.shadowBlur = 36;
  ctx.fillStyle = "#ff9cba";
  heartPath(ctx, 210, 265, 62);
  ctx.fill();
  heartPath(ctx, w - 210, 265, 62);
  ctx.fill();
  ctx.restore();

  const roseGold = ctx.createLinearGradient(0, 130, 0, 340);
  roseGold.addColorStop(0, "#fff2de");
  roseGold.addColorStop(0.38, "#ffd3d7");
  roseGold.addColorStop(0.62, "#e9a1b8");
  roseGold.addColorStop(1, "#fff0d5");
  ctx.font = "900 244px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,.55)";
  spacedText(ctx, "GHOSTCITY", w / 2 + 6, 294, 18);
  ctx.fillStyle = roseGold;
  spacedText(ctx, "GHOSTCITY", w / 2, 286, 18);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#ffd7e1";
  ctx.font = "800 52px Trebuchet MS, Arial, sans-serif";
  spacedText(ctx, "A CIDADE DO AMOR", w / 2, 444, 14);
  ctx.fillStyle = "rgba(255,241,244,.76)";
  ctx.font = "600 28px Trebuchet MS, Arial, sans-serif";
  spacedText(ctx, "REDRP  ·  FUNDADA COM AMOR  ·  EM HOMENAGEM AO NATHAN", w / 2, 518, 5);

  ctx.strokeStyle = "rgba(255,189,208,.75)";
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + side * 660, 458);
    ctx.lineTo(w / 2 + side * 750, 458);
    ctx.stroke();
    ctx.fillStyle = "#ffb0c3";
    ctx.save();
    ctx.translate(w / 2 + side * 780, 458);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
  }
  return asTexture(c);
};

export const makeDedicationTexture = () => {
  const w = 1024;
  const h = 512;
  const { c, ctx } = canvas(w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#26302c");
  bg.addColorStop(0.55, "#151d1a");
  bg.addColorStop(1, "#0c1210");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#b68b3b";
  ctx.lineWidth = 12;
  ctx.strokeRect(28, 28, w - 56, h - 56);
  ctx.strokeStyle = "rgba(240,210,150,.25)";
  ctx.lineWidth = 3;
  ctx.strokeRect(50, 50, w - 100, h - 100);
  const gl = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 460);
  gl.addColorStop(0, "rgba(255,220,150,.08)");
  gl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#d8b05e";
  ctx.font = "700 34px Georgia, 'Times New Roman', serif";
  spacedText(ctx, "GHOSTCITY", w / 2, 124, 10);
  const gold = ctx.createLinearGradient(0, 160, 0, 400);
  gold.addColorStop(0, "#fff2c7");
  gold.addColorStop(0.55, "#e8c777");
  gold.addColorStop(1, "#b98b3d");
  ctx.fillStyle = gold;
  ctx.font = "italic 700 58px Georgia, 'Times New Roman', serif";
  ctx.fillText("Uma cidade fundada com amor", w / 2, 226);
  ctx.fillText("em homenagem ao Nathan,", w / 2, 300);
  ctx.fillText("pelo Redzin.", w / 2, 374);
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = "600 24px Trebuchet MS, sans-serif";
  spacedText(ctx, "COM CARINHO, PARA SEMPRE", w / 2, 446, 5);
  return asTexture(c);
};

export const makeBillboardTexture = (glyph: string, color: string, label = "") => {
  const { c, ctx } = canvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.fillStyle = "rgba(9,25,25,.92)";
  ctx.arc(128, 112, 82, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.font = "900 106px Arial, sans-serif";
  ctx.fillText(glyph, 128, 110);
  if (label) {
    ctx.fillStyle = "#fff";
    ctx.font = "800 28px Trebuchet MS, sans-serif";
    ctx.fillText(label.toUpperCase(), 128, 238);
  }
  return asTexture(c);
};

export const makeMuralTexture = () => {
  const { c, ctx } = canvas(512, 256);
  const wall = ctx.createLinearGradient(0, 0, 512, 256);
  wall.addColorStop(0, "#eed9cb");
  wall.addColorStop(1, "#c4a8ad");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, 512, 256);
  const colors = ["#e84a78", "#f58daf", "#ffd166", "#a64d79", "#c84c68", "#42253b"];
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = colors[i % colors.length]!;
    ctx.globalAlpha = 0.75;
    const x = Math.random() * 512;
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.arc(x, y, 18 + Math.random() * 55, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 100, y - 80, x - 60, y + 80, x + 120, y + 30);
    ctx.lineWidth = 8;
    ctx.strokeStyle = colors[(i + 2) % colors.length]!;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.shadowColor = "rgba(158,35,82,.3)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#f33f79";
  heartPath(ctx, 256, 106, 54);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(40,17,35,.86)";
  ctx.font = "900 42px Impact, Arial Black, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GHOSTCITY", 256, 151);
  ctx.fillStyle = "#fff0f3";
  ctx.font = "800 18px Trebuchet MS, sans-serif";
  ctx.fillText("CIDADE DO AMOR · REDRP", 256, 181);
  return asTexture(c);
};

export const makeShadowTexture = () => {
  const { c, ctx } = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return asTexture(c);
};

export const makeCloudTexture = () => {
  const { c, ctx } = canvas(512, 256);
  ctx.clearRect(0, 0, 512, 256);
  const puffs = [
    [140, 144, 110],
    [240, 116, 130],
    [356, 144, 96],
    [200, 176, 84],
    [300, 180, 72],
    [420, 160, 58],
  ];
  ctx.filter = "blur(4px)";
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x!, y!, 6, x!, y!, r!);
    g.addColorStop(0, "rgba(255,255,255,.92)");
    g.addColorStop(0.55, "rgba(255,255,255,.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x!, y!, r!, 0, Math.PI * 2);
    ctx.fill();
  }
  return asTexture(c);
};

export const makeWaterNormalTexture = () => {
  const size = 256;
  const { c, ctx } = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const height = (x: number, y: number) =>
    Math.sin(x * 0.08 + Math.cos(y * 0.05) * 2) * 0.5 +
    Math.sin(y * 0.11 - x * 0.03) * 0.32 +
    Math.sin((x + y) * 0.045) * 0.18;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hl = height(x - 1, y);
      const hr = height(x + 1, y);
      const hu = height(x, y - 1);
      const hd = height(x, y + 1);
      const nx = (hl - hr) * 0.8;
      const ny = (hu - hd) * 0.8;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return asTexture(c, 18, 22, THREE.NoColorSpace);
};

export const makePalmFrondTexture = () => {
  const { c, ctx } = canvas(256, 1024);
  const rng = new Rng(9182);
  ctx.clearRect(0, 0, 256, 1024);
  const cx = 128;
  const baseY = 1008;
  const tipY = 18;
  const span = baseY - tipY;
  const greens = ["#2b6b36", "#347b3e", "#3f8a48", "#245f31", "#4a944f"];
  for (let i = 0; i < 48; i++) {
    const t = i / 47;
    const y = baseY - t * span * 0.96;
    const envelope = Math.sin(Math.PI * Math.pow(t, 0.72));
    const length = 14 + 116 * envelope * (1 - t * 0.2);
    for (const side of [-1, 1]) {
      const tipOffset = rng.range(-5, 5);
      const tipX = cx + side * length;
      const tipYLeaf = y - length * rng.range(0.4, 0.56) + tipOffset;
      const midX = cx + side * length * 0.53;
      const midY = y - length * rng.range(0.05, 0.16);
      ctx.beginPath();
      ctx.moveTo(cx + side * 3, y + 4);
      ctx.quadraticCurveTo(midX, midY, tipX, tipYLeaf);
      ctx.quadraticCurveTo(cx + side * length * 0.44, y + length * 0.12, cx + side * 2, y - 3);
      ctx.closePath();
      ctx.fillStyle = greens[rng.int(0, greens.length - 1)]!;
      ctx.globalAlpha = rng.range(0.82, 1);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  const rib = ctx.createLinearGradient(0, tipY, 0, baseY);
  rib.addColorStop(0, "#4c8a45");
  rib.addColorStop(0.55, "#6b8a3e");
  rib.addColorStop(1, "#7d6f3b");
  ctx.strokeStyle = rib;
  ctx.lineCap = "round";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.quadraticCurveTo(cx + 4, baseY - span * 0.55, cx, tipY);
  ctx.stroke();
  ctx.strokeStyle = "rgba(230,226,170,.24)";
  ctx.lineWidth = 2;
  ctx.stroke();
  return asTexture(c);
};

export const makePalmBarkTexture = () => {
  const { c, ctx } = canvas(256, 512);
  const rng = new Rng(4831);
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, "#6b5038");
  grad.addColorStop(0.35, "#a1815d");
  grad.addColorStop(0.62, "#8b6c4b");
  grad.addColorStop(1, "#574129");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 26) {
    ctx.fillStyle = "rgba(43,30,18,.42)";
    ctx.fillRect(0, y + rng.range(-3, 3), 256, rng.range(3, 7));
    ctx.fillStyle = "rgba(220,194,151,.14)";
    ctx.fillRect(0, y + 8, 256, 2);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(36,25,14,${rng.range(0.08, 0.22)})`;
      ctx.fillRect(rng.range(0, 256), y + rng.range(0, 20), rng.range(6, 26), rng.range(1, 3));
    }
  }
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(255,230,180,${rng.range(0.02, 0.08)})`;
    ctx.fillRect(rng.range(0, 256), rng.range(0, 512), rng.range(2, 18), 1);
  }
  return asTexture(c, 1, 2);
};

export const makeGlowTexture = () => {
  const { c, ctx } = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, "rgba(255,250,225,1)");
  g.addColorStop(0.18, "rgba(255,226,150,.9)");
  g.addColorStop(0.5, "rgba(255,176,80,.28)");
  g.addColorStop(1, "rgba(255,150,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return asTexture(c);
};

export const makeLightPoolTexture = () => {
  const { c, ctx } = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 124);
  g.addColorStop(0, "rgba(255,205,120,.5)");
  g.addColorStop(0.45, "rgba(255,175,80,.18)");
  g.addColorStop(1, "rgba(255,150,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return asTexture(c);
};
