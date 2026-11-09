#!/usr/bin/env node
/* Balance simulator: plays Penguin Idle with the real engine and a fast-forward clock.
 *
 *   node tools/simulate.js                     active player (5 pats/s, catches golden fish), 48 hours
 *   node tools/simulate.js --profile idle      never pats, ignores golden fish
 *   node tools/simulate.js --hours 120 --seed 7
 *   node tools/simulate.js --ci                checks pacing stays within bounds; exits 1 if not
 *
 * The bot buys whatever pays for itself soonest (cost ÷ extra income, plus time spent saving up),
 * migrates once that would at least double its feathers, then spends feathers on the Heirloom Tree.
 */
"use strict";
const path = require("path");

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = name => args.includes(`--${name}`);
const HOURS = Number(opt("hours", 48));
const PROFILE = opt("profile", "active");
const SEED = Number(opt("seed", 1));
const CI = flag("ci");
const JSON_OUT = flag("json");

// Deterministic Math.random so runs are repeatable
let seed = SEED >>> 0 || 1;
Math.random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

globalThis.PI = {};
require(path.join(__dirname, "../src/data.js"));
require(path.join(__dirname, "../src/engine.js"));
require(path.join(__dirname, "../src/engine-save.js"));
require(path.join(__dirname, "../src/engine-helpers.js"));
const { engine: E, data: D, fmt, fmtTime } = globalThis.PI;

let simTime = Date.UTC(2026, 9, 1);   // October: no seasonal event
const START = simTime;
E.clock = () => simTime;
E.setSeasonOverride(null);
E.replaceState(E.freshState());
const S = () => E.state;

const ACTIVE = PROFILE === "active";
// The idle player pats only to get going (until 10 colony members each run), then leaves it alone
const patsPerSec = () => (ACTIVE || D.totalColony(S()) < 10 ? 5 : 0);
const income = () => E.fishPerSecond() + patsPerSec() * E.clickPower();

// ---------- Candidate purchases ----------
function withTemp(apply, revert) {
  const before = income();
  apply(); E.recompute();
  const after = income();
  revert(); E.recompute();
  return after - before;
}

function candidates() {
  const s = S(), out = [];
  D.BUILDINGS.forEach((b, i) => {
    if (!E.buildingVisible(b, i)) return;
    const cost = E.costOf(b, s.buildings[b.id], 1);
    const delta = withTemp(() => { s.buildings[b.id]++; }, () => { s.buildings[b.id]--; });
    out.push({ kind: "building", id: b.id, cost, delta, buy: () => E.buyBuilding(b.id, 1, null, true) });
  });
  E.availableUpgrades().slice(0, 20).forEach(u => {
    const cost = E.upgradeCost(u);
    const delta = withTemp(() => { s.upgrades.push(u.id); }, () => { s.upgrades.pop(); });
    out.push({ kind: "upgrade", id: u.id, cost, delta, buy: () => E.buyUpgrade(u.id, null, true) });
  });
  D.RESEARCH.forEach(r => {
    const L = E.researchLevel(r.id);
    if (!E.researchUnlocked(r) || L >= r.max) return;
    const cost = E.researchCost(r, L);
    const delta = withTemp(() => { s.research[r.id] = L + 1; }, () => { if (L) s.research[r.id] = L; else delete s.research[r.id]; });
    out.push({ kind: "research", id: r.id, cost, delta, buy: () => E.buyResearch(r.id, null, true) });
  });
  return out;
}

