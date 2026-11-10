#!/usr/bin/env node
/* Data integrity checks: run before every commit (and in CI).  node tools/check-data.js */
"use strict";
const path = require("path");
const { data: D, engine: E } = require(path.join(__dirname, "load-engine.js"));

const problems = [];
const dupes = list => list.filter((x, i) => list.indexOf(x) !== i);
const check = (ok, msg) => { if (!ok) problems.push(msg); };

// Unique ids within each table (ids are save-file keys)
for (const [name, list] of Object.entries({
  BUILDINGS: D.BUILDINGS, UPGRADES: D.UPGRADES, RESEARCH: D.RESEARCH, TREE: D.TREE, ACHIEVEMENTS: D.ACHIEVEMENTS,
  HELPERS: D.HELPERS, SHORES: D.SHORES, PASSPORT_STAMPS: D.PASSPORT_STAMPS, COOKING_RECIPES: D.COOKING_RECIPES, DIVE_SPOTS: D.DIVE_SPOTS, RELICS: D.RELICS, SEASONS: D.SEASONS, LETTER_TYPES: D.LETTER_TYPES,
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
  check(n.x >= 0 && n.x < 7 && n.y >= 0 && n.y < 7, `tree node ${n.id} is off the grid`);
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

// Releases: What's new, the service worker cache and package.json all name the same version
const fs = require("fs");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const versions = D.CHANGELOG.map(c => c.version);
check(D.CHANGELOG.length > 0 && D.GAME_VERSION === versions[0], "GAME_VERSION must be the newest CHANGELOG entry");
check(!dupes(versions).length, `CHANGELOG has duplicate versions: ${dupes(versions).join(", ")}`);
D.CHANGELOG.forEach(c => check(/^\d+\.\d+(\.\d+)?$/.test(c.version) && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.title && c.notes.length > 0 && c.notes.every(n => typeof n === "string" && n.length > 0),
  `CHANGELOG entry ${c.version} needs a version, a YYYY-MM-DD date, a title and notes`));
const vnum = v => v.split(".").map(Number).reduce((a, x, i) => a + x * Math.pow(1000, 2 - i), 0);
check(versions.every((v, i) => i === 0 || vnum(versions[i - 1]) > vnum(v)), "CHANGELOG must be newest first");
const sw = read("sw.js");
const cache = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
check(cache === `penguin-idle-v${D.GAME_VERSION}`, `sw.js CACHE is "${cache}" but must be "penguin-idle-v${D.GAME_VERSION}" (add a What's new entry and bump CACHE together)`);
const pkg = JSON.parse(read("package.json")).version;
check(pkg.replace(/\.0$/, "") === D.GAME_VERSION, `package.json version ${pkg} doesn't match What's new ${D.GAME_VERSION}`);
// Every script the page loads is cached for offline play
[...read("index.html").matchAll(/<script src="([^"]+)"/g)].forEach(m => check(sw.includes(`"${m[1]}"`), `sw.js doesn't cache ${m[1]}, so the game won't load offline`));

// Every tree node and research text renders for each level without throwing
D.TREE.forEach(n => { for (let L = 1; L <= n.max; L++) check(typeof n.text(L) === "string", `tree node ${n.id} text fails at level ${L}`); });

// Every class the scripts put on elements is styled in style.css, so markup can't silently lose its look.
// These are set from JS on purpose without a style rule (hooks the code looks up, or deliberately plain).
// Add to this list only when a new unstyled class is intended.
const UNSTYLED_CLASSES = new Set([
  "b-cost", "d-start-btn", "i-body", "k-cook-btn", "modal-body", "p-eyes", "p-hat", "p-hat-emoji", "p-item-emoji",
  "p-scarf", "p-shadow", "p-wing", "patting", "r-cost", "seal-icon", "stamp-dest", "u-icon", "w-name",
]);
{
  const css = read("style.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const styled = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]));
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const seen = new Map();   // unstyled class -> first place it's set
  for (const file of walk(path.join(__dirname, "..", "src")).filter(f => f.endsWith(".js"))) {
    fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      const where = `${path.relative(path.join(__dirname, ".."), file).split(path.sep).join("/")}:${i + 1}`;
      const names = [];
      // static words only: dynamic parts (${...}) and runtime-built prefixes like `tier-${n}` are skipped
      const words = s => s.replace(/\$\{[^}]*\}\S*/g, " ").split(/\s+/).filter(w => w && !w.endsWith("-"));
      for (const m of line.matchAll(/class="([^"]*)"/g)) names.push(...words(m[1]));
      for (const m of line.matchAll(/className\s*=\s*["'`]([^"'`]*)["'`]/g)) names.push(...words(m[1]));
      for (const m of line.matchAll(/classList\.(?:add|toggle|remove|contains)\(\s*["'`]([^"'`$]+)["'`]/g)) names.push(m[1]);
      names.filter(c => /^-?[_a-zA-Z][\w-]*$/.test(c) && !styled.has(c) && !UNSTYLED_CLASSES.has(c) && !seen.has(c)).forEach(c => seen.set(c, where));
    });
  }
  seen.forEach((where, c) => check(false, `class "${c}" (${where}) has no rule in style.css: style it, fix the name, or add it to UNSTYLED_CLASSES`));
}

if (problems.length) {
  console.error(`Data check FAILED (${problems.length}):\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`Data check passed: version ${D.GAME_VERSION}, ${D.BUILDINGS.length} colony members, ${D.UPGRADES.length} upgrades, ${D.RESEARCH.length} research, ` +
  `${D.TREE.length} heirlooms, ${D.HELPERS.length} helpers, ${D.SHORES.length} shores, ${D.ACHIEVEMENTS.length} memories, all icons unique.`);
