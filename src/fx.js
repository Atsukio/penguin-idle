/* Penguin Idle — game feel: canvas particles, snow, screen shake and synthesized sound.
 * Every event maps to an importance tier so the juice stays proportional:
 *   small  — pats, colony purchases          (sound, number pop, a few bits)
 *   medium — upgrades, milestones, heirlooms (chime, sparkle burst, a light sway)
 *   large  — golden fish, migration          (fanfare, big burst, glow ring, stronger sway)
 * Juice is brief and returns to rest. No white flashes (photosensitivity).
 */
(function (PI) {
  "use strict";

  const E = PI.engine;
  const S = () => E.state;
  const motionOK = () => !S().settings.reduceMotion;
  const rand = (a, b) => a + Math.random() * (b - a);

  // =====================================================================
  // Canvas particle system (one canvas for snow, bits, number pops, rings and flying fish)
  // =====================================================================
  // Weather for each shore: how often a particle appears and what it looks like
  const fall = speed => (innerHeight + 30) / speed;   // seconds to cross the screen
  const rise = speed => (innerHeight + 30) / speed;
  const WEATHER = {
    snow: { rate: 2.5, make: () => { const vy = rand(25, 55); return { kind: "flake", x: rand(0, innerWidth), y: -10, vx: rand(-6, 10), vy, life: fall(vy), size: rand(1.5, 3.5), alpha: rand(0.4, 0.8), color: "#fff" }; } },
    blizzard: { rate: 22, make: () => { const vy = rand(110, 190); return { kind: "flake", x: rand(-innerWidth * 0.6, innerWidth), y: -10, vx: rand(120, 220), vy, life: fall(vy), size: rand(1, 2.6), alpha: rand(0.3, 0.7), color: "#eef4ff", sway: 1.2 }; } },
    fluff: { rate: 1.1, make: () => { const vy = rand(12, 24); return { kind: "flake", x: rand(0, innerWidth), y: -10, vx: rand(-4, 4), vy, life: fall(vy), size: rand(3, 5), alpha: rand(0.35, 0.65), color: "#fff", sway: 0.6 }; } },
    rain: { rate: 9, make: () => { const vy = rand(380, 480); return { kind: "drop", x: rand(0, innerWidth + 60), y: -20, vx: -40, vy, life: fall(vy), alpha: rand(0.15, 0.3), color: "#b9c8e8" }; } },
    sparkle: { rate: 1.6, make: () => ({ kind: "glint", x: rand(0, innerWidth), y: rand(innerHeight * 0.2, innerHeight), vx: rand(-4, 4), vy: rand(-14, -6), life: rand(2.5, 4.5), size: rand(1.5, 3), alpha: rand(0.5, 0.9), color: "#ffd27a" }) },
    motes: { rate: 1.8, make: () => ({ kind: "glint", x: rand(0, innerWidth), y: rand(0, innerHeight), vx: rand(-8, 8), vy: rand(-10, 4), life: rand(3, 6), size: rand(1, 2.2), alpha: rand(0.4, 0.8), color: Math.random() < 0.6 ? "#8ff0c4" : "#c3a6ff" }) },
    bubbles: { rate: 1.8, make: () => { const vy = -rand(20, 40); return { kind: "bubble", x: rand(0, innerWidth), y: innerHeight + 10, vx: 0, vy, life: rise(-vy) * rand(0.4, 0.9), size: rand(2, 5), alpha: rand(0.3, 0.6), color: "#bfeff0", sway: 0.5 }; } },
    feathers: { rate: 0.5, make: () => { const vy = rand(18, 30); return { kind: "emoji", text: "🪶", x: rand(0, innerWidth), y: -20, vx: rand(-10, 10), vy, rot: rand(-1, 1), vr: rand(-0.8, 0.8), life: fall(vy), size: rand(12, 18), alpha: rand(0.35, 0.6) }; } },
  };

  const Particles = {
    canvas: null, ctx: null, dpr: 1, list: [], pool: [], running: false, last: 0, snowAcc: 0,
    MAX: 400,

    init() {
      this.canvas = document.getElementById("fxCanvas");
      this.ctx = this.canvas.getContext("2d");
      this.resize();
      window.addEventListener("resize", () => this.resize());
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this.start(); });
      this.start();
    },

    // The battery saver draws at normal resolution instead of the screen's sharper one
    resize() {
      this.dpr = PI.powerSaving ? 1 : Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(innerWidth * this.dpr);
      this.canvas.height = Math.round(innerHeight * this.dpr);
    },
    // Napping: drop everything in flight, so the canvas stops on its next frame
    clear() { this.list.forEach(p => { if (this.pool.length < this.MAX) this.pool.push(p); }); this.list.length = 0; },

    get(props) {
      if (this.list.length >= this.MAX || PI.napping) return null;
      const p = this.pool.pop() || {};
      Object.assign(p, { vx: 0, vy: 0, g: 0, rot: 0, vr: 0, age: 0, size: 16, alpha: 1, color: "#fff", text: "", onDone: null }, props);
      this.list.push(p);
      this.start();
      return p;
    },

    start() {
      if (this.running || document.hidden || PI.napping) return;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    },

    // Each shore has its own weather (set by the colony scene). Rates are particles per second.
    weather: "snow",
    setWeather(id) { this.weather = WEATHER[id] ? id : "snow"; this.start(); },
    snowWanted() { return S().settings.particles && motionOK() && !PI.powerSaving && !PI.napping; },
    // On a device that can't keep up, the weather eases off (down to a quarter) and comes back when it recovers.
    // Only the weather: pats, purchases and golden fish keep their full feedback.
    weatherScale: 1, frameAvg: 1 / 60, perfTimer: 0,
    watchPerf(dt) {
      this.frameAvg += (dt - this.frameAvg) * 0.05;
      this.perfTimer += dt;
      if (this.perfTimer < 2) return;
      this.perfTimer = 0;
      if (this.frameAvg > 1 / 35) this.weatherScale = Math.max(0.25, this.weatherScale * 0.7);
      else if (this.frameAvg < 1 / 50) this.weatherScale = Math.min(1, this.weatherScale + 0.1);
    },
    spawnWeather(dt) {
      const w = WEATHER[this.weather];
      this.snowAcc += dt * w.rate * this.weatherScale;
      while (this.snowAcc >= 1) { this.snowAcc -= 1; this.get(w.make()); }
    },

    frame(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      const { ctx, dpr } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);

      this.watchPerf(dt);
      if (this.snowWanted()) this.spawnWeather(dt);

      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.age += dt;
        const k = Math.min(1, p.age / p.life);
        if (p.kind === "fly") {
          // Quadratic arc from the penguin to the fish counter, eased in
          const e = k * k;
          const cx = (p.sx + p.tx) / 2 + p.bend, cy = Math.min(p.sy, p.ty) - 80;
          p.x = (1 - e) * (1 - e) * p.sx + 2 * (1 - e) * e * cx + e * e * p.tx;
          p.y = (1 - e) * (1 - e) * p.sy + 2 * (1 - e) * e * cy + e * e * p.ty;
          p.rot += dt * 6;
        } else {
          p.vy += p.g * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
        }
        if (p.kind === "flake" || p.kind === "bubble") p.x += Math.sin(p.age * 1.5 + p.size) * (p.sway || 0.3);

        let alpha = p.alpha;
        let scale = 1;
        if (p.kind === "num") { alpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85; scale = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15)); }
        if (p.kind === "bit") alpha = 1 - k;
        if (p.kind === "ring") alpha = 1 - k;
        if (p.kind === "glint") alpha = p.alpha * Math.sin(Math.PI * k) * (0.6 + 0.4 * Math.sin(p.age * 6 + p.size));   // fade in, twinkle, fade out
        if (p.kind === "bubble") alpha = p.alpha * Math.min(1, (1 - k) * 4);

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(p.x, p.y);
        if (p.kind === "flake") {
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === "drop") {
          ctx.strokeStyle = p.color; ctx.lineWidth = 1.2; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.vx * 0.03, p.vy * 0.03); ctx.stroke();
        } else if (p.kind === "glint") {
          ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
          const s = p.size;
          ctx.beginPath(); ctx.moveTo(0, -s * 2); ctx.quadraticCurveTo(0, 0, s * 2, 0); ctx.quadraticCurveTo(0, 0, 0, s * 2);
          ctx.quadraticCurveTo(0, 0, -s * 2, 0); ctx.quadraticCurveTo(0, 0, 0, -s * 2); ctx.fill();
        } else if (p.kind === "bubble") {
          ctx.strokeStyle = p.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.stroke();
        } else if (p.kind === "ring") {
          ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 10 + k * 90, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.rotate(p.rot); ctx.scale(scale, scale);
          ctx.font = p.kind === "num" ? `600 ${p.size}px Fredoka, Nunito, sans-serif` : `${p.size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          if (p.kind === "num") { ctx.lineWidth = 4; ctx.strokeStyle = "rgba(40,20,30,.55)"; ctx.strokeText(p.text, 0, 0); ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0); }
          else ctx.fillText(p.text, 0, 0);
        }
        ctx.restore();

        if (k >= 1 || p.y > innerHeight + 40) {
          this.list.splice(i, 1);
          if (p.onDone) p.onDone();
          if (this.pool.length < this.MAX) this.pool.push(p);
        }
      }

      if (this.list.length || this.snowWanted()) requestAnimationFrame(t2 => this.frame(t2));
      else { this.running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
    },
  };

  function numberPop(text, x, y, crit = false) {
    if (!S().settings.particles || x == null) return;
    const p = Particles.get({ kind: "num", text, x: x + rand(-10, 10), y: y - 20, vx: rand(-25, 25), vy: -70, life: 1, size: crit ? 24 : 19, color: crit ? "#ffd27a" : "#ffffff" });
    if (p && !motionOK()) { p.vx = 0; p.vy = 0; }
  }

  function burst(x, y, count, chars) {
    if (!S().settings.particles || !motionOK() || !count || x == null) return;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(80, 200);
      Particles.get({ kind: "bit", text: chars[i % chars.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 260, vr: rand(-6, 6), life: 0.9, size: rand(14, 22) });
    }
  }

  function glowRing(x, y) {
    if (!motionOK() || x == null) return;
    Particles.get({ kind: "ring", x, y, life: 0.7, color: "#ffd27a" });
  }

  // A few fish arc up to the fish counter, which bumps when they land
  let flyBudget = 0;
  function fishToCounter(x, y) {
    if (!S().settings.particles || !motionOK() || x == null) return;
    const now = performance.now();
    if (now < flyBudget) return;   // at most ~6 a second, however fast the patting
    flyBudget = now + 160;
    const target = document.getElementById("fish").getBoundingClientRect();
    Particles.get({
      kind: "fly", text: "🐟", sx: x, sy: y, tx: target.left + target.width / 2, ty: target.top + target.height / 2,
      bend: rand(-80, 80), life: 0.75, size: 18, x, y,
      onDone: () => PI.ui && PI.ui.bumpCounter(),
    });
  }

  // =====================================================================
  // Screen shake: decaying trauma, smooth sines, visuals only
  // =====================================================================
  const Shake = {
    trauma: 0, t: 0, running: false, last: 0,
    add(amount) {
      if (!motionOK() || S().settings.shake <= 0 || amount <= 0) return;
      this.trauma = Math.min(1, this.trauma + amount);   // hits add; they don't reset
      if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(ts => this.step(ts)); }
    },
    step(ts) {
      const dt = Math.min(0.05, (ts - this.last) / 1000);
      this.last = ts;
      this.trauma = Math.max(0, this.trauma - 1.4 * dt);   // linear decay, so it always ends
      const layout = document.getElementById("layout");
      if (this.trauma <= 0 || !motionOK()) { layout.style.transform = ""; this.running = false; this.trauma = 0; return; }
      this.t += dt * 30;
      const s = this.trauma * this.trauma * S().settings.shake;   // quadratic: soft at low trauma
      const ox = 7 * s * (0.6 * Math.sin(this.t * 1.7) + 0.4 * Math.sin(this.t * 3.1));
      const oy = 5 * s * (0.6 * Math.sin(this.t * 2.3 + 1) + 0.4 * Math.sin(this.t * 4.3));
      const rot = 0.4 * s * Math.sin(this.t * 1.1);
      layout.style.transform = `translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px) rotate(${rot.toFixed(3)}deg)`;
      requestAnimationFrame(t2 => this.step(t2));
    },
  };

  // =====================================================================
  // Audio delegation (Sound and procedural lofi Music live in src/audio.js)
  // =====================================================================
  const Sound = (PI.audio && PI.audio.Sound) || (PI.fx && PI.fx.Sound) || { play() {}, ensure() { return null; }, setAmbience() {}, setVolume() {} };
  const Music = (PI.audio && PI.audio.Music) || (PI.fx && PI.fx.Music) || { set() {}, start() {}, stop() {}, setMood() {}, setVolume() {}, label() { return ""; } };

  // =====================================================================
  // Tiers and event wiring
  // =====================================================================
  const TIERS = {
    small: { bits: 2, trauma: 0, ring: false }, medium: { bits: 8, trauma: 0.22, ring: false }, large: { bits: 22, trauma: 0.5, ring: true },
  };

  function feedback(tier, pos, { sound, chars = ["✨", "❄️", "💛"] } = {}) {
    const t = TIERS[tier];
    if (sound) Sound.play(sound);
    if (pos && pos.x != null) { burst(pos.x, pos.y, t.bits, chars); if (t.ring) glowRing(pos.x, pos.y); }
    Shake.add(t.trauma);
  }

  const restartClass = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  function wire() {
    const bus = PI.bus;
    bus.on("click", d => {
      if (d.crit) {
        Sound.play("sparkle");
        numberPop(`Big Catch! +${PI.fmt(d.amount)}`, d.x, d.y, true);
        burst(d.x, d.y, 5, ["🐟", "🐡", "✨"]);
      } else {
        Sound.play(d.how === "rub" ? "stroke" : "pop");
        numberPop(`+${PI.fmt(d.amount)}`, d.x, d.y);
      }
      fishToCounter(d.x, d.y);
    });
    bus.on("buyBuilding", d => { Sound.play("buy"); restartClass(PI.ui && PI.ui.buildingRow(d.id), "pop"); });
    bus.on("milestone", d => { if (!d.quiet) feedback("medium", d.origin, { sound: "chime", chars: [d.b.icon, "✨", "💛"] }); });
    bus.on("buyUpgrade", d => feedback("medium", d.origin, { sound: "sparkle", chars: [d.u.icon, "✨"] }));
    bus.on("buyAll", d => feedback("medium", d.origin, { sound: "sparkle", chars: ["✨", "🛍️", "💛"] }));
    bus.on("buyResearch", d => {
      Sound.play("buy");
      if (d.origin) burst(d.origin.x, d.origin.y, 3, [d.r.icon, "✨"]);
      restartClass(document.querySelector(`#research [data-id="${d.r.id}"]`), "pop");
    });
    bus.on("learnNode", d => {
      feedback(d.n.capstone ? "large" : "medium", d.origin, { sound: d.n.capstone ? "fanfare" : "chime", chars: [d.n.icon, "🪶", "✨"] });
      restartClass(document.querySelector(`#tree [data-id="${d.n.id}"]`), "pop");
    });
    bus.on("hireHelper", d => feedback("medium", d.origin, { sound: "fanfare", chars: [d.h.icon, "✨", "💛"] }));
    bus.on("passportStamp", d => feedback("large", null, { sound: "fanfare", chars: ["🛂", "✨", (d.stamp && d.stamp.icon) || "🏔️", "🌟"] }));
    bus.on("dishCooked", d => feedback("medium", d.origin, { sound: "fanfare", chars: [d.recipe ? d.recipe.icon : "🍲", "♨️", "✨", "🔥"] }));
    bus.on("diveStarted", d => feedback("medium", null, { sound: "pop", chars: ["🤿", "🫧", "🌊", "✨"] }));
    bus.on("diveReady", d => feedback("small", null, { sound: "sparkle", chars: ["🎁", "✨", "🫧"] }));
    bus.on("relicFound", d => feedback("large", null, { sound: "fanfare", chars: [d.relic ? d.relic.icon : "🎁", "✨", "🫧", "🌊", "⭐"] }));
    bus.on("respec", () => Sound.play("chime"));
    bus.on("golden", d => {
      const v = d.variant || "golden";
      const chars = v === "rainbow" ? ["🐠", "🌈", "✨", "🫧", "💖"] : v === "glacier" ? ["❄️", "🧊", "💎", "✨", "🐟"] : v === "feathered" ? ["🪶", "✨", "💛", "⭐", "🌟"] : ["🐟", "✨", "💛", "⭐"];
      const sound = v === "glacier" ? "chime" : "fanfare";
      if (!d.auto) feedback("large", d, { sound, chars });
      else Sound.play(v === "glacier" ? "chime" : "sparkle");
    });
    bus.on("achievements", () => Sound.play("memory"));
    bus.on("migrate", () => feedback("large", { x: innerWidth / 2, y: innerHeight / 2 }, { sound: "migrate", chars: ["🐧", "❄️", "🪶"] }));
    bus.on("letterClaimed", d => feedback("medium", d.origin, { sound: "letter", chars: ["💌", "✨"] }));
    bus.on("letterBonus", d => feedback("large", d.origin, { sound: "fanfare", chars: ["📦", "🎁", "✨"] }));
    bus.on("outfit", () => Sound.play("sparkle"));
  }

  PI.fx = { Particles, Shake, Sound, Music, feedback, burst, numberPop, glowRing, fishToCounter, init() { Particles.init(); wire(); } };
})(window.PI = window.PI || {});
