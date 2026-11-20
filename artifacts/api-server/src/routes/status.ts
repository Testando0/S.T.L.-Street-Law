import { Router, type IRouter } from "express";
import { getLeaderboard, getMultiplayerStats } from "../multiplayer";

const router: IRouter = Router();

router.get("/status", (_req, res) => {
  const stats = getMultiplayerStats();
  res.setHeader("Cache-Control", "no-store");
  res.json({
    status: "ok",
    online: stats.online,
    uptime: stats.uptime,
    version: "1.0.2",
  });
});

router.get("/leaderboard", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    online: getMultiplayerStats().online,
    players: getLeaderboard(),
    updatedAt: new Date().toISOString(),
  });
});

export default router;
