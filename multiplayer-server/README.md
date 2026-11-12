# Balls Shenanigan multiplayer server

Colyseus backend for one shared city with a hard cap of 16 players.

## Multiplayer systems

- **Network cadence:** 30 Hz room simulation and state patches; client input snapshots are sent at 30 Hz. Colyseus state patches only include changed schema fields.
- **Movement:** player positions are client-driven. The server no longer applies movement-distance/speed checks or server-side movement simulation; coordinates are still kept within the world bounds. This makes movement easier to modify, but clients can now teleport or move at arbitrary speeds.
- **Combat:** server-owned HP, meter, stun, invulnerability, awakening, death and respawn. Hit requests are no longer rejected for move-slot authorization, action timing, range/facing estimates or per-move hit cadence. Damage is still derived from the character's server-side move profile, and normal gameplay cooldowns, blocking, invulnerability and stun remain.
- **Projectiles:** server-simulated straight/guided projectiles include trash cans, Gojo Red/Blue Max/Hollow Purple, Nue, Choso's planted bomb, and Sukuna Flame Arrow. Projectile move-slot, spawn-distance, speed and per-skill cooldown rejection have been removed; the server still simulates projectile movement, map bounds, profile range, building/player collision, damage and fire-zone ticks. Choso's separate convergence beam/orb variants still need full server-side projectile support.
- **Domain clashes:** compatible clashes support two or more simultaneous participants. Clash hits are no longer filtered by client-reported range, facing or hit cadence; the server still tracks individual scores and resolves knockouts/disconnects to announce a winner or draw.
- **Gameplay limits:** character health, normal action cooldowns, stun, invulnerability, death/respawn, map bounds, car/world collision and the 16-player room capacity remain enabled. This multiplayer setup is intentionally permissive and is not suitable for competitive/public play where cheating must be prevented.
- **Cinematics:** combat actions and domain casts carry server timestamps so remote clients can align animation progress. Some bespoke camera, particle and multi-stage cinematic effects still need live synchronization testing.
- **Reconnect:** the room retains a dropped seat for up to 25 seconds and supports Colyseus reconnection. The browser retries the saved reconnection token automatically for a bounded period; live network-drop tests are still required.
- **Shared city:** buildings, props, car occupancy/driving, train timing and train collisions are shared room state.

## Deploy and verify

The root `render.yaml` configures one Render service in Singapore. After a successful deploy, check `/health` and test with two or more browser sessions. A successful health response confirms that the HTTP service is responding; it does not replace a live multiplayer test.

Render Free may sleep after inactivity, so an always-on instance is preferable for public sessions.

## Local development

Requires Node 22+.

```sh
cd multiplayer-server
npm install
npm test
npm start
```

Connect to `http://localhost:2567`.
