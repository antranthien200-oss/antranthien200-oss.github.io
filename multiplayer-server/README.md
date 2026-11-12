# Balls Shenanigan multiplayer server

Colyseus backend for one shared city with a hard cap of 16 players.

## Multiplayer systems

- **Network cadence:** 30 Hz room simulation and state patches; client input snapshots are sent at 30 Hz. Colyseus state patches only include changed schema fields.
- **Movement:** the server integrates normal movement input, velocity, drag and building collision. Dash/skill displacement is accepted only in short server-authorized windows with bounded per-packet movement. This is a constrained hybrid for character-specific movement, not a complete deterministic server simulation of every bespoke move.
- **Combat:** server-owned HP, meter, stun, invulnerability, awakening, death and respawn. Melee hit requests are checked against character/move allowlists, facing, range, recent server-authorized actions, block direction and per-move cadence.
- **Projectiles:** server-simulated straight/guided projectiles include trash cans, Gojo Red/Blue Max/Hollow Purple, Nue, Choso's planted bomb, and Sukuna Flame Arrow. The server owns projectile movement, building/player collision, damage and fire-zone ticks; clients receive snapshots every 100 ms. Choso's separate convergence beam/orb variants still need full server-side projectile support.
- **Domain clashes:** compatible clashes support two or more simultaneous participants. The server validates each strike's target, range, facing and cadence, tracks individual scores, resolves knockouts/disconnects, and announces a single winner or draw.
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
