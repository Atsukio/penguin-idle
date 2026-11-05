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
      const resize = () => {
        this.dpr = Math.min(2, window.devicePixelRatio || 1);
        this.canvas.width = Math.round(innerWidth * this.dpr);
        this.canvas.height = Math.round(innerHeight * this.dpr);
      };
      resize();
      window.addEventListener("resize", resize);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this.start(); });
      this.start();
    },

    get(props) {
      if (this.list.length >= this.MAX) return null;
      const p = this.pool.pop() || {};
      Object.assign(p, { vx: 0, vy: 0, g: 0, rot: 0, vr: 0, age: 0, size: 16, alpha: 1, color: "#fff", text: "", onDone: null }, props);
      this.list.push(p);
      this.start();
      return p;
    },

    start() {
      if (this.running || document.hidden) return;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    },

    // Each shore has its own weather (set by the colony scene). Rates are particles per second.
    weather: "snow",
    setWeather(id) { this.weather = WEATHER[id] ? id : "snow"; this.start(); },
    snowWanted() { return S().settings.particles && motionOK(); },
    spawnWeather(dt) {
      const w = WEATHER[this.weather];
      this.snowAcc += dt * w.rate;
      while (this.snowAcc >= 1) { this.snowAcc -= 1; this.get(w.make()); }
    },

    frame(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      const { ctx, dpr } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);

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
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === "drop") {
          ctx.strokeStyle = p.color; ctx.lineWidth = 1.2; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.vx * 0.03, p.vy * 0.03); ctx.stroke();
        } else if (p.kind === "glint") {
          ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
          const s = p.size;   // a soft four-pointed sparkle
          ctx.beginPath(); ctx.moveTo(0, -s * 2); ctx.quadraticCurveTo(0, 0, s * 2, 0); ctx.quadraticCurveTo(0, 0, 0, s * 2);
          ctx.quadraticCurveTo(0, 0, -s * 2, 0); ctx.quadraticCurveTo(0, 0, 0, -s * 2); ctx.fill();
        } else if (p.kind === "bubble") {
          ctx.strokeStyle = p.color; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.stroke();
        } else if (p.kind === "ring") {
          const r = 10 + k * 90;
          ctx.strokeStyle = p.color; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.rotate(p.rot);
          ctx.scale(scale, scale);
          ctx.font = p.kind === "num" ? `600 ${p.size}px Fredoka, Nunito, sans-serif` : `${p.size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          if (p.kind === "num") {
            ctx.lineWidth = 4; ctx.strokeStyle = "rgba(40,20,30,.55)"; ctx.strokeText(p.text, 0, 0);
            ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
          } else {
            ctx.fillText(p.text, 0, 0);
          }
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
  // Soft synthesized sounds (Web Audio, no files)
  // =====================================================================
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
      this.master.gain.value = S().settings.volume;
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
      const st = S().settings;
      if (!st.sound || st.volume <= 0) return;
      const c = this.ensure();
      if (!c) return;
      const t = c.currentTime + 0.01;
      const P = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];   // pentatonic-ish, always consonant
      switch (name) {
        case "pop": {
          const now = performance.now();
          if (now - this.lastPop < 70) return;   // fast patting shouldn't become a drone
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
        case "letter":  [P[2], P[4], P[5]].forEach((f, i) => this.tone(f, t + i * 0.09, 0.45, "sine", 0.06)); break;
        case "yawn":    this.tone(392, t, 0.5, "sine", 0.03); this.tone(330, t + 0.25, 0.6, "sine", 0.025); break;
        case "tick":    this.tone(880, t, 0.08, "sine", 0.05); break;
      }
    },
    setVolume() { if (this.master) this.master.gain.value = S().settings.volume; },
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

  // =====================================================================
  // Lofi music, synthesized live: warm electric-piano chords with a little tape wobble, soft bass,
  // a sparse melody with echo, gentle swung drums and vinyl crackle. It never repeats exactly.
  // =====================================================================
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  // Four-bar progressions, one chord per bar: [voicing (MIDI notes), bass note]
  const PROGRESSIONS = [
    [[[53, 57, 60, 64], 41], [[52, 55, 59, 62], 40], [[50, 53, 57, 60], 38], [[48, 55, 59, 64], 36]],          // Fmaj7 Em7 Dm7 Cmaj7
    [[[50, 53, 57, 60, 64], 38], [[53, 57, 59, 64], 43], [[52, 55, 59, 62], 36], [[55, 59, 60, 64], 45]],      // Dm9 G13 Cmaj9 Am9
    [[[55, 60, 64, 67], 45], [[53, 57, 60, 64], 41], [[52, 55, 59, 60], 36], [[50, 55, 59, 64], 43]],          // Am7 Fmaj7 Cmaj7 G6
    [[[50, 53, 57, 62], 46], [[52, 55, 60, 64], 45], [[50, 53, 58, 62], 43], [[53, 55, 58, 62], 36]],          // Bbmaj7 Am7 Gm7 C7sus
  ];
  // The music follows the scene. Each shore has its own flavour, night slows everything down and
  // the Midwinter Feast adds sleigh bells. tone = the warm filter's cutoff (brightness), drums = the share of
  // phrases with drums, hats = hi-hat level, shimmer = a high dreamy pad, crackle = vinyl crackle per step.
  const BASE_MOOD = { bpm: 72, tone: 3200, transpose: 0, drums: 1, hats: 1, kit: 1, melody: 1, shimmer: 0, crackle: 0.18, bells: 0, name: "cozy" };
  const SHORE_MOODS = {
    krillbay:     { bpm: 74, melody: 1.4, name: "bubbly" },
    sunnycove:    { bpm: 78, tone: 4200, transpose: 2, name: "sunny" },
    blizzard:     { bpm: 64, tone: 1900, drums: 0.5, hats: 0.4, name: "snowed-in" },
    aurorafields: { bpm: 68, shimmer: 1, melody: 0.8, name: "dreamy" },
    quiethollow:  { bpm: 66, hats: 0.35, kit: 0.8, name: "hushed" },
    harbour:      { bpm: 74, tone: 2800, crackle: 0.1, name: "rainy" },
    rookery:      { transpose: -2, crackle: 0.42, name: "old-record" },
  };
  function moodFor({ night = false, shore = "home", season = null } = {}) {
    const m = Object.assign({}, BASE_MOOD, SHORE_MOODS[shore] || {});
    if (night) Object.assign(m, { bpm: Math.max(60, m.bpm - 8), tone: m.tone * 0.75, hats: 0, kit: m.kit * 0.65, melody: m.melody * 0.8, name: `night-time ${m.name}` });
    if (season === "midwinter") Object.assign(m, { bells: 1, name: `${m.name} midwinter` });
    if (season === "sunlit") m.tone *= 1.15;
    return m;
  }

  const Music = {
    on: false, nodes: null, timer: null, nextTime: 0, step: 0, bar: 0, prog: PROGRESSIONS[0], noise: null,
    mood: moodFor(), next: null, phraseDrums: true,
    get stepLen() { return 60 / this.mood.bpm / 4; },   // a sixteenth note
    // Called by the scene whenever night, the shore or the season changes. Takes effect at the next bar.
    setMood(ctx) {
      const m = moodFor(ctx);
      if (this.on) this.next = m; else this.mood = m;
    },
    label() { return (this.next || this.mood).name; },
    set(on) { if (on) this.start(); else this.stop(); },
    level: () => S().settings.musicVolume * 1.2,
    setVolume() { if (this.nodes) this.nodes.bus.gain.setTargetAtTime(this.level(), Sound.ctx.currentTime, 0.1); },

    start() {
      if (this.on) return;
      const c = Sound.ensure();
      if (!c) return;
      this.on = true;
      if (!this.noise) this.noise = Sound.noiseBuffer(1, false);
      // bus → warm low-pass → master. Keys and melody pass through a wobbling delay (tape flutter) and an echo.
      const bus = c.createGain(), warm = c.createBiquadFilter(), keys = c.createGain(), wobble = c.createDelay(0.05);
      const lfo = c.createOscillator(), lfoAmt = c.createGain(), echo = c.createDelay(1), echoFb = c.createGain(), echoWet = c.createGain(), echoTone = c.createBiquadFilter();
      bus.gain.value = 0.0001;
      if (this.next) { this.mood = this.next; this.next = null; }
      warm.type = "lowpass"; warm.frequency.value = this.mood.tone; warm.Q.value = 0.4;
      wobble.delayTime.value = 0.006; lfo.frequency.value = 0.45; lfoAmt.gain.value = 0.0012;
      lfo.connect(lfoAmt).connect(wobble.delayTime);
      echo.delayTime.value = this.stepLen * 3; echoFb.gain.value = 0.32; echoWet.gain.value = 0.28;
      echoTone.type = "lowpass"; echoTone.frequency.value = 1800;
      keys.connect(wobble).connect(bus);
      echo.connect(echoTone).connect(echoFb).connect(echo);
      echoTone.connect(echoWet).connect(bus);
      bus.connect(warm).connect(Sound.master);
      // Vinyl hiss
      const hiss = c.createBufferSource(), hissF = c.createBiquadFilter(), hissG = c.createGain();
      hiss.buffer = this.noise; hiss.loop = true;
      hissF.type = "bandpass"; hissF.frequency.value = 2500; hissF.Q.value = 0.6; hissG.gain.value = 0.012;
      hiss.connect(hissF).connect(hissG).connect(bus);
      hiss.start(); lfo.start();
      this.nodes = { bus, keys, echo, hiss, lfo, warm };
      bus.gain.setTargetAtTime(this.level(), c.currentTime, 1.2);   // fade in
      this.nextTime = c.currentTime + 0.15;
      this.step = 0; this.bar = 0; this.phraseDrums = true;
      this.prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
      this.timer = setInterval(() => this.pump(), 250);
      this.pump();
    },

    stop() {
      if (!this.on) return;
      this.on = false;
      clearInterval(this.timer);
      const n = this.nodes, c = Sound.ctx;
      this.nodes = null;
      n.bus.gain.setTargetAtTime(0.0001, c.currentTime, 0.3);   // fade out, then let go of everything
      setTimeout(() => { try { n.hiss.stop(); n.lfo.stop(); } catch (e) { /* already stopped */ } n.bus.disconnect(); }, 1800);
    },

    // Schedules notes a little ahead. 1.6s of lookahead keeps playing smoothly when a background tab's timers slow to once a second.
    pump() {
      const c = Sound.ctx;
      if (!this.on || !c) return;
      while (this.nextTime < c.currentTime + 1.6) {
        if (this.step === 0) this.newBar(this.nextTime);
        const STEP = this.stepLen, swing = this.step % 2 ? STEP * 0.28 : 0;
        this.play(this.step, this.nextTime + swing);
        this.nextTime += STEP;
        if (++this.step === 16) {
          this.step = 0;
          if (++this.bar % 8 === 0) {   // a new progression every 8 bars
            const others = PROGRESSIONS.filter(p => p !== this.prog);
            this.prog = others[Math.floor(Math.random() * others.length)];
          }
        }
      }
    },

    // A new mood glides in at the start of a bar: tempo, echo time and brightness all follow
    newBar(t) {
      if (this.bar % 4 === 0) this.phraseDrums = Math.random() < this.mood.drums;
      if (!this.next) return;
      this.mood = this.next; this.next = null;
      this.nodes.warm.frequency.setTargetAtTime(this.mood.tone, t, 1.5);
      this.nodes.echo.delayTime.setTargetAtTime(this.stepLen * 3, t, 0.5);
    },

    play(step, t) {
      const m = this.mood, STEP = this.stepLen, up = m.transpose;
      const [voicing, root] = this.prog[this.bar % 4];
      const chord = voicing.map(n => n + up), bass = root + up;
      // The first 4 bars, and every fourth phrase, are just keys and bass: a little breather
      const drums = this.bar >= 4 && Math.floor(this.bar / 4) % 4 !== 3 && this.phraseDrums;
      const bar = STEP * 16;
      if (step === 0) {
        chord.forEach((n, i) => this.keyNote(midi(n), t + i * 0.022 + Math.random() * 0.01, bar * 0.98, 0.045));   // a soft strum
        this.bassNote(midi(bass), t, STEP * 6);
        if (m.shimmer && Math.random() < 0.7) this.shimmer(chord, t, bar * 1.6);
      }
      if (step === 8 && Math.random() < 0.3) chord.slice(1).forEach((n, i) => this.keyNote(midi(n), t + i * 0.02, bar * 0.45, 0.025));
      if (step === 10) this.bassNote(midi(Math.random() < 0.6 ? bass : bass + 7), t, STEP * 4);
      // Sparse melody from the chord's own notes, an octave or two up
      if (step % 2 === 0 && step !== 0 && Math.random() < (drums ? 0.22 : 0.14) * m.melody) {
        const pool = chord.map(n => n + 12).concat(chord.map(n => n + 24)).filter(n => n >= 64 + up && n <= 81 + up);
        this.melodyNote(midi(pool[Math.floor(Math.random() * pool.length)]), t, STEP * (2 + Math.floor(Math.random() * 3)));
      }
      if (drums) {
        if (step === 0 || step === 10 || (step === 7 && Math.random() < 0.35)) this.kick(t, m.kit);
        if (step === 4 || step === 12) this.snare(t, m.kit);
        if (m.hats > 0) {
          if (step % 2 === 0 && Math.random() < 0.92) this.hat(t, (step % 4 === 0 ? 0.05 : 0.03) * m.hats);
          else if (Math.random() < 0.12) this.hat(t, 0.018 * m.hats);   // ghost note
        }
      }
      // Sleigh bells: a shake on the backbeat, and now and then a little run of jingles
      if (m.bells && (drums || this.bar >= 4)) {
        if (step === 4 || step === 12) this.jingle(t, 0.05);
        else if (step % 2 === 0 && Math.random() < 0.3) this.jingle(t, 0.022);
      }
      if (Math.random() < m.crackle) this.crackle(t + Math.random() * STEP);
    },

    env(g, t, peak, dur, attack = 0.015) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(peak * 0.35, t + Math.min(dur, 1.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
    },
    osc(type, f, t, dur, out, peak, attack) {
      const c = Sound.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f;
      this.env(g, t, peak, dur, attack);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.35);
    },
    // Electric piano: a sine with a quiet bell-like overtone
    keyNote(f, t, dur, v) {
      const out = this.nodes.keys;
      this.osc("sine", f, t, dur, out, v);
      this.osc("triangle", f * 2, t, dur * 0.4, out, v * 0.12);
    },
    melodyNote(f, t, dur) {
      const c = Sound.ctx, g = c.createGain();
      g.gain.value = 1;
      g.connect(this.nodes.keys); g.connect(this.nodes.echo);
      this.osc("sine", f, t, dur, g, 0.035, 0.03);
      this.osc("triangle", f, t, dur * 0.6, g, 0.008, 0.03);
    },
    bassNote(f, t, dur) {
      const c = Sound.ctx, lp = c.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 380;
      lp.connect(this.nodes.bus);
      this.osc("triangle", f, t, dur, lp, 0.16, 0.02);
    },
    // A slow, high pad of the chord's top notes that swells in and out (the aurora's shimmer)
    shimmer(chord, t, dur) {
      const c = Sound.ctx, g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(this.nodes.keys); g.connect(this.nodes.echo);
      chord.slice(-2).forEach((n, i) => {
        const o = c.createOscillator();
        o.type = "sine"; o.frequency.value = midi(n + 24); o.detune.value = i ? 6 : -6;
        o.connect(g); o.start(t); o.stop(t + dur + 0.05);
      });
    },
    // Sleigh bells: a few bright metallic tinkles close together
    jingle(t, v) {
      const c = Sound.ctx;
      for (let i = 0; i < 3; i++) {
        const at = t + i * 0.012 + Math.random() * 0.01, o = c.createOscillator(), g = c.createGain();
        o.type = "triangle"; o.frequency.value = 2800 + Math.random() * 2400;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(v * 0.5, at + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
        o.connect(g).connect(this.nodes.bus);
        o.start(at); o.stop(at + 0.1);
      }
      this.noiseHit(t, "bandpass", 7500, 2, v * 0.6, 0.12);
    },
    kick(t, lvl = 1) {
      const c = Sound.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(115, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 * lvl, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o.connect(g).connect(this.nodes.bus);
      o.start(t); o.stop(t + 0.4);
    },
    noiseHit(t, type, freq, q, peak, dur) {
      const c = Sound.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noise;
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.nodes.bus);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    },
    snare(t, lvl = 1) {
      this.noiseHit(t, "bandpass", 1700, 0.7, 0.1 * lvl, 0.2);
      const c = Sound.ctx, o = c.createOscillator(), g = c.createGain();   // a little body
      o.frequency.value = 185;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06 * lvl, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g).connect(this.nodes.bus);
      o.start(t); o.stop(t + 0.1);
    },
    hat(t, v) { this.noiseHit(t, "highpass", 6500, 0.5, v, 0.045); },
    crackle(t) { this.noiseHit(t, "highpass", 2000 + Math.random() * 2500, 0.5, 0.015 + Math.random() * 0.025, 0.03); },
  };

  // =====================================================================
  // Tiers and event wiring
  // =====================================================================
  const TIERS = {
    small:  { bits: 2,  trauma: 0,    ring: false },
    medium: { bits: 8,  trauma: 0.22, ring: false },
    large:  { bits: 22, trauma: 0.5,  ring: true },
  };

  function feedback(tier, pos, { sound, chars = ["✨", "❄️", "💛"] } = {}) {
    const t = TIERS[tier];
    if (sound) Sound.play(sound);
    if (pos && pos.x != null) {
      burst(pos.x, pos.y, t.bits, chars);
      if (t.ring) glowRing(pos.x, pos.y);
    }
    Shake.add(t.trauma);
  }

  const restartClass = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  function wire() {
    const bus = PI.bus;
    bus.on("click", d => {
      if (d.crit) {   // Big Catch: a step up from a normal pat, still short of a golden fish
        Sound.play("sparkle");
        numberPop(`Big Catch! +${PI.fmt(d.amount)}`, d.x, d.y, true);
        burst(d.x, d.y, 5, ["🐟", "🐡", "✨"]);
      } else {
        Sound.play("pop");
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
    bus.on("respec", () => Sound.play("chime"));
    bus.on("golden", d => { if (!d.auto) feedback("large", d, { sound: "fanfare", chars: ["🐟", "✨", "💛", "⭐"] }); else Sound.play("sparkle"); });
    bus.on("achievements", () => Sound.play("memory"));
    bus.on("migrate", () => feedback("large", { x: innerWidth / 2, y: innerHeight / 2 }, { sound: "migrate", chars: ["🐧", "❄️", "🪶"] }));
    bus.on("letterClaimed", d => feedback("medium", d.origin, { sound: "letter", chars: ["💌", "✨"] }));
    bus.on("letterBonus", d => feedback("large", d.origin, { sound: "fanfare", chars: ["📦", "🎁", "✨"] }));
    bus.on("outfit", () => Sound.play("sparkle"));
  }

  PI.fx = { Particles, Shake, Sound, Music, feedback, burst, numberPop, glowRing, fishToCounter, init() { Particles.init(); wire(); } };
})(window.PI = window.PI || {});
