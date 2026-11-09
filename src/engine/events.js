/* Penguin Idle — Engine Events: Golden Fish, Daily Mailbox, Wardrobe, Nap Streaks & Names.
 * Handles episodic events, random variant generation, daily calendar rollover,
 * resident naming, outfit swaps, and nap streak tracking.
 */
(function (PI) {
  "use strict";

  const D = PI.data;
  const E = () => PI.engine;
  const S = () => PI.engine.state;
  const M = () => PI.engine.M;
  const bus = () => PI.engine.bus;
  const now = () => PI.engine.now();

  // ---------- Calendar / Dates ----------
  function dayKey(date = new Date(now())) {
    const p = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }

  function secsToNewDay(date = new Date(now())) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    return Math.max(0, (next - date) / 1000);
  }

  // ---------- Wardrobe ----------
  const cosmeticItem = (slot, id) => D.COSMETICS[slot].find(c => c.id === id) || D.COSMETICS[slot][0];
  const cosmeticUnlocked = (slot, id) => { const c = D.COSMETICS[slot].find(x => x.id === id); return !!c && c.need(S()); };
  function setOutfit(slot, id) {
    const s = S();
    if (!D.COSMETICS[slot] || !cosmeticUnlocked(slot, id) || s.cosmetics[slot] === id) return false;
    s.cosmetics[slot] = id;
    s.stats.outfitChanges++;
    bus().emit("outfit", { slot, id });
    return true;
  }

  // ---------- Nap streak ----------
  const NAP_STREAK_SECS = 300;   // a nap day needs this much napping
  const keyDate = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((keyDate(b) - keyDate(a)) / 86400000);
  const graceFree = today => !S().napStreak.grace || daysBetween(S().napStreak.grace, today) >= 7;

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
    bus().emit("napStreak", { count: ns.count, best: ns.best, mask: before < 7 && ns.best >= 7 });
    return true;
  }

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
    const s = S();
    while (s.names.length <= i) s.names.push("");
    if (s.names[i] === n) return false;
    s.names[i] = n;
    while (s.names.length && !s.names[s.names.length - 1]) s.names.pop();
    ensureDefaultNames();
    bus().emit("names");
    return true;
  }

  const randomCuteName = (avoid = []) => {
    const pool = D.CUTE_NAMES.filter(n => !avoid.includes(n));
    return (pool.length ? pool : D.CUTE_NAMES)[Math.floor(Math.random() * (pool.length || D.CUTE_NAMES.length))];
  };

  function ensureDefaultNames() {
    const s = S();
    const d = s.defaultNames;
    for (let i = 0; i < NAME_SLOTS; i++) {
      if (d[i] && !d.slice(0, i).includes(d[i]) && !s.names.includes(d[i])) continue;
      d[i] = randomCuteName([...d.slice(0, i), ...s.names]);
    }
    d.length = NAME_SLOTS;
  }

  const suggestName = i => randomCuteName([...S().names, ...S().defaultNames, S().names[i]]);
  const residentNames = () => Array.from({ length: NAME_SLOTS }, (_, i) => S().names[i] || S().defaultNames[i]).filter(Boolean);
  const playerNames = () => S().names.filter(Boolean);

  // ---------- Golden fish ----------
  const goldenDelay = () => (120 + Math.random() * 180) * 1000 / M().goldenFreq;

  function rollGoldenVariant() {
    const r = Math.random();
    const m = M();
    const b = (m && m.exoticChanceBonus) || 0;
    if (r < 0.05 + b * 0.3) return "feathered";
    if (r < 0.20 + b * 0.7) return "glacier";
    if (r < 0.35 + b) return "rainbow";
    return "golden";
  }

  function goldenEffect(pos = {}, auto = false, force = null, quiet = false, variant = null) {
    const s = S(), m = M(), eng = E();
    s.stats.goldenClicks++;
    if (!variant) variant = force === "rush" ? "golden" : (force && ["rainbow", "glacier", "feathered", "golden"].includes(force) ? force : rollGoldenVariant());
    if (variant !== "golden") s.stats.exoticCatches = (s.stats.exoticCatches || 0) + 1;
    if (s.shore === "sunnycove") {
      s.stats.sunnyCatches = (s.stats.sunnyCatches || 0) + 1;
      if (eng.checkPassportStamps) eng.checkPassportStamps();
    }

    const season = m.season;
    if (season) {
      s.stats.seasonalCatches++;
      if (!s.seasonalUnlocks.includes(season.id)) {
        s.seasonalUnlocks.push(season.id);
        const [slot, id] = season.cosmetic;
        bus().emit("seasonUnlock", { season, item: cosmeticItem(slot, id) });
      }
    }
    const d = m.goldenDur;
    const secs = base => Math.round(base * d);
    let msg, kind;

    if (variant === "rainbow") {
      kind = "rainbow";
      eng.addBuff("prod", "Rainbow Frenzy", 5, secs(25) * 1000);
      eng.addBuff("click", "Bubble Tap", 10, secs(25) * 1000);
      msg = `🌈 <b>Rainbow Frenzy!</b> A splash of color: production ×5 and pat power ×10 for ${secs(25)}s!`;
    } else if (variant === "glacier") {
      kind = "glacier";
      const nowMs = now();
      const activeBuffs = s.buffs.filter(b => b.until > nowMs);
      if (activeBuffs.length > 0) {
        const ext = secs(25) * 1000;
        activeBuffs.forEach(b => { b.until += ext; });
        msg = `❄️ <b>Glacier Freeze!</b> Time stops on the ice: all active buffs extended by +${secs(25)}s!`;
      } else {
        eng.addBuff("prod", "Glacier Surge", 12, secs(30) * 1000);
        msg = `❄️ <b>Glacier Surge!</b> Crisp polar wind: production ×12 for ${secs(30)}s!`;
      }
    } else if (variant === "feathered") {
      kind = "feathered";
      s.bonusFeathers = (s.bonusFeathers || 0) + 1;
      const amount = Math.max(10, eng.fishPerSecond(false) * 600 * m.luckyMult);
      eng.gain(amount);
      msg = `🪶 <b>Moult Bounty!</b> A rare golden feather (+1 pending feather) and +${PI.fmt(amount)} fish!`;
    } else {
      const roll = force === "rush" ? 0.5 : Math.random();
      if (m.aurora && roll < 0.08 && !force) {
        kind = "aurora";
        eng.addBuff("prod", "Aurora Blessing", 50, secs(30) * 1000);
        msg = `<b>Aurora Blessing!</b> The sky lights up: production ×50 for ${secs(30)}s`;
      } else if (roll < 0.45) {
        kind = "lucky";
        const amount = (Math.min(s.fish * 0.15, eng.fishPerSecond(false) * 600) + 13) * m.luckyMult;
        eng.gain(amount);
        msg = `<b>Lucky Catch!</b> +${PI.fmt(amount)} fish`;
      } else if (roll < 0.85) {
        kind = "rush";
        eng.addBuff("prod", "Cocoa Rush", m.rushMult, secs(77) * 1000);
        msg = `<b>Cocoa Rush!</b> Everyone's warmed up: production ×${m.rushMult} for ${secs(77)}s`;
      } else {
        kind = "flurry";
        eng.addBuff("click", "Flipper Flurry", 77, secs(13) * 1000);
        msg = `<b>Flipper Flurry!</b> Pats are ×77 for ${secs(13)}s`;
      }
    }
    bus().emit("golden", { msg, kind, variant, auto, quiet, x: pos.x, y: pos.y });
    bus().emit("buffs");
    return kind;
  }

  // ---------- Penguin letters ----------
  function seededRng(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => {
      h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const LT_BY_ID = Object.fromEntries(D.LETTER_TYPES.map(t => [t.id, t]));
  const statValue = stat => (stat === "lifetimeFish" ? S().lifetimeFish : S().stats[stat] || 0);
  const letterProgress = l => Math.min(l.target, Math.max(0, statValue(LT_BY_ID[l.type].stat) - l.base));
  const letterReward = () => Math.max(100, E().fishPerSecond(false) * 900);

  function ensureLetters(date = new Date(now())) {
    const s = S();
    const day = dayKey(date);
    if (s.letters.day === day) return false;
    const rng = seededRng(`${day}:${s.stats.startedAt}`);
    const pool = D.LETTER_TYPES.filter(t => !t.available || t.available(s));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const list = pool.slice(0, 3).map(t => {
      let target = Math.round(t.range[0] + rng() * (t.range[1] - t.range[0]));
      if (t.fishMinutes) target = Math.max(500, Math.round(E().fishPerSecond(false) * 60 * target));
      const [sender, icon] = D.LETTER_SENDERS[Math.floor(rng() * D.LETTER_SENDERS.length)];
      return { type: t.id, target, base: statValue(t.stat), claimed: false, sender, icon };
    });
    const yesterday = dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1));
    const carried = s.letters.day === yesterday ? s.letters.list.filter(l => !l.claimed && !l.late).map(l => ({ ...l, late: true })) : [];
    s.letters = { day, list: [...carried, ...list], bonus: false };
    bus().emit("letters");
    return true;
  }

  function claimLetter(i, origin = null) {
    const s = S();
    const l = s.letters.list[i];
    if (!l || l.claimed || letterProgress(l) < l.target) return false;
    l.claimed = true;
    const reward = letterReward();
    E().gain(reward);
    s.stats.lettersClaimed++;
    bus().emit("letterClaimed", { l, reward, origin });
    bus().emit("letters");
    return true;
  }

  const todaysLetters = () => S().letters.list.filter(l => !l.late);

  function claimLetterBonus(origin = null) {
    const today = todaysLetters();
    const s = S();
    if (s.letters.bonus || !today.length || !today.every(l => l.claimed)) return false;
    s.letters.bonus = true;
    const secs = Math.round(180 * M().goldenDur);
    E().addBuff("prod", "Care Package", 7, secs * 1000);
    bus().emit("letterBonus", { secs, origin });
    bus().emit("buffs");
    bus().emit("letters");
    return true;
  }

  const events = {
    dayKey,
    secsToNewDay,
    cosmeticItem,
    cosmeticUnlocked,
    setOutfit,
    addNapTime,
    napStreakNow,
    NAME_SLOTS,
    cleanName,
    setName,
    suggestName,
    residentNames,
    playerNames,
    ensureDefaultNames,
    goldenDelay,
    rollGoldenVariant,
    goldenEffect,
    letterProgress,
    letterReward,
    ensureLetters,
    claimLetter,
    todaysLetters,
    claimLetterBonus,
  };

  PI.engineEvents = events;

  // Delegate on PI.engine
  PI.engine = PI.engine || {};
  Object.assign(PI.engine, events);
})(typeof window !== "undefined" ? (window.PI = window.PI || {}) : (globalThis.PI = globalThis.PI || {}));
