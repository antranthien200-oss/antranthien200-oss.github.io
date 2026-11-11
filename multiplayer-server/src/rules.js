export const MAX_PLAYERS = 16;
export const WORLD_WIDTH = 3300;
export const WORLD_HEIGHT = 2000;
export const CHARACTER_IDS = Object.freeze([
  "honored", "vessel", "restless", "ten", "perfection",
  "todo", "choso", "yuta", "trashman"
]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function sanitizePlayerName(value, fallback = "Player") {
  const cleaned = String(value ?? "").replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 16);
  return cleaned || fallback;
}

export function createSpawn(index = 0) {
  const angle = index * 2.399963229728653;
  const radius = 95 + Math.floor(index / 8) * 55;
  return {
    x: clamp(1250 + Math.cos(angle) * radius, 50, WORLD_WIDTH - 50),
    y: clamp(765 + Math.sin(angle) * radius, 50, WORLD_HEIGHT - 50)
  };
}

export function normalizePlayerUpdate(input, current, elapsedMs = 50) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const oldX = finite(current.x, 1250);
  const oldY = finite(current.y, 765);
  let x = clamp(finite(input.x, oldX), 45, WORLD_WIDTH - 45);
  let y = clamp(finite(input.y, oldY), 45, WORLD_HEIGHT - 45);
  const elapsed = clamp(finite(elapsedMs, 50), 16, 250);
  const maxTravel = clamp(55 + elapsed * 1.9, 90, 220);
  const dx = x - oldX, dy = y - oldY, distance = Math.hypot(dx, dy);
  if (distance > maxTravel) {
    const scale = maxTravel / distance;
    x = oldX + dx * scale;
    y = oldY + dy * scale;
  }
  const rawMotion = String(input.motionName ?? "");
  const motionName = /^[a-zA-Z0-9_]{1,48}$/.test(rawMotion) ? rawMotion : "";
  const rawAttack = String(input.attackType ?? "");
  return {
    x, y,
    face: clamp(finite(input.face, finite(current.face, 0)), -Math.PI, Math.PI),
    walk: clamp(finite(input.walk, 0), 0, 2),
    jump: clamp(finite(input.jump, 0), 0, 150),
    block: input.block === true,
    attackAnim: clamp(finite(input.attackAnim, 0), 0, 5),
    attackType: /^[a-zA-Z0-9_ -]{0,32}$/.test(rawAttack) ? rawAttack : "",
    motionName,
    motionProgress: clamp(finite(input.motionProgress, 0), 0, 1),
    awakened: input.awakened === true,
    dead: input.dead === true
  };
}