function pick() {
  const inc = Math.max(1e-9, income()), fish = S().fish;
  let best = null, bestScore = Infinity;
  for (const c of candidates()) {
    // Things with no direct income effect (golden fish, offline, cost cuts) are bought when cheap
    const score = c.delta > 0 ? c.cost / c.delta + Math.max(0, c.cost - fish) / inc
      : (c.cost <= fish * 0.05 ? 0 : Infinity);
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// ---------- Feathers: spend greedily, cheapest useful node first ----------
const BRANCH_ORDER = ACTIVE ? ["root", "hearth", "flipper", "wanderer"] : ["root", "hearth", "wanderer", "flipper"];
function spendFeathers() {
  for (let guard = 0; guard < 500; guard++) {
    const options = D.TREE.filter(n => n.id !== "spirit" && E.nodeLevel(n.id) < n.max && E.nodeReqsMet(n))
      .map(n => ({ n, cost: E.nodeCost(n, E.nodeLevel(n.id)) }))
      .filter(o => o.cost <= E.spendableFeathers())
      .sort((a, b) => BRANCH_ORDER.indexOf(a.n.branch) - BRANCH_ORDER.indexOf(b.n.branch) || a.cost - b.cost);
    if (!options.length || !E.learnNode(options[0].n.id)) return;
  }
}

// ---------- Run ----------
const log = { firstBuilding: {}, migrations: [], hourly: [], capstones: {}, longestWait: 0, longestWaitAt: 0, research: {} };
let nextGolden = simTime + E.goldenDelay();
let lastPurchase = simTime;
let nextHourMark = START + 3600e3;
const END = START + HOURS * 3600e3;

function advance(seconds) {
  // Step in chunks so autoclick, buffs and golden fish behave sensibly
  const chunk = ACTIVE ? 10 : 120;
  let left = seconds;
  while (left > 0) {
    const dt = Math.min(chunk, left);
    simTime += dt * 1000;
    E.tick(dt);
    const pps = patsPerSec();
    if (pps) for (let i = 0; i < pps * dt; i++) E.clickPenguin({}, false);
    if (ACTIVE && !E.M.noGolden && simTime >= nextGolden) { E.goldenEffect({}); nextGolden = simTime + E.goldenDelay(); }
    left -= dt;
  }
}

while (simTime < END) {
  const s = S();
  const c = pick();
  if (c) {
    const inc = Math.max(1e-9, income());
    const wait = Math.max(0, (c.cost - s.fish) / inc);
    if (wait > 0) advance(Math.min(wait + 0.01, 600));
    if (S().fish >= c.cost && c.buy()) {
      const waited = (simTime - lastPurchase) / 1000;
      if (waited > log.longestWait) { log.longestWait = waited; log.longestWaitAt = (simTime - START) / 1000; }
      lastPurchase = simTime;
      if (c.kind === "building" && log.firstBuilding[c.id] === undefined) log.firstBuilding[c.id] = (simTime - START) / 1000;
    }
  } else {
    advance(60);
  }
  E.checkAchievements();

  // Migrate once it would at least double our feathers
  const pend = E.pendingFeathers();
  if (pend >= Math.max(1, s.feathersEarned)) {
    const runTime = (simTime - s.stats.runStartedAt) / 1000;
    E.doMigrate("home");
    log.migrations.push({ at: (simTime - START) / 1000, runTime, gained: pend, total: S().feathersEarned });
    spendFeathers();
    lastPurchase = simTime;
  }
  D.TREE.filter(n => n.capstone && E.nodeLevel(n.id) > 0 && log.capstones[n.id] === undefined)
    .forEach(n => { log.capstones[n.id] = (simTime - START) / 1000; });

  while (simTime >= nextHourMark) {
    log.hourly.push({ hour: log.hourly.length + 1, fps: E.fishPerSecond(false), fish: S().fish, feathers: S().feathersEarned, memories: S().achievements.length });
    nextHourMark += 3600e3;
  }
  if (!isFinite(S().fish) || Number.isNaN(S().fish)) { console.error("Fish became non-finite!"); process.exit(1); }
}

// ---------- Report ----------
const st = S();
const report = {
  profile: PROFILE, hours: HOURS, seed: SEED,
  firstBuilding: log.firstBuilding, migrations: log.migrations, capstones: log.capstones,
  longestWait: log.longestWait, longestWaitAt: log.longestWaitAt,
  end: { fps: E.fishPerSecond(false), lifetimeFish: st.lifetimeFish, feathers: st.feathersEarned, memories: st.achievements.length,
    heirloomLevels: Object.values(st.heritage).reduce((a, b) => a + b, 0), upgrades: st.upgrades.length },
  hourly: log.hourly,
};

if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); }
else {
  console.log(`\nPenguin Idle balance run: ${PROFILE} player, ${HOURS}h, seed ${SEED}\n`);
  console.log("First of each colony member:");
  D.BUILDINGS.forEach(b => console.log(`  ${b.name.padEnd(22)} ${report.firstBuilding[b.id] !== undefined ? fmtTime(report.firstBuilding[b.id]) : "—"}`));
  console.log(`\nMigrations: ${log.migrations.length}`);
  log.migrations.slice(0, 12).forEach((m, i) => console.log(`  #${String(i + 1).padEnd(3)} at ${fmtTime(m.at).padEnd(8)} run took ${fmtTime(m.runTime).padEnd(8)} +${fmt(m.gained)} feathers (total ${fmt(m.total)})`));
  if (log.migrations.length > 12) console.log(`  … ${log.migrations.length - 12} more`);
  console.log("\nCapstones:", Object.keys(log.capstones).length ? Object.entries(log.capstones).map(([k, v]) => `${k} at ${fmtTime(v)}`).join(", ") : "none yet");
  console.log(`Longest wait between purchases: ${fmtTime(log.longestWait)} (at ${fmtTime(log.longestWaitAt)})`);
  console.log(`\nEnd: ${fmt(report.end.fps)}/s, ${fmt(report.end.lifetimeFish)} lifetime fish, ${fmt(report.end.feathers)} feathers, ` +
    `${report.end.memories}/${D.ACHIEVEMENTS.length} memories, ${report.end.heirloomLevels} heirloom levels`);
  console.log("\nHourly (every 6h):");
  log.hourly.filter(h => h.hour % 6 === 0 || h.hour === 1).forEach(h => console.log(`  h${String(h.hour).padEnd(4)} ${fmt(h.fps).padStart(9)}/s  feathers ${fmt(h.feathers).padStart(7)}  memories ${h.memories}`));
}

