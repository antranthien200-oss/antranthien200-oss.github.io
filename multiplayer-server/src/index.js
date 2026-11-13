import { defineServer, defineRoom, matchMaker } from "colyseus";
import { CityRoom } from "./rooms/CityRoom.js";

const port = Number(process.env.PORT || 2567);
matchMaker.controller.exposedMethods = ["join", "reconnect"];

const server = defineServer({
  rooms: { city: defineRoom(CityRoom) },
  express: (app) => {
    app.get("/", (_req, res) => res.status(200).send("Balls Shenanigan multiplayer server"));
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
