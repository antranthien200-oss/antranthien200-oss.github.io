import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("Colyseus CityRoom module loads", async () => {
  const room = await import("../src/rooms/CityRoom.js");
  assert.equal(typeof room.CityRoom, "function");
});

test("all main-game and Vessel-preview inline scripts parse before deployment", () => {
  const gameFiles = [
    "../../jjs-2d/index.html",
    "../../jjs-2d/vessel-m1-preview.html"
  ];
  for (const file of gameFiles) {
    const html = readFileSync(new URL(file, import.meta.url), "utf8");
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .map(match => match[1])
      .filter(source => source.trim().length > 0);
    assert.ok(scripts.length >= 1, file + " should contain an inline script");
    for (const [index, source] of scripts.entries()) {
      assert.doesNotThrow(
        () => new vm.Script(source, { filename: file + ":inline-" + index + ".js" }),
        file + " inline script " + index + " should parse"
      );
    }
  }
});

test("Gojo Blue MAX uses a 1-second explosion phase after its active phase", async () => {
  const { CityRoom } = await import("../src/rooms/CityRoom.js");
  const room = new CityRoom();
  const owner = {
    character: "honored", awakened: true, dead: false, stun: 0,
    vehicleId: "", x: 500, y: 350, aimX: 700, aimY: 350
  };
  room.state = { players: new Map([["gojo", owner]]) };
  room.projectiles = new Map();
  room.broadcast = () => {};
  room.spawnProjectile(
    { sessionId: "gojo", send: () => {} },
    {
      id: "blue-max-test", move: "gojoBlueMax", kind: "blueMax",
      x: 500, y: 350, vx: 0, vy: 0, life: 6.25,
      damage: 2.2, pullRadius: 420, pullForce: 0.06, damageRadius: 165
    }
  );

  const projectile = room.projectiles.get("gojo:blue-max-test");
  assert.ok(projectile, "server should accept the awakened Gojo Blue MAX projectile");
  assert.equal(projectile.phaseRemaining, 0.5);
  assert.equal(projectile.phaseDuration, 0.5);
  assert.equal(projectile.activeDuration, 3);
  assert.equal(projectile.collapseDuration, 1);
  assert.equal(
    projectile.phaseRemaining + projectile.activeDuration + projectile.collapseDuration,
    4.5,
    "formation + active + explosion should total 4.5 seconds"
  );
  assert.equal(projectile.pullRadius, 420);
  assert.equal(projectile.damageRadius, 165);
});

test("Blue MAX animation skips orb regeneration and uses smooth suction in both clients", () => {
  for (const file of ["../../jjs-2d/index.html", "../../jjs-2d/vessel-m1-preview.html"]) {
    const html = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(html, /frameIndex=21\+Math\.min\(12,Math\.floor\(progress\*13\)\)/);
    assert.match(html, /const targetCenterY=p\.y\+23/);
    assert.match(html, /const pullSpeed=100\+\(\(pullRadius-gap\)\/pullRadius\)\*140,step=Math\.min\(gap,pullSpeed\*dt\)/);
    assert.doesNotMatch(html, /captureRadius=46/);
   assert.match(html, /function detonateBlueMax\(p\)/);
   assert.match(html, /phaseRemaining:\.5,phaseDuration:\.5,activeDuration:3,collapseDuration:1/);
   assert.match(html, /collapseDuration:1[,}]/);
   assert.match(html, /target\.vx=nx\*push;target\.vy=ny\*push/);
    assert.doesNotMatch(html, /frameIndex=21\+Math\.min\(13,Math\.floor\(progress\*14\)\)/);
    assert.doesNotMatch(html, /target\.vx=clamp\(\(Number\(target\.vx\)\|\|0\)\+dx\*inv\*pull,-32,32\)/);
  }
});

test("Blue MAX explosion releases its captured victim and launches them away from the orb", async () => {
  const { CityRoom } = await import("../src/rooms/CityRoom.js");
  const room = new CityRoom();
  const owner = {
    character: "honored", awakened: true, dead: false, stun: 0,
    vehicleId: "", x: 500, y: 350, aimX: 500, aimY: 350, face: 0,
    hp: 100, meter: 0, jackpot: false
  };
  const victim = {
    character: "vessel", dead: false, vehicleId: "", x: 560, y: 350,
    vx: 0, vy: 0, hp: 100, maxHp: 100, stun: 0, invuln: 0,
    block: false, awakened: false, meter: 0, jackpot: false,
    blueMaxSuckedBy: "gojo"
  };
  room.state = { players: new Map([["gojo", owner], ["victim", victim]]) };
  room.projectiles = new Map();
  room.projectileSequence = 0;
  room.broadcast = () => {};
  room.spawnProjectile(
    { sessionId: "gojo", send: () => {} },
    {
      id: "blue-max-blast-test", move: "gojoBlueMax", kind: "blueMax",
      x: 500, y: 350, vx: 0, vy: 0, life: 6,
      damage: 2.2, pullRadius: 420, pullForce: 0.06, damageRadius: 165
    }
  );

  const projectile = room.projectiles.get("gojo:blue-max-blast-test");
  assert.ok(projectile);
  projectile.phase = "active";
  projectile.phaseRemaining = 0.01;
  projectile.phaseDuration = 3;
  const originalX = victim.x;

  room.tickProjectiles(0.02, Date.now() + 500);

  assert.equal(projectile.phase, "collapse");
  assert.equal(projectile.phaseRemaining, 1);
  assert.equal(victim.blueMaxSuckedBy, "");
  assert.ok(victim.hp < 100, "the explosion should damage the victim");
  assert.ok(victim.vx > 0, "the explosion should apply outward velocity");
  assert.ok(victim.x > originalX, "the explosion should physically displace the victim");
});

