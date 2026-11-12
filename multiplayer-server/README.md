# Balls Shenanigan multiplayer server

Colyseus backend for one shared city with a hard cap of 16 players.

## Multiplayer systems

- **Network cadence:** 30 Hz room simulation and state patches; client input snapshots are sent at 30 Hz. Colyseus state patches only include changed schema fields.
- **Movement:** the server integrates normal movement input, velocity, drag and building collision. Dash/skill displacement is accepted only in short server-authorized windows with bounded per-packet movement. This is a constrained hybrid for character-specific movement, not a complete deterministic server simulation of every bespoke move.
- **Combat:** server-owned HP, meter, stun, invulnerability, awakening, death and respawn. Melee hit requests are checked against character/move allowlists, facing, range, recent server-authorized actions, block direction and per-move cadence.
- **Projectiles:** common straight and supported guided projectiles (trash cans, Gojo Red/Blue Max/Hollow Purple, Nue and Choso's bomb) are spawned, advanced, checked against buildings/players, and damaged by the server. Positions are batched to clients every 100 ms. Character-specific Sukuna Flame Arrow/fire-zone behavior, the domain-bound golden bin, and the Nue ride variant remain special-case visuals/mechanics and are not fully authoritative yet.
- **Domain clashes:** compatible pairwise clashes are created and arbitrated by the server, with server-checked strike range/cadence, shared score updates and a single winner/draw result. This is pairwise arbitration; a true three-or-more-domain clash is not implemented.
- **Cinematics:** combat actions and domain casts carry server timestamps so remote clients can align animation progress. Some bespoke camera, particle and multi-stage cinematic effects still need live synchronization testing.
- **Reconnect:** the room retains a dropped seat for up to 25 seconds and supports Colyseus reconnection. The browser SDK performs retry/reconnect handling; live network-drop tests are still required.
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
