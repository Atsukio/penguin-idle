/* Penguin Idle — save file encoding, decoding, validation and migration.
 * Pure data and storage logic: loads in the browser and in Node (tools/simulate.js, tools/check-data.js).
 */
(function (PI) {
  "use strict";

  const D = PI.data, E = PI.engine;
  const {
    SAVE_KEY, SAVE_VERSION, BUILDINGS, UP_BY_ID, TREE, RESEARCH, HELPERS,
    ACHIEVEMENTS, SHORE_BY_ID, SEASON_BY_ID, COSMETICS, NAP_STARS, BEDTIMES,
    TEXT_SIZES, HISTORY_LEN, FOREMAN_STRATEGY_BY_ID, SHOPKEEPER_STRATEGY_BY_ID,
    LETTER_TYPES,
  } = D;
  const LT_BY_ID = Object.fromEntries(LETTER_TYPES.map(t => [t.id, t]));
  const MAX = E.MAX || 1e300;
  const now = () => (E.now ? E.now() : Date.now());

  // Each entry upgrades a save from version N to N+1. Never delete one: old saves walk the whole chain.
  const MIGRATIONS = {
    0: d => d,  // saves made before versioning already have the v1 shape
    1: d => {   // v2: added sound, ambience, shake, reduce-motion and text-size settings
      d.settings = Object.assign(E.defaultSettings(), d.settings || {});
      return d;
    },
    2: d => {   // v3: heirlooms became a levelled skill tree (list of ids -> {id: level}); added the Workshop
      const h = d.heritage;
      d.heritage = Array.isArray(h) ? Object.fromEntries(h.map(id => [id, 1])) : (h && typeof h === "object" ? h : {});
      d.research = d.research && typeof d.research === "object" ? d.research : {};
      return d;
    },
    3: d => {   // v4: helpers, shores, wardrobe, letters, seasons and production history
      d.helpers = {};
      d.shore = "home";
      d.nextShore = "home";
      d.shoresVisited = ["home"];
      d.cosmetics = { hat: "coral", scarf: "coral", item: "mug" };
      d.seasonalUnlocks = [];
      d.letters = { day: "", list: [], bonus: false };
      d.history = [];
      return d;
    },
  };

  class SaveError extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }
  }

  function hash(str) {   // FNV-1a: detects truncated or edited save text (not anti-cheat)
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }

  function encodeSave(state = E.state) {
    const { buffs, ...data } = state;   // buffs are short-lived; don't persist them
    let b64;
    const jsonStr = JSON.stringify({ ...data, version: SAVE_VERSION });
    if (typeof btoa !== "undefined") {
      b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    } else {
      b64 = Buffer.from(jsonStr, "utf8").toString("base64");
    }
    return `${b64}.${hash(b64)}`;
  }

  function transferJSON(state = E.state) {
    const { buffs, history, ...data } = state;
    return JSON.stringify({ ...data, version: SAVE_VERSION });
  }

  function fromTransferJSON(json) {
    let data;
    try { data = JSON.parse(json); } catch (e) { throw new SaveError("corrupt", "This link's save couldn't be read."); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new SaveError("corrupt", "This link's save couldn't be read.");
    return validate(migrateSave(data));
  }

  function decodeSave(str) {
    str = String(str || "").trim();
    if (!str) throw new SaveError("empty", "There's no save text.");
    let b64 = str;
    const dot = str.lastIndexOf(".");
    if (dot > 0) {   // v1 saves have no checksum, so it's optional
      b64 = str.slice(0, dot);
      if (hash(b64) !== str.slice(dot + 1)) throw new SaveError("corrupt", "This save text is incomplete or has been changed.");
    }
    let data;
    try {
      const jsonStr = typeof atob !== "undefined"
        ? decodeURIComponent(escape(atob(b64)))
        : Buffer.from(b64, "base64").toString("utf8");
      data = JSON.parse(jsonStr);
    }
    catch (e) { throw new SaveError("corrupt", "This save text couldn't be read."); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new SaveError("corrupt", "This save text couldn't be read.");
    return validate(migrateSave(data));
  }

  function migrateSave(d) {
    let v = Number.isInteger(d.version) ? d.version : 0;
    if (v > SAVE_VERSION) {
      throw new SaveError("newer", `This save is from a newer version of Penguin Idle (save v${v}, this page v${SAVE_VERSION}). Refresh the page to get the latest version.`);
    }
    while (v < SAVE_VERSION) { d = MIGRATIONS[v](d); v++; d.version = v; }
    return d;
  }

  const num = v => (typeof v === "number" && v >= 0 ? (isFinite(v) ? Math.min(v, MAX) : MAX) : 0);
  const idList = (v, table) => [...new Set(Array.isArray(v) ? v : [])].filter(id => table[id]);
  const obj = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

  // Rebuild a clean state from plain data, checking every field rather than trusting the file
  function validate(data) {
    const s = E.freshState();
    ["fish", "runFish", "lifetimeFish", "feathersEarned", "migrations"].forEach(k => { s[k] = num(data[k]); });
    s.migrations = Math.floor(s.migrations);
    s.bonusFeathers = Math.floor(Math.max(0, num(data.bonusFeathers)));
    BUILDINGS.forEach(b => { s.buildings[b.id] = Math.floor(num(obj(data.buildings)[b.id])); });
    s.upgrades = idList(data.upgrades, UP_BY_ID);
    const levels = (v, list) => {   // {id: level} limited to known ids and each one's max level
      const out = {}, src = obj(v);
      list.forEach(x => { const L = Math.min(x.max, Math.floor(num(src[x.id]))); if (L > 0 && x.id !== "spirit") out[x.id] = L; });
      return out;
    };
    s.heritage = levels(data.heritage, TREE);
    s.research = levels(data.research, RESEARCH);
    const hIn = obj(data.helpers);
    HELPERS.forEach(h => { if (h.id in hIn) s.helpers[h.id] = hIn[h.id] === true; });
    const fStrat = data.foremanStrategy === "balanced" ? "efficiency" : data.foremanStrategy;
    s.foremanStrategy = (typeof fStrat === "string" && FOREMAN_STRATEGY_BY_ID[fStrat])
      ? fStrat : "impact";
    s.shopkeeperStrategy = (typeof data.shopkeeperStrategy === "string" && SHOPKEEPER_STRATEGY_BY_ID[data.shopkeeperStrategy])
      ? data.shopkeeperStrategy : "impact";
    s.diverStrategy = (typeof data.diverStrategy === "string" && D.DIVER_STRATEGY_BY_ID[data.diverStrategy])
      ? data.diverStrategy : "hunter";
    // Derived from what's owned, not trusted from the file
    s.feathersSpent = (E.treeSpentOn ? E.treeSpentOn(s.heritage) : 0) + (E.helpersSpentOn ? E.helpersSpentOn(s.helpers) : 0);
    s.achievements = idList(data.achievements, Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, true])));
    const achDates = obj(data.achDates);
    // Memories collected before dates were kept are dated to the day they're first loaded
    s.achievements.forEach(id => { const t = num(achDates[id]); s.achDates[id] = t > 0 ? t : now(); });
    s.achNew = idList(data.achNew, Object.fromEntries(s.achievements.map(id => [id, true])));
    s.shoresVisited = idList(data.shoresVisited, SHORE_BY_ID);
    if (!s.shoresVisited.includes("home")) s.shoresVisited.unshift("home");
    s.shore = SHORE_BY_ID[data.shore] ? data.shore : "home";
    s.nextShore = SHORE_BY_ID[data.nextShore] ? data.nextShore : "home";
    s.shoreStamps = idList(data.shoreStamps, SHORE_BY_ID);
    const stDates = obj(data.shoreStampDates);
    s.shoreStamps.forEach(id => { const t = num(stDates[id]); s.shoreStampDates[id] = t > 0 ? t : now(); });
    const cook = obj(data.cooking);
    if (cook.id && D.COOKING_RECIPE_BY_ID[cook.id] && num(cook.until) > now()) {
      s.cooking = { id: cook.id, until: num(cook.until), startedAt: num(cook.startedAt) };
    } else {
      s.cooking = { id: "", until: 0, startedAt: 0 };
    }
    const relIn = obj(data.relics);
    s.relics = {};
    D.RELICS.forEach(r => {
      const lvl = Math.floor(num(relIn[r.id]));
      if (lvl >= 1) s.relics[r.id] = Math.min(3, lvl);
    });
    const dv = obj(data.dive);
    if (dv.spotId && D.DIVE_SPOT_BY_ID[dv.spotId] && num(dv.until) > 0) {
      const t = now();
      const ready = dv.ready === true || num(dv.until) <= t;
      s.dive = { spotId: dv.spotId, startedAt: num(dv.startedAt), until: num(dv.until), ready };
    } else {
      s.dive = { spotId: "", startedAt: 0, until: 0, ready: false };
    }
    s.seasonalUnlocks = idList(data.seasonalUnlocks, SEASON_BY_ID);
    s.napStars = (Array.isArray(data.napStars) ? data.napStars : []).slice(0, NAP_STARS).map(num);
    const ns = obj(data.napStreak), day = v => (typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v) ? v : "");
    s.napStreak = { day: day(ns.day), secs: num(ns.secs), last: day(ns.last), count: Math.floor(num(ns.count)), best: Math.floor(num(ns.best)), grace: day(ns.grace) };
    const cos = obj(data.cosmetics);
    Object.keys(COSMETICS).forEach(slot => { if (COSMETICS[slot].some(c => c.id === cos[slot])) s.cosmetics[slot] = cos[slot]; });
    s.names = (Array.isArray(data.names) ? data.names : []).slice(0, E.NAME_SLOTS).map(E.cleanName);
    s.defaultNames = (Array.isArray(data.defaultNames) ? data.defaultNames : []).slice(0, E.NAME_SLOTS).map(E.cleanName);
    const L = obj(data.letters);
    if (typeof L.day === "string" && Array.isArray(L.list)) {
      s.letters.day = L.day;
      s.letters.bonus = L.bonus === true;
      s.letters.list = L.list.filter(l => l && LT_BY_ID[l.type]).slice(0, 6).map(l => ({
        type: l.type, target: Math.max(1, num(l.target)), base: num(l.base), claimed: l.claimed === true, late: l.late === true,
        sender: String(l.sender || "A friend").slice(0, 40), icon: String(l.icon || "🐧").slice(0, 8),
      }));
    }
    s.history = (Array.isArray(data.history) ? data.history : [])
      .filter(p => Array.isArray(p) && (p.length === 2 || p.length === 3))
      .map(([t, v, n]) => (n === 1 ? [num(t), num(v), 1] : [num(t), num(v)])).slice(-HISTORY_LEN);
    const st = obj(data.stats);
    Object.keys(s.stats).forEach(k => { if (num(st[k]) > 0) s.stats[k] = num(st[k]); });
    const ds = E.defaultSettings(), inSet = obj(data.settings);
    Object.keys(ds).forEach(k => { if (typeof inSet[k] === typeof ds[k]) s.settings[k] = inSet[k]; });
    s.settings.volume = Math.min(1, Math.max(0, s.settings.volume));
    s.settings.musicVolume = Math.min(1, Math.max(0, s.settings.musicVolume));
    s.settings.shake = Math.min(1, Math.max(0, s.settings.shake));
    if (!TEXT_SIZES.includes(s.settings.textSize)) s.settings.textSize = 1;
    if (!["auto", "on", "off"].includes(s.settings.batterySaver)) s.settings.batterySaver = "auto";
    if (![0, 5, 15, 30].includes(s.settings.autoNap)) s.settings.autoNap = 0;
    if (!BEDTIMES.includes(s.settings.bedtime)) s.settings.bedtime = "off";
    s.lastTick = num(data.lastTick) || now();
    // Saves from before What's new existed have no seenVersion: those players get the news too
    s.seenVersion = typeof data.seenVersion === "string" ? data.seenVersion.slice(0, 16) : "";
    return s;
  }

  // ---------- Storage (browser only) ----------
  let savingBlocked = false;   // set when the stored save is from a newer version, so we never clobber it
  const storage = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; } };

  function save() {
    const ls = storage();
    if (savingBlocked || !ls) return false;
    try {
      E.state.lastTick = now();
      const prev = ls.getItem(SAVE_KEY);
      if (prev) ls.setItem(SAVE_KEY + "_bak", prev);   // keep the last good save
      ls.setItem(SAVE_KEY, encodeSave());
      return true;
    } catch (e) { return false; }
  }

  // Returns {title, body} to show the player if anything went wrong (fail loudly, never silently)
  function load() {
    const ls = storage();
    let raw = null, bak = null;
    if (ls) { try { raw = ls.getItem(SAVE_KEY); bak = ls.getItem(SAVE_KEY + "_bak"); } catch (e) { /* ignore */ } }
    if (!raw && !bak) { E.recompute(); return null; }
    try {
      E.state = decodeSave(raw);
      E.recompute();
      return null;
    } catch (e) {
      if (e.kind === "newer") {
        savingBlocked = true;
        E.recompute();
        return { kind: "newer", title: "This save is from a newer version", body: `<p>${e.message}</p><p class="muted">Nothing will be saved until you refresh, so your progress is safe.</p>` };
      }
      try {
        E.state = decodeSave(bak);
        E.recompute();
        return { kind: "backup", title: "We restored your backup", body: "<p>Your latest save couldn't be read, so we loaded the backup from a few moments earlier.</p>" };
      } catch (e2) {
        try { ls.setItem(SAVE_KEY + "_corrupt", raw || bak); } catch (e3) { /* ignore */ }
        E.state = E.freshState();
        E.recompute();
        return { kind: "corrupt", title: "Your save couldn't be loaded", body: `<p>Sorry! Your save and its backup were both unreadable, so you're starting a fresh colony.</p>
          <p class="muted">A copy of the damaged save was kept in this browser's storage under <code>${SAVE_KEY}_corrupt</code>.</p>` };
      }
    }
  }

  Object.assign(E, {
    encodeSave, decodeSave, save, load, SaveError, transferJSON, fromTransferJSON, validate,
    get savingBlocked() { return savingBlocked; },
    set savingBlocked(v) { savingBlocked = v; },
  });

  PI.save = {
    encodeSave, decodeSave, save, load, SaveError, transferJSON, fromTransferJSON, validate,
    get savingBlocked() { return savingBlocked; },
    set savingBlocked(v) { savingBlocked = v; },
  };
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
