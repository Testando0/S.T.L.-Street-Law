import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { logger } from "./lib/logger";

const startedAt = Date.now();
const MAX_PLAYERS = 80;
const MAX_CHAT = 140;
const VEHICLES = new Set(["pop", "moto", "sedan", "van", "suv", "sport", "taxi", "police"]);

interface Player {
  id: string;
  name: string;
  x: number;
  z: number;
  ry: number;
  vehicle: string | null;
  paint: string;
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  level: number;
  socket: WebSocket;
  chatTimes: number[];
  joinedAt: number;
}

const players = new Map<WebSocket, Player>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const number = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const color = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const cleanText = (value: unknown, max: number) =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max)
    : "";

const publicPlayer = (player: Player) => ({
  id: player.id,
  name: player.name,
  x: Math.round(player.x * 100) / 100,
  z: Math.round(player.z * 100) / 100,
  ry: Math.round(player.ry * 1000) / 1000,
  vehicle: player.vehicle,
  paint: player.paint,
  skin: player.skin,
  shirt: player.shirt,
  pants: player.pants,
  hair: player.hair,
  level: player.level,
});

function send(socket: WebSocket, payload: Record<string, unknown>) {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    socket.terminate();
  }
}

function broadcast(payload: Record<string, unknown>, except?: WebSocket) {
  const raw = JSON.stringify(payload);
  for (const socket of players.keys()) {
    if (socket === except || socket.readyState !== WebSocket.OPEN) continue;
    try {
      socket.send(raw);
    } catch {
      socket.terminate();
    }
  }
}

function announceCount() {
  broadcast({ type: "count", online: players.size });
}

function announceSystem(text: string) {
  broadcast({ type: "system", text });
}

function join(socket: WebSocket, message: Record<string, unknown>) {
  const name = cleanText(message.name, 18).slice(0, 18) || "Carioca";
  const vehicle =
    typeof message.activeVehicle === "string"
      ? message.activeVehicle
      : typeof message.vehicle === "string"
        ? message.vehicle
        : null;
  const player: Player = {
    id: randomUUID(),
    name,
    x: clamp(number(message.x), -280, 280),
    z: clamp(number(message.z), -280, 280),
    ry: number(message.ry),
    vehicle: vehicle && VEHICLES.has(vehicle) ? vehicle : null,
    paint: color(message.paint, "#f6c945"),
    skin: color(message.skin, "#c98b5e"),
    shirt: color(message.shirt, "#ff6b35"),
    pants: color(message.pants, "#1f3c5b"),
    hair: color(message.hair, "#24160d"),
    level: Math.round(clamp(number(message.level, 1), 1, 999)),
    socket,
    chatTimes: [],
    joinedAt: Date.now(),
  };
  const existing = [...players.values()].map(publicPlayer);
  players.set(socket, player);
  send(socket, { type: "welcome", id: player.id, players: existing, online: players.size });
  broadcast({ type: "update", player: publicPlayer(player) }, socket);
  announceSystem(`${player.name} entrou na cidade.`);
  announceCount();
  logger.info({ playerId: player.id, online: players.size }, "player joined");
}

function updateState(player: Player, message: Record<string, unknown>) {
  player.x = clamp(number(message.x, player.x), -280, 280);
  player.z = clamp(number(message.z, player.z), -280, 280);
  player.ry = number(message.ry, player.ry);
  const vehicle = typeof message.vehicle === "string" ? message.vehicle : null;
  player.vehicle = vehicle && VEHICLES.has(vehicle) ? vehicle : null;
  broadcast({ type: "update", player: publicPlayer(player) }, player.socket);
}

function updateIdentity(player: Player, message: Record<string, unknown>) {
  const oldName = player.name;
  const name = cleanText(message.name, 18).slice(0, 18);
  if (name) player.name = name;
  player.paint = color(message.paint, player.paint);
  player.skin = color(message.skin, player.skin);
  player.shirt = color(message.shirt, player.shirt);
  player.pants = color(message.pants, player.pants);
  player.hair = color(message.hair, player.hair);
  const vehicle = typeof message.activeVehicle === "string" ? message.activeVehicle : null;
  if (vehicle && VEHICLES.has(vehicle)) player.vehicle = vehicle;
  broadcast({ type: "update", player: publicPlayer(player) });
  if (player.name !== oldName) announceSystem(`${oldName} agora é ${player.name}.`);
}

function chat(player: Player, message: Record<string, unknown>) {
  const text = cleanText(message.text, MAX_CHAT);
  if (!text) return;
  const now = Date.now();
  player.chatTimes = player.chatTimes.filter((time) => now - time < 5000);
  if (player.chatTimes.length >= 5) {
    send(player.socket, { type: "system", text: "Calma no chat. Tente novamente em alguns segundos." });
    return;
  }
  player.chatTimes.push(now);
  broadcast({ type: "chat", id: player.id, name: player.name, text });
}

function leave(socket: WebSocket) {
  const player = players.get(socket);
  if (!player) return;
  players.delete(socket);
  broadcast({ type: "leave", id: player.id });
  announceSystem(`${player.name} saiu da cidade.`);
  announceCount();
  logger.info({ playerId: player.id, online: players.size }, "player left");
}

function handleMessage(socket: WebSocket, raw: RawData) {
  const data = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (data.length > 16000) {
    socket.close(1009, "message too large");
    return;
  }
  let message: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(data.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    message = parsed as Record<string, unknown>;
  } catch {
    return;
  }
  const type = message.type;
  if (type === "join") {
    if (!players.has(socket)) join(socket, message);
    return;
  }
  const player = players.get(socket);
  if (!player) return;
  if (type === "state") updateState(player, message);
  else if (type === "identity") updateIdentity(player, message);
  else if (type === "chat") chat(player, message);
  else if (type === "ping") send(socket, { type: "pong", t: message.t });
}

export function attachMultiplayer(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16000, perMessageDeflate: false });

  server.on("upgrade", (request, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    if (players.size >= MAX_PLAYERS) {
      socket.end("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });

  const alive = new WeakSet<WebSocket>();
  wss.on("connection", (socket) => {
    alive.add(socket);
    socket.on("pong", () => alive.add(socket));
    socket.on("message", (raw) => handleMessage(socket, raw));
    socket.on("close", () => leave(socket));
    socket.on("error", () => leave(socket));
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }, 30000);
  heartbeat.unref();

  return wss;
}

export function getMultiplayerStats() {
  return { online: players.size, uptime: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) };
}

export function getLeaderboard() {
  return [...players.values()]
    .sort((a, b) => b.level - a.level || a.joinedAt - b.joinedAt || a.name.localeCompare(b.name))
    .slice(0, 20)
    .map((player, index) => ({ position: index + 1, name: player.name, level: player.level }));
}
