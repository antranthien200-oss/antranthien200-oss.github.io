import { defineServer, defineRoom, matchMaker } from "colyseus";
import { CityRoom } from "./rooms/CityRoom.js";

const port = Number(process.env.PORT || 2567);
matchMaker.controller.exposedMethods = ["join", "reconnect"];

const server = defineServer({
  rooms: { city: defineRoom(CityRoom) },
  express: (app) => {
    app.get("/", (_req, res) => res.status(200).send("Balls Shenanigan multiplayer server"));
    app.get("/status", (_req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      const players = Math.max(0, Number(matchMaker.stats.local.ccu) || 0);
      res.status(200).json({ ok: true, players, capacity: 16 });
    });
    app.get("/health", (_req, res) => res.status(200).json({
      ok: true,
      room: "city",
      maxPlayers: 16,
      tickHz: 30,
      statePatchHz: 30,
      projectileSnapshotHz: 30,
      buildCommit: process.env.RENDER_GIT_COMMIT || "local"
    }));
  }
});

await server.listen(port);
await matchMaker.createRoom("city", {});
console.log("[balls-shenanigan] single city server listening on port", port);
