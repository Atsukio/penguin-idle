#!/usr/bin/env node
/* Engine tests: game rules that need no browser (saves, migrations, time away, feathers).
 * Runs in about a second with Node's built-in test runner:
 *
 *   node tools/engine-tests.js
 *
 * Anything that clicks, draws or animates belongs in tests/game.spec.js (Playwright) instead.
 */
"use strict";
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { engine: E } = require(path.join(__dirname, "load-engine.js"));

const encodeOld = obj => Buffer.from(JSON.stringify(obj)).toString("base64");   // pre-checksum save format
const DAY = 86400e3;

// Every test starts from a brand-new colony
function fresh() {
  E.replaceState(E.freshState());
  E.recompute();
  return E.state;
}

test("saves round-trip, and tampered or newer saves are rejected", () => {
  const s = fresh();
  s.fish = 12345;
  const enc = E.encodeSave();
  assert.match(enc, /\.[0-9a-z]+$/, "save text ends with a checksum");
  assert.equal(E.decodeSave(enc).fish, 12345);
  assert.throws(() => E.decodeSave(enc.slice(0, -10) + "AAAA" + enc.slice(-6)), { kind: "corrupt" });
  assert.throws(() => E.decodeSave(encodeOld({ version: 999 })), { kind: "newer" });
});

test("a v1 save (before versioning features) migrates to the current version", () => {
  fresh();
  const st = E.decodeSave(encodeOld({
    version: 1, fish: 5000, runFish: 5000, lifetimeFish: 5000, buildings: { chick: 3, fisher: 12 },
    upgrades: ["chick_0", "bogus_id"], achievements: ["fish_1"], feathersEarned: 0, heritage: [],
    stats: { clicks: 5 }, settings: { particles: true, scientific: false }, lastTick: Date.now(),
  }));
  assert.deepEqual(
    { fisher: st.buildings.fisher, upgrades: st.upgrades, volume: st.settings.volume, shore: st.shore, helpers: st.helpers, hat: st.cosmetics.hat },
    { fisher: 12, upgrades: ["chick_0"], volume: 0.5, shore: "home", helpers: {}, hat: "coral" },
  );
});

test("a v2 save's heirloom list becomes tree levels", () => {
  fresh();
  const st = E.decodeSave(encodeOld({
    version: 2, fish: 0, lifetimeFish: 1e15, buildings: {}, upgrades: [], achievements: [],
    feathersEarned: 300, feathersSpent: 254, heritage: ["headstart", "flippers", "emperor"], lastTick: Date.now(),
  }));
  E.replaceState(st);
  E.recompute();
  assert.deepEqual(E.state.heritage, { headstart: 1, flippers: 1, emperor: 1 });
  assert.ok(E.state.feathersSpent > 0, "spent feathers are recomputed from what's owned, not trusted from the file");
});

test("time away: 50% pace for an absence under a week, 25% after that", () => {
  // Pace = fish earned / (fish per second × a full day); the 24-hour cap is the same for both lengths
  const pace = days => {
    const s = fresh();
    s.buildings.chick = 10; E.recompute(); s.fish = 0;
    const fps = E.fishPerSecond(false);
    s.lastTick = Date.now() - days * DAY;
    E.applyOffline();
    return E.state.fish / (fps * 86400);
  };
  assert.ok(Math.abs(pace(3) - 0.5) < 0.005, `3 days away: ${pace(3)}`);
  assert.ok(Math.abs(pace(8) - 0.25) < 0.005, `8 days away: ${pace(8)}`);
});

test("Long Journey: come back after a week or more away", () => {
  const s = fresh();
  const away = days => { s.lastTick = Date.now() - days * DAY; E.applyOffline(); E.checkAchievements(); };
  away(3);
  assert.equal(s.achievements.includes("long_away"), false);
  away(8);
  assert.equal(s.achievements.includes("long_away"), true);
});

test("Homecoming counts a day or more away, but only within the first week", () => {
  const s = fresh();
  const away = days => { s.lastTick = Date.now() - days * DAY; E.applyOffline(); E.checkAchievements(); };
  away(8);
  assert.equal(s.achievements.includes("homecoming"), false);
  away(2);
  assert.equal(s.achievements.includes("homecoming"), true);
  assert.equal(s.stats.homecomings, 1);
});

test("next feather target sits past the feathers already earned", () => {
  // An earlier run earned 5 feathers at a higher rate; this run's lifetime alone is only worth 2
  const s = fresh();
  s.lifetimeFish = 8e12; s.feathersEarned = 5; E.recompute();
  assert.equal(E.pendingFeathers(), 0);
  assert.ok(Math.abs(E.nextFeatherAt() - 216e12) < 1e10, "6 feathers = 6³ × 1e12");
});
