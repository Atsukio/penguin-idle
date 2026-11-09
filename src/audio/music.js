/* Penguin Idle: procedural lofi music, synthesized live with Web Audio.
 * Moved verbatim from audio.js; shares its Sound object (and audio context) through PI.audio. */
(function (PI) {
  "use strict";

  const S = () => (PI.engine && PI.engine.state) || {};
  const { Sound } = PI.audio;

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
    level: () => {
      const st = S().settings;
      return (st ? st.musicVolume : 0.2) * 1.2;
    },
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


  Object.assign(PI.audio, { Music, moodFor, PROGRESSIONS, BASE_MOOD, SHORE_MOODS });
  PI.fx = PI.fx || {};
  PI.fx.Music = Music;
})(window.PI = window.PI || {});
