# Balls Shenanigan Multiplayer Server

This is the Colyseus server for one shared city room.

## Implemented online slice

- One persistent room named `city`; maximum 16 clients.
- Public clients can only join/reconnect. They cannot create rooms or use `joinOrCreate`.
- Player positions, selected characters, facing, block state, basic attack state, awakening flag and animation state are synchronized.
- Remote players receive distinct generated nameplates when no custom name is supplied.
- Spawn allocation checks occupied positions to reduce overlaps when players leave and rejoin.
- The server clamps coordinates and limits movement per update packet.

Combat damage, skill hit validation, cars, train state, destructible buildings and other world-object state are not authoritative/synchronized yet. Movement is currently client-driven with server-side bounds checks, not full server-authoritative combat. This is the online networking beta, not the finished combat multiplayer release.

## Deploy on Render

1. Open Render and choose **New → Blueprint**.
2. Select this GitHub repository and apply its root `render.yaml`.
3. Wait until `balls-shenanigan-online` is live in the Singapore region.
4. Copy the service's HTTPS URL.
5. Open the game → **ONLINE** → paste the URL into **SERVER ADDRESS** → **CONNECT TO THE ONE SERVER**.

The Blueprint uses the **Free** plan to avoid opting into paid hosting without your approval. Render Free services spin down after 15 minutes without inbound HTTP/WebSocket activity and may take about a minute to wake. For an always-on public game server, change the service to a paid plan in Render.

## Local test

Requires Node.js 22 or newer.

```sh
cd multiplayer-server
npm install
npm test
npm start
```

Then use `http://localhost:2567` in the Online menu.
