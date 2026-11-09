/* Penguin Idle — Engine Progress: Memories, Achievements & Passport Stamps.
 * Computes memory unlock conditions, progress tracking, and shore passport stamp completions.
 */
(function (PI) {
  "use strict";

  const D = PI.data;
  const E = () => PI.engine;
  const S = () => PI.engine.state;
  const bus = () => PI.engine.bus;
  const now = () => PI.engine.now();

  // ---------- Achievements ----------
  // Progress of one memory as { cur, goal, kind, frac }, or null if it is a one-off goal
  function memoryProgress(a) {
    if (!a.prog) return null;
    const [cur, goal, kind] = a.prog(S(), E());
    return { cur: Math.min(cur, goal), goal, kind, frac: Math.max(0, Math.min(1, cur / goal)) };
  }

  // Locked memories that have a progress bar, closest to done first
  function nearestMemories(limit = 3, minFrac = 0) {
    const s = S();
    return D.ACHIEVEMENTS.filter(a => a.prog && !s.achievements.includes(a.id))
      .map(a => ({ a, ...memoryProgress(a) })).filter(m => m.frac >= minFrac && m.frac < 1)
      .sort((x, y) => y.frac - x.frac).slice(0, limit);
  }

  // Called when the player leaves the Memories tab: the New markers go away
  function clearNewMemories() { S().achNew = []; }

  function checkAchievements() {
    const s = S(), eng = E();
    const fresh = D.ACHIEVEMENTS.filter(a => !s.achievements.includes(a.id) && a.check(s, eng));
    if (!fresh.length) return [];
    const t = now();
    fresh.forEach(a => { s.achievements.push(a.id); s.achDates[a.id] = t; s.achNew.push(a.id); });
    eng.recompute();
    bus().emit("structure");
    bus().emit("achievements", fresh);
    return fresh;
  }

  // ---------- Shore Passport Stamps ----------
  function passportProgress(stampId) {
    const stamp = D.PASSPORT_STAMP_BY_ID[stampId];
    if (!stamp) return null;
    const s = S();
    const done = (s.shoreStamps || []).includes(stampId);
    let cur = 0;
    const target = stamp.target;
    if (done) {
      cur = target;
    } else if (s.migrations < 1) {
      cur = 0;
    } else {
      if (stampId === "home") cur = s.shore === "home" ? D.totalColony(s) : 0;
      else if (stampId === "krillbay") cur = s.shore === "krillbay" ? (s.buildings.krill || 0) : 0;
      else if (stampId === "sunnycove") cur = s.stats.sunnyCatches || 0;
      else if (stampId === "blizzard") cur = s.shore === "blizzard" ? (E().pendingFeathers ? E().pendingFeathers() : 0) : (s.stats.blizzardMigrateFeathers || 0);
      else if (stampId === "aurorafields") cur = s.shore === "aurorafields" ? (s.buildings.aurora || 0) : 0;
      else if (stampId === "quiethollow") cur = s.stats.quietSeconds || 0;
      else if (stampId === "harbour") cur = s.shore === "harbour" ? D.totalColony(s) : 0;
      else if (stampId === "rookery") cur = s.shore === "rookery" ? Object.values(s.research).reduce((a, b) => a + b, 0) : 0;
    }
    const frac = done ? 1 : Math.max(0, Math.min(1, cur / target));
    return { cur, target, done, frac, time: stamp.time || false };
  }

  function checkPassportStamps() {
    const s = S();
    if (s.migrations < 1) return [];
    const currentShore = s.shore;
    if (!currentShore || (s.shoreStamps || []).includes(currentShore)) return [];
    const p = passportProgress(currentShore);
    if (p && p.cur >= p.target) {
      if (!s.shoreStamps) s.shoreStamps = [];
      if (!s.shoreStampDates) s.shoreStampDates = {};
      s.shoreStamps.push(currentShore);
      s.shoreStampDates[currentShore] = now();
      E().recompute();
      const stamp = D.PASSPORT_STAMP_BY_ID[currentShore];
      bus().emit("structure");
      bus().emit("passportStamp", { stamp, shore: D.SHORE_BY_ID[currentShore] });
      checkAchievements();
      return [currentShore];
    }
    return [];
  }

  const progress = {
    memoryProgress,
    nearestMemories,
    clearNewMemories,
    checkAchievements,
    passportProgress,
    checkPassportStamps,
  };

  PI.engineProgress = progress;

  // Delegate on PI.engine
  PI.engine = PI.engine || {};
  Object.assign(PI.engine, progress);
})(typeof window !== "undefined" ? (window.PI = window.PI || {}) : (globalThis.PI = globalThis.PI || {}));
