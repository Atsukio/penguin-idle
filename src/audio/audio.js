/* Penguin Idle — synthesized Web Audio sound effects and procedural lofi music.
 * Generates soft sound effects, cold winter wind ambience, and a continuous
 * tape-warped electric-piano lofi soundtrack with procedurally generated drums and bass.
 */
(function (PI) {
  "use strict";

  const S = () => (PI.engine && PI.engine.state) || {};

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
      const st = S().settings;
      if (st && this.master) this.master.gain.value = st.volume;
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
      if (!st || !st.sound || st.volume <= 0 || PI.napping) return;   // auto-pats and the like stay quiet during a nap
      const c = this.ensure();
      if (!c) return;
      const t = c.currentTime + 0.01;
      const P = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];   // pentatonic-ish, always consonant
      switch (name) {
        case "stroke": {   // a soft, low swish for rubbing: a gentle upward glide instead of a bright pop
          const now = performance.now();
          if (now - this.lastPop < 90) return;
          this.lastPop = now;
          const o = c.createOscillator(), g = c.createGain(), f = 220 + Math.random() * 60;
          o.type = "sine";
          o.frequency.setValueAtTime(f, t);
          o.frequency.exponentialRampToValueAtTime(f * 1.45, t + 0.16);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.07, t + 0.04);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
          o.connect(g).connect(this.master);
          o.start(t); o.stop(t + 0.26);
          break;
        }
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
    setVolume() {
      const st = S().settings;
      if (this.master && st) this.master.gain.value = st.volume;
    },
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

  // Lofi music lives in src/audio/music.js, which adds Music, moodFor and the mood tables to PI.audio
  PI.audio = { Sound };

  PI.fx = PI.fx || {};
  PI.fx.Sound = Sound;
})(window.PI = window.PI || {});
