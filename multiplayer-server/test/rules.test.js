import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PLAYERS, CHARACTER_IDS, createSpawn, findAvailableSpawn, normalizePlayerUpdate, sanitizePlayerName } from "../src/rules.js";

test("shared city capacity is fixed at 16", () => assert.equal(MAX_PLAYERS, 16));
test("known character ids are accepted", () => {
  assert.ok(CHARACTER_IDS.includes("vessel"));
  assert.ok(!CHARACTER_IDS.includes("bad-char"));
});
test("all 16 spawn locations stay inside the map", () => {
  for (let i = 0; i < 16; i++) {
    const p = createSpawn(i);
    assert.ok(p.x >= 45 && p.x <= 3255);
    assert.ok(p.y >= 45 && p.y <= 1955);
  }
});
test("spawn points are separated enough for fighter bodies", () => {
  const points = Array.from({ length: MAX_PLAYERS }, (_, index) => createSpawn(index));
  let minimum = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      minimum = Math.min(minimum, Math.hypot(
        points[i].x - points[j].x,
        points[i].y - points[j].y
      ));
    }
  }
  assert.ok(minimum >= 72);
});

test("rejoining chooses an unoccupied spawn slot", () => {
  const occupied = Array.from({ length: 15 }, (_, index) => createSpawn(index + 1));
  const spawn = findAvailableSpawn(occupied);
  assert.ok(!occupied.some(player => Math.hypot(player.x - spawn.x, player.y - spawn.y) < 72));
});

test("client movement is bounded per update packet", () => {
  const next = normalizePlayerUpdate({ x: 3000, y: 1800 }, { x: 1000, y: 800, face: 0 }, 50);
  assert.ok(Math.hypot(next.x - 1000, next.y - 800) <= 150.001);
});
test("client state is clamped and sanitized", () => {
  const next = normalizePlayerUpdate({
    x: -1000, y: 99999, face: 100, walk: 9, jump: 999, attackAnim: 20,
    block: "yes", awakened: 1, dead: false, motionName: "<script>"
  }, { x: 1000, y: 800, face: 0 }, 250);
  assert.ok(next.x >= 45 && next.x <= 3255);
  assert.ok(next.y >= 45 && next.y <= 1955);
  assert.ok(next.face <= Math.PI && next.face >= -Math.PI);
  assert.equal(next.walk, 2);
  assert.equal(next.jump, 150);
  assert.equal(next.attackAnim, 5);
  assert.equal(next.block, false);
  assert.equal(next.awakened, false);
  assert.equal(next.motionName, "");
});
test("player names are safe and length-limited", () => {
  assert.equal(sanitizePlayerName("  A <Player>  "), "A Player");
  assert.equal(sanitizePlayerName("   "), "Player");
});
