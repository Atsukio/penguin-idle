/* Penguin Idle engine: wardrobe, nap streaks, resident names, golden fish and penguin letters.
 * Moved verbatim from engine.js; shared state is read through S() and M().
 * Loads in the browser and in Node (tools/load-engine.js). */
(function (PI) {
  "use strict";

  const E = PI.engine;
  const D = PI.data;
  const fmt = PI.fmt;
  const { COSMETICS, LETTER_TYPES, LETTER_SENDERS } = PI.data;
  const S = () => E.state;
  const M = () => E.M;
  const { now, bus, fishPerSecond, gain, checkPassportStamps } = E;
  const LT_BY_ID = Object.fromEntries(LETTER_TYPES.map(t => [t.id, t]));
  // ---------- Wardrobe ----------
  const cosmeticItem = (slot, id) => COSMETICS[slot].find(c => c.id === id) || COSMETICS[slot][0];
  const cosmeticUnlocked = (slot, id) => { const c = COSMETICS[slot].find(x => x.id === id); return !!c && c.need(S()); };
  function setOutfit(slot, id) {
    if (!COSMETICS[slot] || !cosmeticUnlocked(slot, id) || S().cosmetics[slot] === id) return false;
    S().cosmetics[slot] = id;
    S().stats.outfitChanges++;
    bus.emit("outfit", { slot, id });
    return true;
  }

  // ---------- Nap streak ----------
  const NAP_STREAK_SECS = 300;   // a nap day needs this much napping
  function addNapTime(secs, date = new Date(now())) {
    const ns = S().napStreak, today = dayKey(date);
    if (ns.day !== today) { ns.day = today; ns.secs = 0; }
    ns.secs += secs;
    if (ns.secs < NAP_STREAK_SECS || ns.last === today) return false;
    const gap = ns.last ? daysBetween(ns.last, today) : 0;
    if (gap === 1) ns.count++;
    else if (gap === 2 && graceFree(today)) { ns.count++; ns.grace = dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1)); }
    else ns.count = 1;
    ns.last = today;
    const before = ns.best;
    ns.best = Math.max(ns.best, ns.count);
    bus.emit("napStreak", { count: ns.count, best: ns.best, mask: before < 7 && ns.best >= 7 });
    return true;
  }
  // A streak survives one missed day a week: a gap of two days is fine if no day was forgiven in the last 7
  const keyDate = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((keyDate(b) - keyDate(a)) / 86400000);
  const graceFree = today => !S().napStreak.grace || daysBetween(S().napStreak.grace, today) >= 7;
  const napStreakNow = (date = new Date(now())) => {
    const ns = S().napStreak;
    if (!ns.last) return 0;
    const today = dayKey(date), gap = daysBetween(ns.last, today);
    return gap <= 1 || (gap === 2 && graceFree(today)) ? ns.count : 0;
  };

  // ---------- Resident names ----------
  const NAME_SLOTS = 6;
  const cleanName = v => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
  function setName(i, name) {
    if (!(i >= 0 && i < NAME_SLOTS)) return false;
    const n = cleanName(name);
    while (S().names.length <= i) S().names.push("");
    if (S().names[i] === n) return false;
    S().names[i] = n;
    while (S().names.length && !S().names[S().names.length - 1]) S().names.pop();
    ensureDefaultNames();
    bus.emit("names");
    return true;
  }
  // Every slot has a cute default, kept in the save so residents don't change names on a reload.
  const randomCuteName = (avoid = []) => {
    const pool = D.CUTE_NAMES.filter(n => !avoid.includes(n));
    return (pool.length ? pool : D.CUTE_NAMES)[Math.floor(Math.random() * (pool.length || D.CUTE_NAMES.length))];
  };
  function ensureDefaultNames() {
    const d = S().defaultNames;
    for (let i = 0; i < NAME_SLOTS; i++) {
      if (d[i] && !d.slice(0, i).includes(d[i]) && !S().names.includes(d[i])) continue;   // no two residents share a name
      d[i] = randomCuteName([...d.slice(0, i), ...S().names]);
    }
    d.length = NAME_SLOTS;
  }
  // A fresh cute name for slot i, different from every name already in use
  const suggestName = i => randomCuteName([...S().names, ...S().defaultNames, S().names[i]]);
  // Slot by slot: the player's name if they gave one, otherwise the default
  const residentNames = () => Array.from({ length: NAME_SLOTS }, (_, i) => S().names[i] || S().defaultNames[i]).filter(Boolean);
  const playerNames = () => S().names.filter(Boolean);

  // ---------- Golden fish ----------
  const goldenDelay = () => (120 + Math.random() * 180) * 1000 / M().goldenFreq;

  function rollGoldenVariant() {
    const r = Math.random();
    const b = (M() && M().exoticChanceBonus) || 0;
    if (r < 0.05 + b * 0.3) return "feathered";
    if (r < 0.20 + b * 0.7) return "glacier";
    if (r < 0.35 + b) return "rainbow";
    return "golden";
  }

  function addBuff(type, name, mult, ms) {
    const until = now() + ms;
    const existing = S().buffs.find(b => b.name === name && b.until > now());
    if (existing) { existing.until = Math.max(existing.until, until); existing.mult = Math.max(existing.mult, mult); }
    else S().buffs.push({ type, name, mult, until });
  }

  function goldenEffect(pos = {}, auto = false, force = null, quiet = false, variant = null) {
    S().stats.goldenClicks++;
    if (!variant) variant = force === "rush" ? "golden" : (force && ["rainbow", "glacier", "feathered", "golden"].includes(force) ? force : rollGoldenVariant());
    if (variant !== "golden") S().stats.exoticCatches = (S().stats.exoticCatches || 0) + 1;
    if (S().shore === "sunnycove") {
      S().stats.sunnyCatches = (S().stats.sunnyCatches || 0) + 1;
      checkPassportStamps();
    }

    const season = M().season;
    if (season) {
      S().stats.seasonalCatches++;
      if (!S().seasonalUnlocks.includes(season.id)) {
        S().seasonalUnlocks.push(season.id);
        const [slot, id] = season.cosmetic;
        bus.emit("seasonUnlock", { season, item: cosmeticItem(slot, id) });
      }
    }
    const d = M().goldenDur;
    const secs = base => Math.round(base * d);
    let msg, kind;

    if (variant === "rainbow") {
      kind = "rainbow";
      addBuff("prod", "Rainbow Frenzy", 5, secs(25) * 1000);
      addBuff("click", "Bubble Tap", 10, secs(25) * 1000);
      msg = `🌈 <b>Rainbow Frenzy!</b> A splash of color: production ×5 and pat power ×10 for ${secs(25)}s!`;
    } else if (variant === "glacier") {
      kind = "glacier";
      const nowMs = now();
      const activeBuffs = S().buffs.filter(b => b.until > nowMs);
      if (activeBuffs.length > 0) {
        const ext = secs(25) * 1000;
        activeBuffs.forEach(b => { b.until += ext; });
        msg = `❄️ <b>Glacier Freeze!</b> Time stops on the ice: all active buffs extended by +${secs(25)}s!`;
      } else {
        addBuff("prod", "Glacier Surge", 12, secs(30) * 1000);
        msg = `❄️ <b>Glacier Surge!</b> Crisp polar wind: production ×12 for ${secs(30)}s!`;
      }
    } else if (variant === "feathered") {
      kind = "feathered";
      S().bonusFeathers = (S().bonusFeathers || 0) + 1;
      const amount = Math.max(10, fishPerSecond(false) * 600 * M().luckyMult);
      gain(amount);
      msg = `🪶 <b>Moult Bounty!</b> A rare golden feather (+1 pending feather) and +${fmt(amount)} fish!`;
    } else {
      const roll = force === "rush" ? 0.5 : Math.random();
      if (M().aurora && roll < 0.08 && !force) {
        kind = "aurora";
        addBuff("prod", "Aurora Blessing", 50, secs(30) * 1000);
        msg = `<b>Aurora Blessing!</b> The sky lights up: production ×50 for ${secs(30)}s`;
      } else if (roll < 0.45) {
        kind = "lucky";
        const amount = (Math.min(S().fish * 0.15, fishPerSecond(false) * 600) + 13) * M().luckyMult;
        gain(amount);
        msg = `<b>Lucky Catch!</b> +${fmt(amount)} fish`;
      } else if (roll < 0.85) {
        kind = "rush";
        addBuff("prod", "Cocoa Rush", M().rushMult, secs(77) * 1000);
        msg = `<b>Cocoa Rush!</b> Everyone's warmed up: production ×${M().rushMult} for ${secs(77)}s`;
      } else {
        kind = "flurry";
        addBuff("click", "Flipper Flurry", 77, secs(13) * 1000);
        msg = `<b>Flipper Flurry!</b> Pats are ×77 for ${secs(13)}s`;
      }
    }
    bus.emit("golden", { msg, kind, variant, auto, quiet, x: pos.x, y: pos.y });
    bus.emit("buffs");
    return kind;
  }

  // ---------- Penguin letters ----------
  function dayKey(date = new Date(now())) {
    const p = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }
  function seededRng(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => {   // mulberry32
      h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const statValue = stat => (stat === "lifetimeFish" ? S().lifetimeFish : S().stats[stat] || 0);
  const letterProgress = l => Math.min(l.target, Math.max(0, statValue(LT_BY_ID[l.type].stat) - l.base));
  const letterReward = () => Math.max(100, fishPerSecond(false) * 900);   // 15 minutes of production

  function ensureLetters(date = new Date(now())) {
    const day = dayKey(date);
    if (S().letters.day === day) return false;
    const rng = seededRng(`${day}:${S().stats.startedAt}`);
    const pool = LETTER_TYPES.filter(t => !t.available || t.available(S()));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const list = pool.slice(0, 3).map(t => {
      let target = Math.round(t.range[0] + rng() * (t.range[1] - t.range[0]));
      if (t.fishMinutes) target = Math.max(500, Math.round(fishPerSecond(false) * 60 * target));
      const [sender, icon] = LETTER_SENDERS[Math.floor(rng() * LETTER_SENDERS.length)];
      return { type: t.id, target, base: statValue(t.stat), claimed: false, sender, icon };
    });
    // Save the letters: a letter from yesterday that was never answered stays open for one more day, marked late
    const yesterday = dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1));
    const carried = S().letters.day === yesterday ? S().letters.list.filter(l => !l.claimed && !l.late).map(l => ({ ...l, late: true })) : [];
    S().letters = { day, list: [...carried, ...list], bonus: false };
    bus.emit("letters");
    return true;
  }

  function claimLetter(i, origin = null) {
    const l = S().letters.list[i];
    if (!l || l.claimed || letterProgress(l) < l.target) return false;
    l.claimed = true;
    const reward = letterReward();
    gain(reward);
    S().stats.lettersClaimed++;
    bus.emit("letterClaimed", { l, reward, origin });
    bus.emit("letters");
    return true;
  }

  // The care package counts today's three letters only; late letters from yesterday don't block it
  const todaysLetters = () => S().letters.list.filter(l => !l.late);
  function claimLetterBonus(origin = null) {
    const today = todaysLetters();
    if (S().letters.bonus || !today.length || !today.every(l => l.claimed)) return false;
    S().letters.bonus = true;
    const secs = Math.round(180 * M().goldenDur);
    addBuff("prod", "Care Package", 7, secs * 1000);
    bus.emit("letterBonus", { secs, origin });
    bus.emit("buffs");
    bus.emit("letters");
    return true;
  }

  // Seconds until the daily letters reset (the next local midnight, the same day boundary dayKey uses)
  function secsToNewDay(date = new Date(now())) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    return Math.max(0, (next - date) / 1000);
  }


  const api = { cosmeticItem, cosmeticUnlocked, setOutfit, addNapTime, napStreakNow, NAME_SLOTS, cleanName, setName, ensureDefaultNames, suggestName, residentNames, playerNames, goldenDelay, rollGoldenVariant, goldenEffect, dayKey, letterProgress, letterReward, ensureLetters, claimLetter, todaysLetters, claimLetterBonus, secsToNewDay };
  PI.engineEvents = api;
  Object.assign(E, api);
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
