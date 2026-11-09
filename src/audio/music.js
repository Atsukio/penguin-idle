/* Penguin Idle — procedural lofi soundtrack.
 * Live synthesized tape-warped electric-piano chords, soft bass,
 * sparse echo melody, gentle swung drums, and vinyl crackle.
 */
(function (PI) {
  "use strict";

  const S = () => (PI.engine && PI.engine.state) || {};
  const Sound = () => (PI.audio && PI.audio.Sound) || (PI.fx && PI.fx.Sound);

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  // Four-bar progressions, one chord per bar: [voicing (MIDI notes), bass note]
  const PROGRESSIONS = [
    [[[53, 57, 60, 64], 41], [[52, 55, 59, 62], 40], [[50, 53, 57, 60], 38], [[48, 55, 59, 64], 36]],          // Fmaj7 Em7 Dm7 Cmaj7
    [[[50, 53, 57, 60, 64], 38], [[53, 57, 59, 64], 43], [[52, 55, 59, 62], 36], [[55, 59, 60, 64], 45]],      // Dm9 G13 Cmaj9 Am9
    [[[55, 60, 64, 67], 45], [[53, 57, 60, 64], 41], [[52, 55, 59, 60], 36], [[50, 55, 59, 64], 43]],          // Am7 Fmaj7 Cmaj7 G6
    [[[50, 53, 57, 62], 46], [[52, 55, 60, 64], 45], [[50, 53, 58, 62], 43], [[53, 55, 58, 62], 36]],          // Bbmaj7 Am7 Gm7 C7sus
  ];

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
    setMood(ctx) {
      const m = moodFor(ctx);
      if (this.on) this.next = m; else this.mood = m;
    },
    label() { return (this.next || this.mood).name; },
    set(on) { if (on) this.start(); else this.stop(); },
    level: () => {
      const st = S().settings;
      return (st ? st.musicVolume : 0.2) * 1.2;
    },
    setVolume() {
      const snd = Sound();
      if (this.nodes && snd && snd.ctx) this.nodes.bus.gain.setTargetAtTime(this.level(), snd.ctx.currentTime, 0.1);
    },

    start() {
      if (this.on) return;
      const snd = Sound();
      const c = snd ? snd.ensure() : null;
      if (!c) return;
      this.on = true;
      if (!this.noise) this.noise = snd.noiseBuffer(1, false);
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
      bus.connect(warm).connect(snd.master);

      const hiss = c.createBufferSource(), hissF = c.createBiquadFilter(), hissG = c.createGain();
      hiss.buffer = this.noise; hiss.loop = true;
      hissF.type = "bandpass"; hissF.frequency.value = 2500; hissF.Q.value = 0.6; hissG.gain.value = 0.012;
      hiss.connect(hissF).connect(hissG).connect(bus);
      hiss.start(); lfo.start();
      this.nodes = { bus, keys, echo, hiss, lfo, warm };
      bus.gain.setTargetAtTime(this.level(), c.currentTime, 1.2);

      this.step = 0; this.bar = 0;
      this.nextTime = c.currentTime + 0.1;
      this.prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
      this.scheduler();
    },

    stop() {
      if (!this.on) return;
      this.on = false;
      clearTimeout(this.timer);
      const snd = Sound(), c = snd ? snd.ctx : null;
      if (this.nodes && c) {
        this.nodes.bus.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
        const old = this.nodes;
        setTimeout(() => {
          try { old.hiss.stop(); old.lfo.stop(); old.bus.disconnect(); } catch (_) {}
        }, 600);
        this.nodes = null;
      }
    },

    scheduler() {
      if (!this.on) return;
      const snd = Sound(), c = snd ? snd.ctx : null;
      if (!c) return;
      while (this.nextTime < c.currentTime + 0.2) {
        this.playStep(this.nextTime, this.step);
        const swing = (this.step % 2 === 1 ? 0.022 : -0.022);
        this.nextTime += this.stepLen + swing;
        this.step = (this.step + 1) % 16;
        if (this.step === 0) {
          this.bar = (this.bar + 1) % 4;
          if (this.bar === 0) {
            if (this.next) {
              this.mood = this.next; this.next = null;
              if (this.nodes) this.nodes.warm.frequency.setTargetAtTime(this.mood.tone, c.currentTime, 1.5);
              PI.bus.emit("musicMood", this.mood);
            }
            if (Math.random() < 0.4) this.prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
            this.phraseDrums = Math.random() < this.mood.drums;
          }
        }
      }
      this.timer = setTimeout(() => this.scheduler(), 40);
    },

    playStep(t, step) {
      const chord = this.prog[this.bar], [notes, bass] = chord;
      const tr = this.mood.transpose;
      if (step === 0) {
        notes.forEach((n, i) => this.epiano(midi(n + tr), t + i * 0.016, this.stepLen * 3.5, 0.11));
        this.subBass(midi(bass + tr), t, this.stepLen * 3.6, 0.16);
        if (this.mood.shimmer > 0 && Math.random() < 0.7) this.shimmer(midi(notes[notes.length - 1] + 12 + tr), t, this.stepLen * 6);
      } else if (step === 8 && Math.random() < 0.6) {
        notes.slice(1).forEach((n, i) => this.epiano(midi(n + tr), t + i * 0.014, this.stepLen * 2.5, 0.075));
      } else if (step === 14 && Math.random() < 0.4) {
        this.epiano(midi(notes[0] + tr), t, this.stepLen * 1.5, 0.06);
      }
      if (this.mood.melody > 0 && (step % 2 === 0) && Math.random() < 0.28 * this.mood.melody) {
        const pickNote = notes[Math.floor(Math.random() * notes.length)] + (Math.random() < 0.3 ? 12 : 0);
        this.melodyNote(midi(pickNote + tr), t, this.stepLen * 2.2, 0.08);
      }
      if (this.phraseDrums && this.mood.kit > 0) {
        const k = this.mood.kit;
        if (step === 0 || step === 10) this.kick(t, k);
        if (step === 4 || step === 12) this.snare(t, k);
        if (this.mood.hats > 0) {
          const v = (step % 4 === 2 ? 0.035 : 0.018) * this.mood.hats * k;
          if (step % 2 === 0 || Math.random() < 0.35) this.hat(t, v);
        }
        if (this.mood.bells > 0 && (step === 4 || step === 12)) this.sleighBell(t);
      }
      if (Math.random() < this.mood.crackle) this.crackle(t + Math.random() * this.stepLen);
    },

    epiano(freq, t, dur, vol = 0.1) {
      const snd = Sound(), c = snd ? snd.ctx : null;
      if (!c) return;
      const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o1.type = "sine"; o1.frequency.value = freq;
      o2.type = "sine"; o2.frequency.value = freq * 2;
      const g2 = c.createGain(); g2.gain.value = 0.28; o2.connect(g2).connect(g);
      o1.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.018);
      g.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(this.nodes.keys);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    },

    subBass(freq, t, dur, vol = 0.16) {
      const snd = Sound(), c = snd ? snd.ctx : null;
      if (!c) return;
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = "triangle"; o.frequency.value = freq;
      f.type = "lowpass"; f.frequency.value = 220;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(this.nodes.bus);
      o.start(t); o.stop(t + dur + 0.05);
    },

    melodyNote(freq, t, dur, vol = 0.07) {
      const snd = Sound(), c = snd ? snd.ctx : null;
      if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.nodes.keys).connect(this.nodes.echo);
      o.start(t); o.stop(t + dur + 0.05);
    },

    shimmer(freq, t, dur) {
      const snd = Sound(), c = snd ? snd.ctx : null;
      if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.nodes.echo);
      o.start(t); o.stop(t + dur + 0.1);
    },

    sleighBell(t) {
      [2489, 2960, 3520].forEach(f => {
        const snd = Sound(), c = snd ? snd.ctx : null;
        if (!c) return;
        const o = c.createOscillator(), g = c.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.015, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        o.connect(g).connect(this.nodes.bus);
        o.start(t); o.stop(t + 0.09);
      });
    },

    kick(t, lvl = 1) {
      const snd = Sound(), c = snd ? snd.ctx : null;
      if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(115, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 * lvl, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o.connect(g).connect(this.nodes.bus);
      o.start(t); o.stop(t + 0.4);
    },

    noiseHit(t, type, freq, q, peak, dur) {
      const snd = Sound(), c = snd ? snd.ctx : null;
      if (!c) return;
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
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
      const snd = Sound(), c = snd ? snd.ctx : null;
      if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
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

  PI.audio = PI.audio || {};
  Object.assign(PI.audio, { Music, moodFor, PROGRESSIONS, BASE_MOOD, SHORE_MOODS });
  PI.fx = PI.fx || {};
  PI.fx.Music = Music;
})(window.PI = window.PI || {});
