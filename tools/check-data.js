#!/usr/bin/env node
/* Data integrity checks: run before every commit (and in CI).  node tools/check-data.js */
"use strict";
const path = require("path");
globalThis.PI = {};
require(path.join(__dirname, "../src/data.js"));
require(path.join(__dirname, "../src/engine.js"));
const { data: D, engine: E } = globalThis.PI;

const problems = [];
const dupes = list => list.filter((x, i) => list.indexOf(x) !== i);
const check = (ok, msg) => { if (!ok) problems.push(msg); };

// Unique ids within each table (ids are save-file keys)
for (const [name, list] of Object.entries({
  BUILDINGS: D.BUILDINGS, UPGRADES: D.UPGRADES, RESEARCH: D.RESEARCH, TREE: D.TREE, ACHIEVEMENTS: D.ACHIEVEMENTS,
  HELPERS: D.HELPERS, SHORES: D.SHORES, SEASONS: D.SEASONS, LETTER_TYPES: D.LETTER_TYPES,
})) {
  const d = dupes(list.map(x => x.id));
  check(!d.length, `${name} has duplicate ids: ${d.join(", ")}`);
}
Object.entries(D.COSMETICS).forEach(([slot, list]) => check(!dupes(list.map(c => c.id)).length, `COSMETICS.${slot} has duplicate ids`));

// Every upgrade, research project, heirloom and helper has its own icon, and none reuses a colony member's
const shopIcons = [...D.UPGRADES, ...D.RESEARCH, ...D.TREE, ...D.HELPERS].map(x => x.icon);
check(!dupes(shopIcons).length, `icons reused across upgrades/workshop/tree/helpers: ${[...new Set(dupes(shopIcons))].join(" ")}`);
const buildingIcons = D.BUILDINGS.map(b => b.icon);
check(!shopIcons.some(i => buildingIcons.includes(i)), "an upgrade/research/heirloom/helper reuses a colony member's icon");
const memIcons = D.ACHIEVEMENTS.filter(a => !a.badge).map(a => a.icon);
check(!dupes(memIcons).length, `memories reuse icons: ${[...new Set(dupes(memIcons))].join(" ")}`);
check(!dupes(D.SHORES.map(s => s.icon)).length, "shores reuse icons");

// Structure
D.BUILDINGS.forEach(b => check((D.BUILDING_UPGRADES[b.id] || []).length === D.TIER_REQS.length, `${b.id} needs ${D.TIER_REQS.length} tier upgrades`));
D.TREE.forEach(n => {
  [...(n.requires || []), ...(n.requiresAny || [])].forEach(r => check(D.H_BY_ID[r], `tree node ${n.id} requires unknown ${r}`));
  check(n.max >= 1 && n.cost >= 0 && n.growth >= 1, `tree node ${n.id} has bad max/cost/growth`);
  check(n.x >= 0 && n.x < 7 && n.y >= 0 && n.y < 6, `tree node ${n.id} is off the grid`);
});
check(!dupes(D.TREE.map(n => `${n.x},${n.y}`)).length, "two tree nodes share a grid position");
D.UPGRADES.forEach(u => check(u.cost > 0 && u.name && u.desc, `upgrade ${u.id} is missing cost/name/desc`));
D.RESEARCH.forEach(r => check(r.max >= 1 && r.cost > 0 && r.growth > 1 && typeof r.text(1) === "string", `research ${r.id} is malformed`));
const stats = E.freshState().stats;
D.LETTER_TYPES.forEach(t => check(t.stat === "lifetimeFish" || t.stat in stats, `letter type ${t.id} tracks unknown stat ${t.stat}`));
D.SEASONS.forEach(s => {
  check(s.from[0] >= 1 && s.from[0] <= 12 && s.to[0] >= 1 && s.to[0] <= 12, `season ${s.id} has a bad date range`);
  const [slot, id] = s.cosmetic;
  check(D.COSMETICS[slot] && D.COSMETICS[slot].some(c => c.id === id), `season ${s.id} rewards unknown cosmetic ${slot}/${id}`);
});
check(D.SHORES[0].id === "home" && D.SHORES[0].unlockAt === 0, "the first shore must be an always-open Home Ice");

// Every tree node and research text renders for each level without throwing
D.TREE.forEach(n => { for (let L = 1; L <= n.max; L++) check(typeof n.text(L) === "string", `tree node ${n.id} text fails at level ${L}`); });

if (problems.length) {
  console.error(`Data check FAILED (${problems.length}):\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`Data check passed: ${D.BUILDINGS.length} colony members, ${D.UPGRADES.length} upgrades, ${D.RESEARCH.length} research, ` +
  `${D.TREE.length} heirlooms, ${D.HELPERS.length} helpers, ${D.SHORES.length} shores, ${D.ACHIEVEMENTS.length} memories, all icons unique.`);