// ---------- CI bounds: catch balance regressions, not exact numbers ----------
if (CI) {
  const fail = [];
  const firstMig = log.migrations[0];
  if (!(report.firstBuilding.chick <= 30)) fail.push(`first Sleepy Chick took ${report.firstBuilding.chick}s (want ≤ 30s)`);
  if (!firstMig) fail.push("never migrated");
  else if (firstMig.at < 20 * 60 || firstMig.at > 6 * 3600) fail.push(`first migration at ${fmtTime(firstMig.at)} (want 20m–6h)`);
  // Runaway guards: feathers compounding faster than intended shows up as near-instant runs and huge totals
  const at24 = log.hourly[23];
  if (at24 && at24.feathers > 1e9) fail.push(`${fmt(at24.feathers)} feathers after 24h (want ≤ 1B: something is compounding)`);
  const collapsed = log.migrations.slice(10).filter(m => m.runTime < 60).length;
  if (collapsed > 2) fail.push(`${collapsed} later migrations took under a minute (runs are collapsing)`);
  const firstCap = Math.min(...Object.values(log.capstones), Infinity);
  if (firstCap < 12 * 3600) fail.push(`first capstone at ${fmtTime(firstCap)} (want ≥ 12h even for a perfect player)`);
  if (log.longestWait > 30 * 3600) fail.push(`stalled for ${fmtTime(log.longestWait)} without a purchase (want ≤ 30h)`);
  if (!isFinite(report.end.fps) || report.end.fps >= E.MAX) fail.push("production hit the number ceiling");
  if (fail.length) { console.error("\nBalance check FAILED:\n  - " + fail.join("\n  - ")); process.exit(1); }
  console.log("\nBalance check passed.");
}
