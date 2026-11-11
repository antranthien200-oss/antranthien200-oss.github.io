# Balls Shenanigan multiplayer server
Colyseus backend for one persistent shared city with a hard cap of 16 seats.

## Online systems in this beta
- Server-owned HP, meter, stun, invulnerability, awakening, death and respawn.
- Server validates melee/skill hit range, facing, per-move cadence, block direction and damage.
- Buildings, small destructible props, car occupancy/driving, train timing and train collisions are shared world state.
- Domain zones apply server-side periodic damage.
- 25-second seat hold for temporary connection drops.

Movement remains client-predicted with server-side bounds checks. Not every bespoke grab/counter, projectile trajectory or cinematic domain effect has been migrated into a fully authoritative simulation; this remains a multiplayer beta.

## Deploy
The root `render.yaml` configures one Render process in Singapore. After backend changes are pushed, verify Render has deployed the latest commit, then test `/health`.

Render Free may sleep after inactivity. A paid always-on instance is recommended for a public 16-player session.

## Local
Requires Node 22+.
```sh
cd multiplayer-server
npm install
npm test
npm start
```
Connect to `http://localhost:2567`.
