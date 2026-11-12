import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("Colyseus CityRoom module loads", async () => {
  const room = await import("../src/rooms/CityRoom.js");
  assert.equal(typeof room.CityRoom, "function");
});

test("all inline game scripts parse before deployment", () => {
  const html = readFileSync(new URL("../../jjs-2d/index.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim().length > 0);
  assert.ok(scripts.length >= 1, "expected the game client to contain an inline script");
  for (const [index, source] of scripts.entries()) {
    assert.doesNotThrow(
      () => new vm.Script(source, { filename: `jjs-2d:inline-${index}.js` }),
      `inline script ${index} should parse`
    );
  }
});
