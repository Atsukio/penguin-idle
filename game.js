/* Penguin Idle — a cozy penguin idle game.
 * No build step and no dependencies: open index.html or host the folder on GitHub Pages.
 *
 * Structure
 *   1. Constants & data tables   (IDs are save-file keys: rename display names freely, never IDs)
 *   2. State & maths
 *   3. Actions                   (change state, then emit an event on the bus)
 *   4. Feedback (game feel)      (sound, particles, screen shake, scaled by importance tier)
 *   5. Save / load / migration
 *   6. UI                        (structure re-renders on events; a light ticker updates live numbers)
 *   7. Wiring
 */
(() => {
  "use strict";

  // =====================================================================
  // 1. Constants & data
  // =====================================================================

  const SAVE_KEY = "penguinIdleSave_v1";   // storage key never changes; the schema version lives inside the save
  const SAVE_VERSION = 2;
  const COST_GROWTH = 1.15;
  const MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000];
  const FEATHER_BONUS = 0.02;      // per feather ever earned
  const ACH_BONUS = 0.01;          // per achievement
  const FEATHER_SCALE = 1e9;       // lifetime fish needed for the first feather
  const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc", "Vg"];
  const TEXT_SIZES = [1, 1.15, 1.3, 1.5];
  const prefersReducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  let S = null;   // game state, declared before anything that formats numbers

  const BUILDINGS = [
    { id: "chick",   name: "Sleepy Chick",         plural: "Sleepy Chicks",         icon: "🐣", baseCost: 15,     baseFps: 0.1,    desc: "Naps a lot. Sometimes wakes up holding a fish." },
    { id: "fisher",  name: "Scarf-Wrapped Fisher", plural: "Scarf-Wrapped Fishers", icon: "🎣", baseCost: 100,    baseFps: 1,      desc: "Bundled up with a rod in one flipper and a thermos in the other." },
    { id: "drill",   name: "Ice Fishing Hut",      plural: "Ice Fishing Huts",      icon: "🛖", baseCost: 1100,   baseFps: 8,      desc: "A little hut over a hole in the ice, with a tiny wood stove." },
    { id: "igloo",   name: "Cocoa Igloo",          plural: "Cocoa Igloos",          icon: "☕", baseCost: 12000,  baseFps: 47,     desc: "Whole families fishing together between mugs of cocoa." },
    { id: "krill",   name: "Krill Garden",         plural: "Krill Gardens",         icon: "🦐", baseCost: 130000, baseFps: 260,    desc: "Lovingly tended rows of krill. The fish come for dinner." },
    { id: "trawler", name: "Lantern Boat",         plural: "Lantern Boats",         icon: "⛵", baseCost: 1.4e6,  baseFps: 1400,   desc: "Glowing paper lanterns draw the fish in on long winter nights." },
    { id: "orca",    name: "Friendly Orca Ferry",  plural: "Friendly Orca Ferries", icon: "🐋", baseCost: 2e7,    baseFps: 7800,   desc: "The orcas herd fish over in exchange for belly rubs." },
    { id: "aurora",  name: "Aurora Observatory",   plural: "Aurora Observatories",  icon: "🌌", baseCost: 3.3e8,  baseFps: 44000,  desc: "Fish drift up toward the pretty lights. Penguins drift off to sleep." },
    { id: "factory", name: "Net-Knitting Circle",  plural: "Net-Knitting Circles",  icon: "🧶", baseCost: 5.1e9,  baseFps: 260000, desc: "Grandmas knitting fishing nets by the fire. Very fast grandmas." },
    { id: "rocket",  name: "Hot-Air Balloon",      plural: "Hot-Air Balloons",      icon: "🎈", baseCost: 7.5e10, baseFps: 1.6e6,  desc: "Penguins can't fly, but balloons can, and they make excellent fishing perches." },
    { id: "portal",  name: "Snow Globe Sea",       plural: "Snow Globe Seas",       icon: "🔮", baseCost: 1e12,   baseFps: 1e7,    desc: "Shake it gently and fish tumble out." },
    { id: "time",    name: "Hibernation Clock",    plural: "Hibernation Clocks",    icon: "🕰️", baseCost: 1.4e13, baseFps: 6.5e7,  desc: "Catches fish from tomorrow's dreams." },
  ];
  const B_BY_ID = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));

  // Building upgrades: each doubles that building's output
  const TIER_REQS  = [1, 5, 25, 50, 100, 150, 200];
  const TIER_COSTS = [10, 50, 500, 5e4, 5e6, 5e8, 5e10];
  const TIER_ADJ   = ["Cozier", "Snugger", "Toasty", "Hand-Knitted", "Heirloom", "Legendary", "Starlit"];

  const UPGRADES = [];
  BUILDINGS.forEach(b => {
    TIER_REQS.forEach((req, i) => {
      UPGRADES.push({
        id: `${b.id}_${i}`, icon: b.icon,
        name: `${TIER_ADJ[i]} ${b.plural}`,
        desc: `${b.plural} are twice as efficient.`,
        cost: b.baseCost * TIER_COSTS[i],
        unlocked: s => s.buildings[b.id] >= req,
        apply: m => { m.building[b.id] *= 2; },
      });
    });
  });

  const CLICK_UPS = [
    { req: 1,   cost: 100,  name: "Mitten Warmers",     desc: "Patting the penguin is twice as effective." },
    { req: 1,   cost: 500,  name: "Woolly Flippers",    desc: "Patting the penguin is twice as effective." },
    { req: 10,  cost: 1e4,  name: "Belly Slide",        desc: "Patting the penguin is twice as effective." },
    { req: 25,  cost: 1e5,  name: "Fish Sense",         desc: "Each pat also catches 1% of your fish per second." },
    { req: 50,  cost: 1e7,  name: "Deep Dive",          desc: "Each pat also catches 1% of your fish per second." },
    { req: 100, cost: 1e9,  name: "Grandma's Recipe",   desc: "Each pat also catches 1% of your fish per second." },
    { req: 150, cost: 1e11, name: "Tidal Wiggle",       desc: "Each pat also catches 1% of your fish per second." },
    { req: 200, cost: 1e13, name: "Snowball Flurry",    desc: "Each pat also catches 1% of your fish per second." },
  ];
  CLICK_UPS.forEach((u, i) => {
    UPGRADES.push({
      id: `click_${i}`, icon: "🧤", name: u.name, desc: u.desc, cost: u.cost,
      unlocked: s => s.buildings.chick >= u.req || (i < 3 && s.stats.clicks >= 20 * (i + 1)),
      apply: i < 3 ? m => { m.click *= 2; } : m => { m.clickFps += 0.01; },
    });
  });

  const GLOBAL_UPS = [
    { at: 5e4,  cost: 9.9e4,  name: "Fish Oil Lanterns",   pct: 5 },
    { at: 5e5,  cost: 9.9e5,  name: "Woolly Socks",        pct: 5 },
    { at: 5e6,  cost: 9.9e6,  name: "Warm Burrows",        pct: 10 },
    { at: 5e7,  cost: 9.9e7,  name: "Colony Sing-Along",   pct: 10 },
    { at: 5e8,  cost: 9.9e8,  name: "Huddle Heaters",      pct: 15 },
    { at: 5e9,  cost: 9.9e9,  name: "Cocoa Supply Line",   pct: 15 },
    { at: 5e10, cost: 9.9e10, name: "Penguin Book Club",   pct: 20 },
    { at: 5e11, cost: 9.9e11, name: "Fireside Stories",    pct: 20 },
    { at: 5e12, cost: 9.9e12, name: "Ocean Pen-Pals",      pct: 25 },
    { at: 5e13, cost: 9.9e13, name: "Planet-Wide Huddle",  pct: 25 },
  ];
  GLOBAL_UPS.forEach((u, i) => {
    UPGRADES.push({
      id: `global_${i}`, icon: "🐟", name: u.name, desc: `All fish production +${u.pct}%.`, cost: u.cost,
      unlocked: s => s.runFish >= u.at,
      apply: m => { m.global *= 1 + u.pct / 100; },
    });
  });

  [["Shiny Lure", 7.7e5], ["Golden Hook", 7.7e8], ["Sunbeam Net", 7.7e11]].forEach(([name, cost], i) => {
    UPGRADES.push({
      id: `gold_${i}`, icon: "✨", name, cost,
      desc: "Golden fish appear 15% more often and stay a little longer.",
      unlocked: s => s.stats.goldenClicks >= [1, 7, 27][i],
      apply: m => { m.goldenFreq *= 1.15; m.goldenDur *= 1.1; },
    });
  });
  const UP_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

  const HERITAGE = [
    { id: "headstart", name: "Warm Welcome",        cost: 1,   desc: "Start every migration with 5 Sleepy Chicks and 2 Scarf-Wrapped Fishers." },
    { id: "flippers",  name: "Grandma's Mittens",   cost: 3,   desc: "Patting the penguin is 3× stronger, forever." },
    { id: "nest",      name: "Nest Egg",            cost: 5,   desc: "Start every migration with 10,000 fish." },
    { id: "offline1",  name: "Sweet Dreams",        cost: 10,  desc: "While you're away, the colony fishes at 50% instead of 25%." },
    { id: "golden",    name: "Golden Instinct",     cost: 15,  desc: "Golden fish appear twice as often." },
    { id: "autoclick", name: "Chick Helpers",       cost: 20,  desc: "Chicks pat the big penguin for you, 5 times per second." },
    { id: "cheaper",   name: "Hand-Me-Downs",       cost: 30,  desc: "All colony members are 10% cheaper." },
    { id: "offline2",  name: "Deep Hibernation",    cost: 50,  desc: "While you're away, the colony fishes at 100%, for up to 72 hours instead of 24.", needs: "offline1" },
    { id: "memory",    name: "Family Recipes",      cost: 75,  desc: "Keep the first 3 tiers of colony upgrades when you migrate." },
    { id: "frenzy",    name: "Bottomless Cocoa",    cost: 120, desc: "Golden fish effects last twice as long." },
    { id: "emperor",   name: "Emperor's Blessing",  cost: 250, desc: "Each feather boosts production by 3% instead of 2%." },
  ];
  const H_BY_ID = Object.fromEntries(HERITAGE.map(h => [h.id, h]));

  const ACHIEVEMENTS = [];
  const ach = (id, name, desc, check) => ACHIEVEMENTS.push({ id, name, desc, check });
  [[1, "First Catch"], [100, "Snack Time"], [1e4, "Full Pantry"], [1e6, "Millionfish"], [1e9, "Billion Bellies"],
   [1e12, "Trillion Tails"], [1e15, "Ocean of Plenty"], [1e18, "Fish Singularity"]].forEach(([n, name]) =>
    ach(`fish_${n}`, name, `Catch ${fmt(n)} fish in total.`, s => s.lifetimeFish >= n));
  [[1, "Hatching"], [10, "Huddling"], [100, "Waddling"], [1e3, "Thriving"], [1e5, "Bustling"], [1e7, "Unstoppable"], [1e9, "Fish Blizzard"]].forEach(([n, name]) =>
    ach(`fps_${n}`, name, `Reach ${fmt(n)} fish per second.`, () => fishPerSecond(false) >= n));
  [[1, "Gentle Pat"], [100, "Head Scratches"], [1000, "Best Friends"], [10000, "Inseparable"]].forEach(([n, name]) =>
    ach(`click_${n}`, name, `Pat the penguin ${fmt(n)} times.`, s => s.stats.clicks >= n));
  BUILDINGS.forEach(b => {
    [[1, ""], [50, "A Village of "], [100, "A Kingdom of "]].forEach(([n, pre]) =>
      ach(`b_${b.id}_${n}`, n === 1 ? `First ${b.name}` : `${pre}${b.plural}`, `Own ${n} ${n > 1 ? b.plural : b.name}.`,
        s => s.buildings[b.id] >= n));
  });
  [[1, "Shiny!"], [7, "Lucky Penguin"], [27, "Gold Rush"], [77, "Sunbeam Flipper"]].forEach(([n, name]) =>
    ach(`gold_${n}`, name, `Catch ${n} golden fish.`, s => s.stats.goldenClicks >= n));
  [[1, "The Long Walk"], [5, "Seasoned Traveller"], [25, "Eternal March"]].forEach(([n, name]) =>
    ach(`mig_${n}`, name, `Migrate ${n} time${n > 1 ? "s" : ""}.`, s => s.migrations >= n));
  ach("idle", "Penguin Nap", "Come back after more than an hour away.", s => s.stats.longestAway >= 3600);
  ach("allb", "The Whole Family", "Own at least one of every colony member.", s => BUILDINGS.every(b => s.buildings[b.id] > 0));

  // =====================================================================
  // 2. State & maths
  // =====================================================================

  function defaultSettings() {
    return {
      particles: true, scientific: false,
      sound: true, volume: 0.5, ambience: false,
      shake: 0.6, reduceMotion: prefersReducedMotion, textSize: 1,
    };
  }

  function freshState() {
    return {
      fish: 0,
      runFish: 0,
      lifetimeFish: 0,
      buildings: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])),
      upgrades: [],
      achievements: [],
      feathersEarned: 0,
      feathersSpent: 0,
      heritage: [],
      migrations: 0,
      buffs: [],
      stats: { clicks: 0, clickFish: 0, goldenClicks: 0, longestAway: 0, startedAt: Date.now(), runStartedAt: Date.now() },
      settings: defaultSettings(),
      lastTick: Date.now(),
    };
  }

  S = freshState();
  let M = null;
  let buyAmount = 1;

  const has = id => S.upgrades.includes(id);
  const hasH = id => S.heritage.includes(id);
  const milestonesReached = n => MILESTONES.filter(x => n >= x).length;

  function recompute() {
    const m = {
      building: Object.fromEntries(BUILDINGS.map(b => [b.id, 1])),
      click: 1, clickFps: 0, global: 1, goldenFreq: 1, goldenDur: 1,
    };
    S.upgrades.forEach(id => UP_BY_ID[id] && UP_BY_ID[id].apply(m));
    BUILDINGS.forEach(b => { m.building[b.id] *= Math.pow(2, milestonesReached(S.buildings[b.id])); });
    if (hasH("flippers")) m.click *= 3;
    if (hasH("golden")) m.goldenFreq *= 2;
    if (hasH("frenzy")) m.goldenDur *= 2;
    m.feather = 1 + S.feathersEarned * (hasH("emperor") ? 0.03 : FEATHER_BONUS);
    m.ach = 1 + S.achievements.length * ACH_BONUS;
    M = m;
  }

  function buffMult(type) {
    const now = Date.now();
    return S.buffs.filter(b => b.type === type && b.until > now).reduce((a, b) => a * b.mult, 1);
  }
  const buildingFps = id => B_BY_ID[id].baseFps * M.building[id] * M.global * M.feather * M.ach;

  function fishPerSecond(withBuffs = true) {
    let total = 0;
    BUILDINGS.forEach(b => { total += S.buildings[b.id] * buildingFps(b.id); });
    return withBuffs ? total * buffMult("prod") : total;
  }

  const clickPower = () => (M.click + fishPerSecond() * M.clickFps) * M.feather * buffMult("click");

  const costMult = () => (hasH("cheaper") ? 0.9 : 1);
  function costOf(b, owned, n) {
    const first = b.baseCost * Math.pow(COST_GROWTH, owned) * costMult();
    return first * (Math.pow(COST_GROWTH, n) - 1) / (COST_GROWTH - 1);
  }
  function maxAffordable(b) {
    const first = b.baseCost * Math.pow(COST_GROWTH, S.buildings[b.id]) * costMult();
    return Math.max(0, Math.floor(Math.log(S.fish * (COST_GROWTH - 1) / first + 1) / Math.log(COST_GROWTH)));
  }
  const buyCount = b => (buyAmount === "max" ? Math.max(1, maxAffordable(b)) : buyAmount);

  const featherTotalFor = lifetime => Math.floor(Math.sqrt(lifetime / FEATHER_SCALE));
  const pendingFeathers = () => Math.max(0, featherTotalFor(S.lifetimeFish) - S.feathersEarned);

  // ---------- Tiny event bus: gameplay emits, UI and feedback listen ----------
  const bus = {
    handlers: {},
    on(evt, fn) { (this.handlers[evt] = this.handlers[evt] || []).push(fn); },
    emit(evt, data) { (this.handlers[evt] || []).forEach(fn => fn(data)); },
  };

  // =====================================================================
  // 3. Actions
  // =====================================================================

  function gain(n) { S.fish += n; S.runFish += n; S.lifetimeFish += n; }

  function clickPenguin(pos, auto = false) {
    const p = clickPower();
    gain(p);
    if (auto) return;
    S.stats.clicks++;
    S.stats.clickFish += p;
    bus.emit("click", { amount: p, x: pos.x, y: pos.y });
  }

  function buyBuilding(id, origin) {
    const b = B_BY_ID[id];
    const n = buyCount(b);
    const cost = costOf(b, S.buildings[id], n);
    if (S.fish < cost) return;
    const before = milestonesReached(S.buildings[id]);
    S.fish -= cost;
    S.buildings[id] += n;
    const gained = milestonesReached(S.buildings[id]) - before;
    recompute();
    bus.emit("structure");
    bus.emit("buyBuilding", { id, origin });
    if (gained > 0) bus.emit("milestone", { b, mult: 2 ** gained, origin });
  }

  function buyUpgrade(id, origin) {
    const u = UP_BY_ID[id];
    if (!u || has(id) || S.fish < u.cost) return;
    S.fish -= u.cost;
    S.upgrades.push(id);
    recompute();
    bus.emit("structure");
    bus.emit("buyUpgrade", { u, origin });
  }

  function buyHeritage(id, origin) {
    const h = H_BY_ID[id];
    if (hasH(id) || (h.needs && !hasH(h.needs))) return;
    if (S.feathersEarned - S.feathersSpent < h.cost) return;
    S.feathersSpent += h.cost;
    S.heritage.push(id);
    recompute();
    bus.emit("structure");
    bus.emit("buyHeritage", { h, origin });
  }

  function migrate() {
    const gainF = pendingFeathers();
    if (gainF < 1) return;
    openModal({
      title: "Set off on the Great Migration?",
      body: `<p>The colony will pack up and waddle to fresh ice, earning <b>🪶 ${fmt(gainF)}</b> Emperor Feathers
             (+${fmt(gainF * (hasH("emperor") ? 3 : 2))}% production, forever).</p>
             <p>Your fish, colony and upgrades stay behind.</p>`,
      actions: [
        { label: "Not yet", cancel: true },
        { label: "Let's go!", primary: true, onClick: () => {
          S.feathersEarned += gainF;
          S.migrations++;
          const keep = hasH("memory") ? S.upgrades.filter(id => /^[a-z]+_[012]$/.test(id) && B_BY_ID[id.split("_")[0]]) : [];
          S.fish = hasH("nest") ? 1e4 : 0;
          S.runFish = 0;
          S.buildings = Object.fromEntries(BUILDINGS.map(b => [b.id, 0]));
          if (hasH("headstart")) { S.buildings.chick = 5; S.buildings.fisher = 2; }
          S.upgrades = keep;
          S.buffs = [];
          S.stats.runStartedAt = Date.now();
          recompute();
          bus.emit("structure");
          bus.emit("migrate", { feathers: S.feathersEarned });
          save();
        } },
      ],
    });
  }

  // ---------- Golden fish ----------
  let nextGolden = Date.now() + randBetween(60, 150) * 1000;
  const scheduleGolden = () => { nextGolden = Date.now() + randBetween(90, 240) * 1000 / M.goldenFreq; };

  function spawnGolden() {
    const el = document.createElement("button");
    el.className = "golden-fish";
    el.textContent = "🐟";
    el.setAttribute("aria-label", "Golden fish! Catch it");
    const dur = 12 * M.goldenDur;
    el.style.animationDuration = `${dur}s, .7s`;
    el.style.left = `${randBetween(5, 85)}vw`;
    el.style.top = `${randBetween(15, 80)}vh`;
    el.addEventListener("click", e => { el.remove(); goldenEffect(pointFrom(e, el)); });
    $("goldenLayer").appendChild(el);
    setTimeout(() => el.remove(), dur * 1000);
    bus.emit("goldenSpawn");
    scheduleGolden();
  }

  function goldenEffect(pos) {
    S.stats.goldenClicks++;
    const dMult = hasH("frenzy") ? 2 : 1;
    const roll = Math.random();
    let msg;
    if (roll < 0.45) {
      const amount = Math.min(S.fish * 0.15, fishPerSecond(false) * 900) + 13;
      gain(amount);
      msg = `<b>Lucky Catch!</b> +${fmt(amount)} fish`;
    } else if (roll < 0.85) {
      S.buffs.push({ type: "prod", name: "Cocoa Rush", mult: 7, until: Date.now() + 77e3 * dMult });
      msg = `<b>Cocoa Rush!</b> Everyone's warmed up: production ×7 for ${77 * dMult}s`;
    } else {
      S.buffs.push({ type: "click", name: "Flipper Flurry", mult: 777, until: Date.now() + 13e3 * dMult });
      msg = `<b>Flipper Flurry!</b> Pats are ×777 for ${13 * dMult}s`;
    }
    bus.emit("golden", { msg, ...pos });
    bus.emit("buffs");
  }

  function checkAchievements() {
    const fresh = ACHIEVEMENTS.filter(a => !S.achievements.includes(a.id) && a.check(S));
    if (!fresh.length) return;
    fresh.forEach(a => S.achievements.push(a.id));
    recompute();
    bus.emit("structure");
    fresh.forEach(a => bus.emit("achievement", a));
  }

  // =====================================================================
  // 4. Feedback (game feel)
  //    Every event maps to a tier so juice stays proportional:
  //      small  — pats, colony purchases          (sound, number pop, a few bits)
  //      medium — upgrades, milestones, heirlooms (chime, sparkle burst, a light shake)
  //      large  — golden fish, migration          (fanfare, big burst, glow ring, stronger shake)
  //    Juice is always brief and returns to rest. No white flashes (photosensitivity).
  // =====================================================================

  const TIERS = {
    small:  { bits: 2,  trauma: 0,    ring: false },
    medium: { bits: 8,  trauma: 0.22, ring: false },
    large:  { bits: 22, trauma: 0.5,  ring: true },
  };
  const motionOK = () => !S.settings.reduceMotion;

  const Shake = {
    trauma: 0, t: 0, running: false, last: 0,
    add(amount) {
      if (!motionOK() || S.settings.shake <= 0 || amount <= 0) return;
      this.trauma = Math.min(1, this.trauma + amount);   // hits add; they don't reset
      if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(ts => this.step(ts)); }
    },
    step(ts) {
      const dt = Math.min(0.05, (ts - this.last) / 1000);
      this.last = ts;
      this.trauma = Math.max(0, this.trauma - 1.4 * dt);  // linear decay, so it always ends
      const layout = $("layout");
      if (this.trauma <= 0 || !motionOK()) { layout.style.transform = ""; this.running = false; this.trauma = 0; return; }
      this.t += dt * 30;
      const s = this.trauma * this.trauma * S.settings.shake;   // quadratic: soft at low trauma
      // Layered sines, not random jitter, so it reads as a sway rather than a buzz. Moves the visual only.
      const ox = 7 * s * (0.6 * Math.sin(this.t * 1.7) + 0.4 * Math.sin(this.t * 3.1));
      const oy = 5 * s * (0.6 * Math.sin(this.t * 2.3 + 1) + 0.4 * Math.sin(this.t * 4.3));
      const rot = 0.4 * s * Math.sin(this.t * 1.1);
      layout.style.transform = `translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px) rotate(${rot.toFixed(3)}deg)`;
      requestAnimationFrame(t2 => this.step(t2));
    },
  };

  // Pooled particle elements: reused instead of created and thrown away on every pat
  const particlePool = [];
  function spawnParticle(cls, text, x, y, vars, life) {
    const el = particlePool.pop() || document.createElement("div");
    el.className = `particle ${cls}`;
    el.textContent = text;
    el.style.setProperty("--x", `${x}px`);
    el.style.setProperty("--y", `${y}px`);
    Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
    $("fxLayer").appendChild(el);
    setTimeout(() => { el.remove(); if (particlePool.length < 80) particlePool.push(el); }, life);
  }

  function numberPop(text, x, y) {
    if (!S.settings.particles) return;
    spawnParticle("num", text, x - 12, y - 24, { "--dx": `${randBetween(-30, 30)}px` }, 1000);
  }

  function burst(x, y, count, chars) {
    if (!S.settings.particles || !motionOK() || !count) return;
    for (let i = 0; i < count; i++) {
      const a = randBetween(0, Math.PI * 2), d = randBetween(40, 110);
      spawnParticle("bit", chars[i % chars.length], x - 8, y - 8, {
        "--dx": `${Math.cos(a) * d}px`, "--dy": `${Math.sin(a) * d - 20}px`, "--rot": `${randBetween(-180, 180)}deg`,
      }, 800);
    }
  }

  function glowRing(x, y) {
    if (!motionOK()) return;
    const el = document.createElement("div");
    el.className = "glow-ring";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    $("fxLayer").appendChild(el);
    setTimeout(() => el.remove(), 750);
  }

  function feedback(tier, pos, { sound, chars = ["✨", "❄️", "💛"] } = {}) {
    const t = TIERS[tier];
    if (sound) Sound.play(sound);
    if (pos) {
      burst(pos.x, pos.y, t.bits, chars);
      if (t.ring) glowRing(pos.x, pos.y);
    }
    Shake.add(t.trauma);
  }

  // ---------- Soft synthesized sounds (Web Audio, no files) ----------
  const Sound = {
    ctx: null, master: null, amb: null, noise: null, lastPop: 0,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      }
      this.master.gain.value = S.settings.volume;
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    },
    tone(freq, when, dur, type = "sine", vol = 0.12) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g).connect(this.master);
      o.start(when);
      o.stop(when + dur + 0.05);
    },
    play(name) {
      if (!S.settings.sound || S.settings.volume <= 0) return;
      const c = this.ensure();
      if (!c) return;
      const t = c.currentTime + 0.01;
      const P = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51]; // pentatonic-ish, always consonant
      switch (name) {
        case "pop": {
          const now = performance.now();
          if (now - this.lastPop < 70) return;   // fast clicking shouldn't become a drone
          this.lastPop = now;
          this.tone(P[Math.floor(Math.random() * 5)], t, 0.14, "sine", 0.1);
          break;
        }
        case "buy":     this.tone(659.25, t, 0.12, "triangle", 0.08); this.tone(987.77, t + 0.06, 0.2, "triangle", 0.07); break;
        case "chime":   [P[0], P[2], P[4]].forEach((f, i) => this.tone(f, t + i * 0.07, 0.4, "triangle", 0.08)); break;
        case "memory":  [P[5], P[7], P[6]].forEach((f, i) => this.tone(f, t + i * 0.11, 0.6, "sine", 0.07)); break;
        case "sparkle": [P[4], P[6], P[7]].forEach((f, i) => this.tone(f, t + i * 0.05, 0.3, "sine", 0.05)); break;
        case "fanfare": [P[0], P[2], P[3], P[5], P[7]].forEach((f, i) => this.tone(f, t + i * 0.08, 0.7, "sine", 0.09)); this.tone(261.63, t, 1.2, "triangle", 0.05); break;
        case "migrate": [261.63, 329.63, 392, 523.25].forEach((f, i) => this.tone(f, t + i * 0.16, 1.8, "sine", 0.07)); break;
        case "tick":    this.tone(880, t, 0.08, "sine", 0.05); break;
      }
    },
    setVolume() { if (this.master) this.master.gain.value = S.settings.volume; },
    noiseBuffer(seconds, brown) {
      const c = this.ctx, len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      return buf;
    },
    crackle(when) {
      const c = this.ctx;
      if (!this.noise) this.noise = this.noiseBuffer(0.05, false);
      const src = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noise;
      hp.type = "highpass"; hp.frequency.value = 1500 + Math.random() * 2000;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.06, when + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
      src.connect(hp).connect(g).connect(this.master);
      src.start(when);
      src.stop(when + 0.06);
    },
    setAmbience(on) {
      if (on && !this.amb) {
        const c = this.ensure();
        if (!c) return;
        const src = c.createBufferSource();
        src.buffer = this.noiseBuffer(4, true);
        src.loop = true;
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 450;
        const g = c.createGain(); g.gain.value = 0.22;
        const lfo = c.createOscillator(), lfoG = c.createGain();   // slow swell, like wind outside
        lfo.frequency.value = 0.07; lfoG.gain.value = 0.1;
        lfo.connect(lfoG).connect(g.gain);
        src.connect(lp).connect(g).connect(this.master);
        src.start(); lfo.start();
        const timer = setInterval(() => {
          if (document.hidden || c.state !== "running") return;
          const n = Math.random() < 0.5 ? 1 : 2 + Math.floor(Math.random() * 3);
          for (let k = 0; k < n; k++) this.crackle(c.currentTime + Math.random() * 0.35);
        }, 420);
        this.amb = { src, lfo, g, timer };
      } else if (!on && this.amb) {
        this.amb.src.stop(); this.amb.lfo.stop(); this.amb.g.disconnect(); clearInterval(this.amb.timer);
        this.amb = null;
      }
    },
  };

  // Feedback wiring: one place that decides which tier each event gets
  bus.on("click", d => {
    Sound.play("pop");
    numberPop(`+${fmt(d.amount)}`, d.x, d.y);
    if (Math.random() < 0.35) burst(d.x, d.y, 1, ["🐟"]);
    const peng = $("bigPenguin");
    peng.classList.remove("pop"); void peng.offsetWidth; peng.classList.add("pop");
  });
  bus.on("buyBuilding", d => {
    Sound.play("buy");
    const row = els[d.id] && els[d.id].root;
    if (row) { row.classList.remove("pop"); void row.offsetWidth; row.classList.add("pop"); }
  });
  bus.on("milestone", d => {
    feedback("medium", d.origin, { sound: "chime", chars: [d.b.icon, "✨", "💛"] });
    toast(`<b>Milestone!</b> ${d.b.plural} now catch ${d.mult === 2 ? "twice" : `${d.mult}×`} as many fish.`);
  });
  bus.on("buyUpgrade", d => feedback("medium", d.origin, { sound: "sparkle", chars: [d.u.icon, "✨"] }));
  bus.on("buyHeritage", d => feedback("medium", d.origin, { sound: "chime", chars: ["🪶", "✨"] }));
  bus.on("golden", d => { feedback("large", d, { sound: "fanfare", chars: ["🐟", "✨", "💛", "⭐"] }); toast(d.msg); });
  bus.on("achievement", a => { Sound.play("memory"); toast(`📔 <b>${a.name}</b><br>${a.desc}`); });
  bus.on("migrate", d => {
    feedback("large", { x: innerWidth / 2, y: innerHeight / 2 }, { sound: "migrate", chars: ["🐧", "❄️", "🪶"] });
    toast(`<b>Welcome to your new home!</b> The colony settles in with 🪶 ${fmt(d.feathers)} feathers.`);
  });

  // =====================================================================
  // 5. Save / load / migration
  // =====================================================================

  // Each entry upgrades a save from version N to N+1. Never delete one: old saves walk the whole chain.
  const MIGRATIONS = {
    0: d => d,  // saves made before versioning already have the v1 shape
    1: d => {   // v2: added sound, ambience, shake, reduce-motion and text-size settings
      d.settings = Object.assign(defaultSettings(), d.settings || {});
      return d;
    },
  };

  class SaveError extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }
  }

  let savingBlocked = false;   // set when the stored save is from a newer game version, so we never clobber it

  function save() {
    if (savingBlocked) return;
    try {
      S.lastTick = Date.now();
      const prev = localStorage.getItem(SAVE_KEY);
      if (prev) localStorage.setItem(SAVE_KEY + "_bak", prev);   // keep the last good save
      localStorage.setItem(SAVE_KEY, encodeSave());
    } catch (e) { /* storage unavailable (private mode, quota) */ }
  }

  function hash(str) {   // FNV-1a: detects truncated or edited save text (not anti-cheat)
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }

  function encodeSave() {
    const { buffs, ...data } = S;   // buffs are short-lived; don't persist them
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify({ ...data, version: SAVE_VERSION }))));
    return `${b64}.${hash(b64)}`;
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
    try { data = JSON.parse(decodeURIComponent(escape(atob(b64)))); }
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

  const num = v => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0);
  const idList = (v, table) => [...new Set(Array.isArray(v) ? v : [])].filter(id => table[id]);

  // Rebuild a clean state from plain data, checking every field rather than trusting the file
  function validate(data) {
    const s = freshState();
    ["fish", "runFish", "lifetimeFish", "feathersEarned", "feathersSpent", "migrations"].forEach(k => { s[k] = num(data[k]); });
    s.feathersSpent = Math.min(s.feathersSpent, s.feathersEarned);
    BUILDINGS.forEach(b => { s.buildings[b.id] = Math.floor(num(data.buildings && data.buildings[b.id])); });
    s.upgrades = idList(data.upgrades, UP_BY_ID);
    s.heritage = idList(data.heritage, H_BY_ID);
    const achIds = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, true]));
    s.achievements = idList(data.achievements, achIds);
    const st = data.stats || {};
    Object.keys(s.stats).forEach(k => { if (num(st[k]) > 0) s.stats[k] = num(st[k]); });
    const ds = defaultSettings(), inSet = data.settings || {};
    Object.keys(ds).forEach(k => { if (typeof inSet[k] === typeof ds[k]) s.settings[k] = inSet[k]; });
    s.settings.volume = Math.min(1, Math.max(0, s.settings.volume));
    s.settings.shake = Math.min(1, Math.max(0, s.settings.shake));
    if (!TEXT_SIZES.includes(s.settings.textSize)) s.settings.textSize = 1;
    s.lastTick = num(data.lastTick) || Date.now();
    return s;
  }

  // Returns a message to show the player if anything went wrong (fail loudly, never silently)
  function load() {
    let raw = null, bak = null;
    try { raw = localStorage.getItem(SAVE_KEY); bak = localStorage.getItem(SAVE_KEY + "_bak"); } catch (e) { /* ignore */ }
    if (!raw && !bak) return null;
    try {
      S = decodeSave(raw);
      return null;
    } catch (e) {
      if (e.kind === "newer") {
        savingBlocked = true;
        return { title: "This save is from a newer version", body: `<p>${e.message}</p><p class="muted">Nothing will be saved until you refresh, so your progress is safe.</p>` };
      }
      try {
        S = decodeSave(bak);
        return { title: "We restored your backup", body: "<p>Your latest save couldn't be read, so we loaded the backup from a few moments earlier.</p>" };
      } catch (e2) {
        try { localStorage.setItem(SAVE_KEY + "_corrupt", raw || bak); } catch (e3) { /* ignore */ }
        S = freshState();
        return { title: "Your save couldn't be loaded", body: `<p>Sorry! Your save and its backup were both unreadable, so you're starting a fresh colony.</p>
          <p class="muted">A copy of the damaged save was kept in this browser's storage under <code>${SAVE_KEY}_corrupt</code>.</p>` };
      }
    }
  }

  function applyOffline() {
    const away = (Date.now() - S.lastTick) / 1000;
    if (away < 60) return null;
    S.stats.longestAway = Math.max(S.stats.longestAway, away);
    const cap = hasH("offline2") ? 72 * 3600 : 24 * 3600;
    const eff = hasH("offline2") ? 1 : hasH("offline1") ? 0.5 : 0.25;
    const earned = fishPerSecond(false) * Math.min(away, cap) * eff;
    S.lastTick = Date.now();
    if (earned <= 0) return null;
    gain(earned);
    return {
      title: "Welcome home!",
      body: `<p>You were away for <b>${fmtTime(away)}</b>. The colony kept the fire going and fished at ${Math.round(eff * 100)}% pace,
             catching <b>🐟 ${fmt(earned)}</b>.</p>
             ${away > cap ? `<p class="muted">Time away counts for up to ${cap / 3600} hours.</p>` : ""}`,
    };
  }

  // =====================================================================
  // 6. UI
  // =====================================================================

  const $ = id => document.getElementById(id);
  const els = {};
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  const pointFrom = (e, el) => {
    if (e && e.clientX) return { x: e.clientX, y: e.clientY };   // pointer click
    const r = el.getBoundingClientRect();                         // keyboard activation: use the element's centre
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // ---------- Modal stack: top modal owns focus; everything behind is inert ----------
  const modals = [];
  function openModal({ title, body, actions, dismissable = true, danger = false }) {
    const entry = { prevFocus: document.activeElement, dismissable };
    const wrap = document.createElement("div");
    wrap.className = "modal";
    const id = `modal-${Math.random().toString(36).slice(2, 8)}`;
    wrap.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <h2 id="${id}"></h2><div class="modal-body"></div><div class="row end"></div></div>`;
    wrap.querySelector("h2").textContent = title;
    wrap.querySelector(".modal-body").innerHTML = body;
    const row = wrap.querySelector(".row");
    let focusTarget = null;
    actions.forEach(a => {
      const b = document.createElement("button");
      b.className = `btn${a.primary ? " primary" : ""}${a.danger ? " danger" : ""}`;
      b.textContent = a.label;
      b.addEventListener("click", () => { closeModal(entry); a.onClick && a.onClick(); });
      row.appendChild(b);
      // Destructive dialogs focus the safe choice; others focus the main action
      if ((danger && a.cancel) || (!danger && a.primary) || !focusTarget) focusTarget = b;
    });
    entry.wrap = wrap;
    entry.cancel = () => { closeModal(entry); const c = actions.find(a => a.cancel); c && c.onClick && c.onClick(); };
    wrap.addEventListener("click", e => { if (e.target === wrap && entry.dismissable) entry.cancel(); });
    modals.push(entry);
    $("modalRoot").appendChild(wrap);
    syncInert();
    focusTarget && focusTarget.focus();
    hideTooltip();
  }

  function closeModal(entry) {
    const i = modals.indexOf(entry);
    if (i < 0) return;
    modals.splice(i, 1);
    entry.wrap.remove();
    syncInert();
    const top = modals[modals.length - 1];
    const back = top ? top.wrap.querySelector(".btn") : entry.prevFocus;
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  }

  function syncInert() {
    const any = modals.length > 0;
    ["topbar", "layout", "goldenLayer"].forEach(id => { $(id).inert = any; });
    modals.forEach((m, i) => { m.wrap.inert = i !== modals.length - 1; });
  }

  document.addEventListener("keydown", e => {
    const top = modals[modals.length - 1];
    if (!top) return;
    if (e.key === "Escape" && top.dismissable) { e.preventDefault(); top.cancel(); return; }
    if (e.key === "Tab") {   // trap focus inside the dialog
      const f = [...top.wrap.querySelectorAll("button, [href], input, select, textarea")].filter(x => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ---------- Toasts ----------
  function toast(html) {
    const box = $("toasts");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = html;
    box.appendChild(el);
    const dismiss = () => { el.classList.add("out"); setTimeout(() => el.remove(), 350); };
    setTimeout(dismiss, 4500);
    while (box.children.length > 4) box.firstChild.remove();
  }

  // ---------- Tooltips (mouse hover and keyboard focus) ----------
  let tooltipFn = null;
  function attachTooltip(el, fn) {
    el.addEventListener("mouseenter", e => showTooltip(fn, e.clientX, e.clientY));
    el.addEventListener("mouseleave", hideTooltip);
    el.addEventListener("focus", () => {
      if (!el.matches(":focus-visible")) return;
      const r = el.getBoundingClientRect();
      showTooltip(fn, r.right, r.top);
    });
    el.addEventListener("blur", hideTooltip);
  }
  function showTooltip(fn, x, y) {
    if (window.matchMedia("(hover: none)").matches && !document.activeElement.matches(":focus-visible")) return;
    tooltipFn = fn;
    const t = $("tooltip");
    t.innerHTML = fn();
    t.classList.remove("hidden");
    positionTooltip(x, y);
  }
  function positionTooltip(cx, cy) {
    const t = $("tooltip"), r = t.getBoundingClientRect();
    let x = cx + 16, y = cy + 16;
    if (x + r.width > innerWidth - 8) x = cx - r.width - 16;
    if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    t.style.left = `${Math.max(8, x)}px`;
    t.style.top = `${Math.max(8, y)}px`;
  }
  function hideTooltip() { tooltipFn = null; $("tooltip").classList.add("hidden"); }
  document.addEventListener("mousemove", e => { if (tooltipFn) { $("tooltip").innerHTML = tooltipFn(); positionTooltip(e.clientX, e.clientY); } });

  // ---------- Colony list ----------
  function buildBuildingList() {
    const list = $("buildings");
    list.innerHTML = "";
    BUILDINGS.forEach(b => {
      const el = document.createElement("button");
      el.className = "building";
      el.innerHTML = `
        <div class="icon" aria-hidden="true">${b.icon}</div>
        <div>
          <div class="name">${b.name}</div>
          <div class="desc"><span class="b-cost cost"></span> · <span class="b-fps"></span></div>
          <div class="milestone-bar" aria-hidden="true"><div></div></div>
        </div>
        <div class="owned" aria-hidden="true">0</div>`;
      el.addEventListener("click", e => buyBuilding(b.id, pointFrom(e, el)));
      attachTooltip(el, () => buildingTooltip(b));
      list.appendChild(el);
      els[b.id] = {
        root: el, cost: el.querySelector(".b-cost"), fps: el.querySelector(".b-fps"),
        owned: el.querySelector(".owned"), bar: el.querySelector(".milestone-bar > div"),
      };
    });
  }

  function buildingTooltip(b) {
    const n = S.buildings[b.id];
    const next = MILESTONES.find(x => x > n);
    const each = buildingFps(b.id) * buffMult("prod");
    return `<div class="t-name">${b.icon} ${b.name}</div><div>${b.desc}</div><hr>
      <div>Each catches <b>${fmt(each)}</b>/s</div>
      <div>${fmt(n)} owned catch <b>${fmt(each * n)}</b>/s</div>
      ${next ? `<div class="t-cost">At ${next} owned: output ×2</div>` : ""}`;
  }

  // Event-driven: owned counts, rates and milestone bars change only on purchases, buffs and resets
  function refreshBuildings() {
    BUILDINGS.forEach(b => {
      const e = els[b.id], owned = S.buildings[b.id];
      setText(e.owned, String(owned));
      setText(e.fps, `${fmt(buildingFps(b.id) * buffMult("prod"))}/s each`);
      const prev = [0, ...MILESTONES].filter(x => x <= owned).pop();
      const next = MILESTONES.find(x => x > owned);
      e.bar.style.width = next ? `${((owned - prev) / (next - prev)) * 100}%` : "100%";
    });
  }

  // Ticker: costs and affordability depend on the fish count, which changes continuously
  function tickBuildings() {
    let revealNext = true;
    BUILDINGS.forEach((b, i) => {
      const e = els[b.id], owned = S.buildings[b.id];
      const visible = owned > 0 || i === 0 || S.buildings[BUILDINGS[i - 1].id] > 0 || S.runFish >= b.baseCost * 0.5;
      e.root.classList.toggle("hidden", !visible && !revealNext);
      e.root.classList.toggle("locked", !visible);
      e.root.disabled = !visible;
      if (!visible) revealNext = false;
      const n = buyCount(b);
      const cost = costOf(b, owned, n);
      setText(e.cost, `${n > 1 ? `${n}× ` : ""}🐟 ${fmt(cost)}`);
      const can = S.fish >= cost;
      e.root.classList.toggle("affordable", can);
      e.root.setAttribute("aria-label", visible
        ? `Buy ${n} ${n > 1 ? b.plural : b.name} for ${fmt(cost)} fish${can ? "" : " (not enough fish)"}. You own ${owned}.`
        : "Undiscovered colony member");
    });
  }

  // ---------- Upgrades ----------
  let lastUpgradeKey = "";
  function tickUpgrades() {
    const ups = UPGRADES.filter(u => !has(u.id) && u.unlocked(S)).sort((a, b) => a.cost - b.cost);
    const key = ups.map(u => u.id).join(",");
    const grid = $("upgrades");
    if (key !== lastUpgradeKey) {
      const hadFocus = grid.contains(document.activeElement);
      lastUpgradeKey = key;
      grid.innerHTML = "";
      ups.forEach(u => {
        const el = document.createElement("button");
        el.className = "upgrade";
        el.dataset.id = u.id;
        el.textContent = u.icon;
        el.setAttribute("aria-label", `${u.name}: ${u.desc} Costs ${fmt(u.cost)} fish.`);
        el.addEventListener("click", e => buyUpgrade(u.id, pointFrom(e, el)));
        attachTooltip(el, () => `<div class="t-name">${u.name}</div><div>${u.desc}</div><div class="t-cost">🐟 ${fmt(u.cost)}</div>`);
        grid.appendChild(el);
      });
      $("noUpgrades").classList.toggle("hidden", ups.length > 0);
      if (hadFocus) (grid.firstElementChild || $("buildings").querySelector(".building:not(.hidden)")).focus({ preventScroll: true });
    }
    grid.querySelectorAll(".upgrade").forEach(el => el.classList.toggle("affordable", S.fish >= UP_BY_ID[el.dataset.id].cost));
  }

  // ---------- Migration / heirlooms ----------
  function buildHeritage() {
    const list = $("heritage");
    list.innerHTML = "";
    HERITAGE.forEach(h => {
      const el = document.createElement("button");
      el.className = "heritage";
      el.dataset.id = h.id;
      el.innerHTML = `<div class="name">${h.name}</div><div class="desc">${h.desc}</div><div class="cost"></div>`;
      el.addEventListener("click", e => buyHeritage(h.id, pointFrom(e, el)));
      list.appendChild(el);
    });
  }
  function tickHeritage() {
    const spendable = S.feathersEarned - S.feathersSpent;
    $("heritage").querySelectorAll(".heritage").forEach(el => {
      const h = H_BY_ID[el.dataset.id];
      const owned = hasH(h.id);
      const blocked = h.needs && !hasH(h.needs);
      el.classList.toggle("owned", owned);
      el.classList.toggle("affordable", !owned && !blocked && spendable >= h.cost);
      setText(el.querySelector(".cost"), owned ? "✔ Yours" : blocked ? `🔒 Needs ${H_BY_ID[h.needs].name}` : `🪶 ${h.cost}`);
    });
    setText($("featherSpendable"), fmt(spendable));
    const pend = pendingFeathers();
    setText($("pendingFeathers"), fmt(pend));
    setText($("nextFeather"), fmt(Math.pow(featherTotalFor(S.lifetimeFish) + 1, 2) * FEATHER_SCALE));
    $("migrateBtn").disabled = pend < 1;
  }

  // ---------- Memories (achievements) ----------
  function renderAchievements() {
    $("achievements").innerHTML = ACHIEVEMENTS.map(a => {
      const done = S.achievements.includes(a.id);
      return `<div class="ach ${done ? "done" : ""}"><div class="name">${done ? "📔" : "🔒"} ${a.name}</div><div class="desc">${a.desc}</div></div>`;
    }).join("");
    setText($("achCount"), `${S.achievements.length}/${ACHIEVEMENTS.length}`);
  }

  function renderStats() {
    const rows = [
      ["Fish caught this migration", fmt(S.runFish)],
      ["Fish caught all time", fmt(S.lifetimeFish)],
      ["Fish from patting", fmt(S.stats.clickFish)],
      ["Penguin pats", fmt(S.stats.clicks)],
      ["Golden fish caught", fmt(S.stats.goldenClicks)],
      ["Colony members", fmt(Object.values(S.buildings).reduce((a, b) => a + b, 0))],
      ["Upgrades owned", `${S.upgrades.length}`],
      ["Migrations", `${S.migrations}`],
      ["Feather bonus", `+${fmt((M.feather - 1) * 100)}%`],
      ["Memories bonus", `+${fmt((M.ach - 1) * 100)}%`],
      ["This migration started", `${fmtTime((Date.now() - S.stats.runStartedAt) / 1000)} ago`],
      ["Playing since", new Date(S.stats.startedAt).toLocaleDateString()],
    ];
    $("stats").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  }

  function renderBuffs() {
    const now = Date.now();
    const html = S.buffs.filter(b => b.until > now)
      .map(b => `<span class="buff">${b.name} ×${b.mult} · ${Math.ceil((b.until - now) / 1000)}s</span>`).join("");
    if ($("buffs").innerHTML !== html) $("buffs").innerHTML = html;
  }

  // ---------- Colony scene: grows as you build ----------
  const SCENE_PROPS = [
    { id: "fisher",  icon: "🎣", style: "left:4%;bottom:24%" },
    { id: "drill",   icon: "🛖", style: "left:13%;bottom:28%" },
    { id: "igloo",   igloo: true, style: "left:72%;bottom:28%" },
    { id: "krill",   icon: "🦐", style: "left:88%;bottom:10%;font-size:1.2rem" },
    { id: "trawler", icon: "⛵", style: "left:84%;bottom:40%;font-size:1.3rem" },
    { id: "orca",    icon: "🐋", style: "left:62%;bottom:40%;font-size:1.2rem" },
    { id: "factory", icon: "🧶", style: "left:27%;bottom:8%;font-size:1.3rem" },
    { id: "rocket",  icon: "🎈", style: "left:18%;top:22%", float: true },
    { id: "portal",  icon: "🔮", style: "left:64%;bottom:8%;font-size:1.3rem" },
    { id: "time",    icon: "🕰️", style: "left:36%;bottom:30%;font-size:1.3rem" },
  ];

  function buildLights() {
    const colors = ["#e8735a", "#ffd27a", "#a6e3bd", "#a9c8ff"];
    $("lights").innerHTML = Array.from({ length: 16 }, (_, i) =>
      `<span class="bulb" style="background:${colors[i % 4]};box-shadow:0 0 8px ${colors[i % 4]};animation-delay:${(i % 4) * 0.6}s"></span>`).join("");
  }

  let sceneKey = "";
  function rebuildScene() {
    const total = Object.values(S.buildings).reduce((a, b) => a + b, 0);
    const count = Math.min(22, Math.ceil(Math.sqrt(total) * 1.4));
    const present = SCENE_PROPS.filter(p => S.buildings[p.id] > 0).map(p => p.id);
    const key = `${count}|${present.join(",")}|${S.buildings.aurora > 0}|${S.settings.reduceMotion}`;
    if (key === sceneKey) return;
    sceneKey = key;
    $("aurora").classList.toggle("on", S.buildings.aurora > 0);
    $("props").innerHTML = SCENE_PROPS.filter(p => present.includes(p.id)).map(p => p.igloo
      ? `<div class="prop igloo" style="${p.style}"></div>`
      : `<span class="prop${p.float ? " float" : ""}" style="${p.style}">${p.icon}</span>`).join("");
    const box = $("waddlers");
    box.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "waddler";
      p.textContent = "🐧";
      p.style.animationDuration = `${randBetween(14, 32)}s`;
      p.style.animationDelay = `-${randBetween(0, 32)}s`;
      p.style.left = `${randBetween(5, 90)}%`;   // used when motion is reduced
      p.style.bottom = `${randBetween(4, 36)}px`;
      p.style.fontSize = `${randBetween(16, 24)}px`;
      box.appendChild(p);
    }
  }

  function startSnow() {
    setInterval(() => {
      if (!S.settings.particles || !motionOK() || document.hidden) return;
      const f = document.createElement("div");
      f.className = "flake";
      f.textContent = Math.random() < 0.5 ? "❄" : "•";
      f.style.left = `${Math.random() * 100}vw`;
      f.style.fontSize = `${randBetween(6, 16)}px`;
      const d = randBetween(9, 18);
      f.style.animationDuration = `${d}s`;
      $("snow").appendChild(f);
      setTimeout(() => f.remove(), d * 1000);
    }, 450);
  }

  // ---------- Tabs ----------
  let currentTab = "colony";
  function selectTab(name, focus = false) {
    currentTab = name;
    document.querySelectorAll(".tab").forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    document.querySelectorAll(".tab-body").forEach(b => b.classList.toggle("hidden", b.id !== `tab-${name}`));
    hideTooltip();
    if (name === "achievements") renderAchievements();
    if (name === "stats") renderStats();
    tickUI();
  }

  // ---------- Settings ----------
  function applySettings() {
    const st = S.settings;
    document.documentElement.classList.toggle("reduce-motion", st.reduceMotion);
    document.documentElement.style.fontSize = `${st.textSize * 100}%`;
    Sound.setVolume();
    if (Sound.ctx || !st.ambience) Sound.setAmbience(st.ambience && st.sound);
    $("optSound").checked = st.sound;
    $("optVolume").value = st.volume;
    $("optAmbience").checked = st.ambience;
    $("optShake").value = st.shake;
    $("optReduceMotion").checked = st.reduceMotion;
    $("optParticles").checked = st.particles;
    $("optScientific").checked = st.scientific;
    $("optTextSize").value = String(st.textSize);
    sceneKey = "";
    rebuildScene();
  }

  // ---------- Structural refresh (event-driven) ----------
  function refreshStructure() {
    refreshBuildings();
    rebuildScene();
    setText($("achCount"), `${S.achievements.length}/${ACHIEVEMENTS.length}`);
    if (currentTab === "achievements") renderAchievements();
    tickUI();
  }
  bus.on("structure", refreshStructure);
  bus.on("buffs", refreshBuildings);

  // ---------- Live numbers (ticker) ----------
  function tickUI() {
    setText($("fish"), fmt(Math.floor(S.fish)));
    setText($("fps"), fmt(fishPerSecond()));
    setText($("clickPower"), fmt(clickPower()));
    setText($("featherTotal"), fmt(S.feathersEarned));
    setText($("featherBonus"), fmt((M.feather - 1) * 100));
    $("featherBadge").classList.toggle("hidden", S.feathersEarned === 0 && pendingFeathers() === 0);
    const title = `${fmt(Math.floor(S.fish))} fish · Penguin Idle`;
    if (document.title !== title) document.title = title;
    renderBuffs();
    if (currentTab === "colony") { tickUpgrades(); tickBuildings(); }
    if (currentTab === "heritage") tickHeritage();
  }

  // ---------- Formatting ----------
  function fmt(n) {
    if (!isFinite(n)) return "∞";
    if (n < 0) return "-" + fmt(-n);
    if (n < 1000) {
      if (n === Math.floor(n)) return String(n);
      return n < 10 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.floor(n));
    }
    const exp = Math.floor(Math.log10(n));
    if ((S && S.settings.scientific) || exp >= SUFFIXES.length * 3) return `${(n / Math.pow(10, exp)).toFixed(2)}e${exp}`;
    const tier = Math.floor(exp / 3);
    const scaled = n / Math.pow(1000, tier);
    return `${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
  }

  function fmtTime(sec) {
    sec = Math.floor(sec);
    const d = Math.floor(sec / 86400), h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60, s = sec % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function randBetween(a, b) { return a + Math.random() * (b - a); }

  // =====================================================================
  // 7. Loop & wiring
  // =====================================================================

  let lastFrame = performance.now();
  let uiTimer = 0, autoTimer = 0, achTimer = 0, saveTimer = 0, statsTimer = 0;

  // Timer-driven (not requestAnimationFrame) so the colony keeps fishing in background tabs
  function frame() {
    const now = performance.now();
    const dt = Math.min(5, (now - lastFrame) / 1000);
    lastFrame = now;
    gain(fishPerSecond() * dt);

    if (hasH("autoclick")) {
      autoTimer += dt;
      while (autoTimer >= 0.2) { autoTimer -= 0.2; clickPenguin(null, true); }
    }
    if (Date.now() >= nextGolden) spawnGolden();

    const t = Date.now();
    if (S.buffs.some(b => b.until <= t)) { S.buffs = S.buffs.filter(b => b.until > t); bus.emit("buffs"); }

    uiTimer += dt; achTimer += dt; saveTimer += dt; statsTimer += dt;
    if (uiTimer >= 0.1) { uiTimer = 0; tickUI(); }
    if (achTimer >= 1) { achTimer = 0; checkAchievements(); }
    if (statsTimer >= 1 && currentTab === "stats") { statsTimer = 0; renderStats(); }
    if (saveTimer >= 15) { saveTimer = 0; save(); }
    S.lastTick = Date.now();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { save(); return; }
    const away = (Date.now() - S.lastTick) / 1000;
    if (away > 2) { gain(fishPerSecond(false) * away); S.lastTick = Date.now(); }
    lastFrame = performance.now();
  });
  window.addEventListener("beforeunload", save);

  function replaceState(newState) {
    S = newState;
    S.buffs = [];
    S.lastTick = Date.now();
    recompute();
    applySettings();
    bus.emit("structure");
    save();
  }

  function init() {
    const loadProblem = load();
    recompute();
    const offline = loadProblem && loadProblem.title.startsWith("This save is from a newer") ? null : applyOffline();

    buildBuildingList();
    buildHeritage();
    buildLights();
    applySettings();
    refreshStructure();
    scheduleGolden();

    // Big penguin: pointer or keyboard. Held keys don't auto-repeat into an autoclicker.
    const peng = $("bigPenguin");
    peng.addEventListener("click", e => clickPenguin(pointFrom(e, peng)));
    peng.addEventListener("keydown", e => { if (e.repeat && (e.key === " " || e.key === "Enter")) e.preventDefault(); });

    // Tabs with roving focus and arrow-key navigation
    const tabs = [...document.querySelectorAll(".tab")];
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => selectTab(t.dataset.tab));
      t.addEventListener("keydown", e => {
        const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (dir) { e.preventDefault(); selectTab(tabs[(i + dir + tabs.length) % tabs.length].dataset.tab, true); }
        if (e.key === "Home") { e.preventDefault(); selectTab(tabs[0].dataset.tab, true); }
        if (e.key === "End") { e.preventDefault(); selectTab(tabs[tabs.length - 1].dataset.tab, true); }
      });
    });

    document.querySelectorAll("#buyMode button").forEach(btn => btn.addEventListener("click", () => {
      document.querySelectorAll("#buyMode button").forEach(x => {
        x.classList.toggle("active", x === btn);
        x.setAttribute("aria-pressed", String(x === btn));
      });
      buyAmount = btn.dataset.n === "max" ? "max" : Number(btn.dataset.n);
      Sound.play("tick");
      tickUI();
    }));

    $("migrateBtn").addEventListener("click", migrate);

    // Save controls
    $("saveBtn").addEventListener("click", () => {
      if (savingBlocked) { toast("⚠️ Saving is paused because the stored save is from a newer version. Refresh the page."); return; }
      save(); toast("💾 Saved. Your colony is tucked in.");
    });
    $("exportBtn").addEventListener("click", () => {
      const ta = $("saveText");
      ta.classList.remove("hidden");
      ta.value = encodeSave();
      ta.select();
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => toast("📋 Save copied to clipboard."), () => {});
    });
    $("importBtn").addEventListener("click", () => {
      const ta = $("saveText");
      if (ta.classList.contains("hidden") || !ta.value.trim()) {
        ta.classList.remove("hidden");
        ta.value = "";
        ta.placeholder = "Paste your save here, then press Import save again.";
        ta.focus();
        return;
      }
      try {
        const imported = decodeSave(ta.value);
        savingBlocked = false;
        replaceState(imported);
        ta.value = "";
        ta.classList.add("hidden");
        toast("✅ Save imported. Welcome back!");
      } catch (e) {
        toast(`❌ ${e.message || "That save couldn't be read."}`);
      }
    });
    $("resetBtn").addEventListener("click", () => openModal({
      title: "Start over completely?",
      body: "<p>This wipes <b>everything</b>, including feathers, heirlooms and memories. It can't be undone.</p>",
      danger: true,
      actions: [
        { label: "Keep my colony", cancel: true },
        { label: "Wipe everything", danger: true, onClick: () => { savingBlocked = false; const keep = S.settings; const s = freshState(); s.settings = keep; replaceState(s); } },
      ],
    }));

    // Settings
    const bind = (id, key, read, after) => $(id).addEventListener(id === "optVolume" || id === "optShake" ? "input" : "change", e => {
      S.settings[key] = read(e.target);
      applySettings();
      if (after) after();
    });
    bind("optSound", "sound", el => el.checked, () => Sound.play("tick"));
    bind("optVolume", "volume", el => Number(el.value));
    $("optVolume").addEventListener("change", () => Sound.play("pop"));
    bind("optAmbience", "ambience", el => el.checked, () => Sound.setAmbience(S.settings.ambience && S.settings.sound));
    bind("optShake", "shake", el => Number(el.value));
    $("optShake").addEventListener("change", () => Shake.add(0.5));   // preview the chosen strength
    bind("optReduceMotion", "reduceMotion", el => el.checked);
    bind("optParticles", "particles", el => el.checked);
    bind("optScientific", "scientific", el => el.checked, refreshStructure);
    bind("optTextSize", "textSize", el => Number(el.value));

    // Browsers only allow audio after a user gesture: start ambience on the first interaction
    const unlockAudio = () => {
      if (S.settings.sound && S.settings.ambience) Sound.setAmbience(true);
      else if (Sound.ctx) Sound.ensure();
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);

    startSnow();
    tickUI();
    // Every screen opens with something focused, so Space/Enter work straight away.
    // focusVisible:false hides the ring until the player actually uses the keyboard.
    peng.focus({ preventScroll: true, focusVisible: false });

    if (loadProblem) openModal({ title: loadProblem.title, body: loadProblem.body, actions: [{ label: "Okay", primary: true, cancel: true }] });
    if (offline) openModal({ title: offline.title, body: offline.body, actions: [{ label: "Cozy!", primary: true, cancel: true }] });

    lastFrame = performance.now();
    setInterval(frame, 50);
  }

  // Small debug hook for the browser console
  window.penguinIdle = {
    get state() { return S; }, fmt, save,
    fishPerSecond: () => fishPerSecond(),
    spawnGolden: () => spawnGolden(),
    encodeSave: () => encodeSave(), decodeSave: str => decodeSave(str),
  };

  init();
})();
