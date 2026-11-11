import { Room } from "colyseus";
import { schema, t } from "@colyseus/schema";
import { CHARACTER_IDS, MAX_PLAYERS, createSpawn, normalizePlayerUpdate, sanitizePlayerName } from "../rules.js";

const PlayerState = schema({
  name: t.string().default("Player"),
  character: t.string().default("vessel"),
  x: t.number().default(1250),
  y: t.number().default(765),
  face: t.number().default(0),
  walk: t.number().default(0),
  jump: t.number().default(0),
  block: t.boolean().default(false),
  attackAnim: t.number().default(0),
  attackType: t.string().default(""),
  motionName: t.string().default(""),
  motionProgress: t.number().default(0),
  awakened: t.boolean().default(false),
  dead: t.boolean().default(false)
});
const CityState = schema({ players: t.map(PlayerState) });

export class CityRoom extends Room {
  maxClients = MAX_PLAYERS;
  autoDispose = false;
  patchRate = 50;
  maxMessagesPerSecond = 24;

  onCreate() {
    this.setState(new CityState());
    this.lastUpdateAt = new Map();
    this.onMessage("player:update", (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const now = Date.now();
      const previous = this.lastUpdateAt.get(client.sessionId) || (now - 50);
      const normalized = normalizePlayerUpdate(payload, player, now - previous);
      if (!normalized) return;
      Object.assign(player, normalized);
      this.lastUpdateAt.set(client.sessionId, now);
    });
  }

  onJoin(client, options = {}) {
    const index = this.state.players.size;
    const spawn = createSpawn(index);
    const character = CHARACTER_IDS.includes(options.character) ? options.character : "vessel";
    const player = new PlayerState();
    player.name = sanitizePlayerName(options.name, "Player");
    player.character = character;
    player.x = spawn.x;
    player.y = spawn.y;
    player.face = 0;
    this.state.players.set(client.sessionId, player);
    this.lastUpdateAt.set(client.sessionId, Date.now());
    this.broadcast("server:player-count", { count: this.state.players.size, capacity: MAX_PLAYERS });
    console.log("[city] joined", player.name, this.state.players.size + "/" + MAX_PLAYERS);
  }

  onLeave(client) {
    const player = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.lastUpdateAt.delete(client.sessionId);
    this.broadcast("server:player-count", { count: this.state.players.size, capacity: MAX_PLAYERS });
    console.log("[city] left", player?.name || client.sessionId, this.state.players.size + "/" + MAX_PLAYERS);
  }
}