test("multiplayer Blue MAX uses a server-owned soft capture and releases it for the explosion", () => {
  const source = readFileSync(new URL("../src/rooms/CityRoom.js", import.meta.url), "utf8");
  assert.ok(source.includes('blueMaxSuckedBy:t.string().default("")'));
  assert.match(source, /targetCenterY=orb\.y\+23/);
  assert.match(source, /pullSpeed=100\+clamp\(\(pullRadius-gap\)\/pullRadius,0,1\)\*140/);
  assert.match(source, /candidate\.blueMaxSuckedBy=p\.ownerId/);
  assert.match(source, /candidate\.blueMaxSuckedBy="";candidate\.vx=0;candidate\.vy=0/);
  assert.doesNotMatch(source, /candidate\.vx\+=dx\*inv\*pull/);
});

test("a new domain clashes with an older already-open domain anywhere in the arena", async () => {
  const { CityRoom } = await import("../src/rooms/CityRoom.js");
  const room = new CityRoom();
  const now = Date.now();
  const owner = {
    x: 2500, y: 1800, dead: false, domainType: "shrine",
    domainTimer: 9, domainWindup: 0, domainCastAt: now - 12000,
    domainRadius: 100, domainClashId: ""
  };
  const challenger = {
    x: 100, y: 100, dead: false, domainType: "void",
    domainTimer: 0, domainWindup: 1.1, domainCastAt: now,
    domainRadius: 100, domainClashId: ""
  };
  room.state = { players: new Map([["owner", owner], ["challenger", challenger]]) };
  room.domainClashes = new Map();
  const messages = [];
  room.broadcast = (type, payload) => messages.push({ type, payload });

  assert.equal(room.tryStartDomainClash("challenger", challenger, now), true);
  assert.equal(room.domainClashes.size, 1);
  assert.equal(owner.domainClashId, challenger.domainClashId);
  assert.equal(owner.domainTimer, 0);
  assert.equal(challenger.domainWindup, 0);
  assert.ok(messages.some(message =>
    message.type === "domain:clash:start" &&
    message.payload.participants.includes("owner") &&
    message.payload.participants.includes("challenger")
  ));
});

test("a domain clash never accepts a third participant", async () => {
  const { CityRoom } = await import("../src/rooms/CityRoom.js");
  const room = new CityRoom();
  const now = Date.now();
  const makePlayer = (domainType, domainClashId = "") => ({
    x: 200, y: 200, dead: false, domainType,
    domainTimer: 0, domainWindup: 1, domainCastAt: now,
    domainRadius: 500, domainClashId
  });
  const first = makePlayer("shrine", "existing-clash");
  const second = makePlayer("void", "existing-clash");
  const challenger = makePlayer("hakari");
  room.state = { players: new Map([
    ["first", first], ["second", second], ["challenger", challenger]
  ]) };
  room.domainClashes = new Map([["existing-clash", {
    id: "existing-clash",
    participants: ["first", "second"],
    scores: new Map([["first", 0], ["second", 0]]),
    time: 15, maxTime: 15, lastHitAt: new Map(), lastBroadcast: now
  }]]);
  const messages = [];
  room.broadcast = (type, payload) => messages.push({ type, payload });

  assert.equal(room.tryStartDomainClash("challenger", challenger, now), false);
  assert.deepEqual(room.domainClashes.get("existing-clash").participants, ["first", "second"]);
  assert.equal(challenger.domainClashId, "");
  assert.equal(messages.some(message => message.type === "domain:clash:start"), false);
});

test("domains that are neither open nor being cast recently do not start a clash", async () => {
  const { CityRoom } = await import("../src/rooms/CityRoom.js");
  const room = new CityRoom();
  const now = Date.now();
  const owner = {
    x: 200, y: 200, dead: false, domainType: "shrine",
    domainTimer: 0, domainWindup: 0, domainCastAt: now - 15000,
    domainRadius: 500, domainClashId: ""
  };
  const challenger = {
    x: 210, y: 210, dead: false, domainType: "void",
    domainTimer: 0, domainWindup: 1, domainCastAt: now,
    domainRadius: 500, domainClashId: ""
  };
  room.state = { players: new Map([["owner", owner], ["challenger", challenger]]) };
  room.domainClashes = new Map();
  room.broadcast = () => {};

  assert.equal(room.tryStartDomainClash("challenger", challenger, now), false);
  assert.equal(room.domainClashes.size, 0);
});
