/* Penguin Idle: patting the big penguin: taps, rubs and hold-to-pat.
 * Moved verbatim from ui.js; helpers from other files are reached through one-line forwarders. */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data, fmt = PI.fmt, fmtTime = PI.fmtTime;
  const S = () => (E && E.state) || {};
  const M = () => (E && E.M) || {};
  const $ = id => document.getElementById(id);
  const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
  const setHTML = (el, v) => { if (el && el.dataset.html !== v) { el.dataset.html = v; el.innerHTML = v; return true; } return false; };
  const pointFrom = (e, el) => {
    if (e && e.clientX) return { x: e.clientX, y: e.clientY };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const isTouch = () => window.matchMedia("(hover: none)").matches;

  // Domain delegates
  const dialogs = () => PI.dialogs || {};
  const panels = () => PI.panels || {};
  const memoriesUI = () => PI.memoriesUI || {};
  const activities = () => PI.activities || {};
  const scene = () => PI.scene || {};

  const toast = (...args) => dialogs().toast && dialogs().toast(...args);
  const openModal = (...args) => dialogs().openModal && dialogs().openModal(...args);
  const closeModal = (...args) => dialogs().closeModal && dialogs().closeModal(...args);
  const afterNap = (...args) => dialogs().afterNap && dialogs().afterNap(...args);
  const queueMemories = (...args) => dialogs().queueMemories && dialogs().queueMemories(...args);
  const hideTooltip = () => dialogs().hideTooltip && dialogs().hideTooltip();
  const closeSheet = () => dialogs().closeSheet && dialogs().closeSheet();

  // Patting interaction wiring
  const STROKE_PX = 40;
  const STROKE_GAP = 70;
  const HOLD_DELAY = 450;
  const HOLD_EVERY = 200;
  function wirePatting(peng) {
    if (!peng) return;
    let active = null;
    const pat = (pt, how) => E.clickPenguin(pt, false, how);
    const stopHold = () => { if (active) { clearTimeout(active.holdTimer); clearInterval(active.holdTimer); } };
    const startHold = () => {
      stopHold();
      if (!S().settings.holdToPat) return;
      active.holdTimer = setTimeout(() => {
        if (!active) return;
        active.holdTimer = setInterval(() => {
          if (!active) return;
          active.lastPat = performance.now();
          pat({ x: active.x, y: active.y }, "hold");
        }, HOLD_EVERY);
      }, HOLD_DELAY);
    };
    const end = e => {
      if (!active || (e && e.pointerId !== active.id)) return;
      stopHold();
      active = null;
      peng.classList.remove("patting", "rub-l", "rub-r");
    };
    peng.addEventListener("pointerdown", e => {
      if (e.button !== 0 || active) return;
      active = { id: e.pointerId, x: e.clientX, y: e.clientY, travel: 0, lastPat: performance.now(), holdTimer: 0 };
      try { peng.setPointerCapture(e.pointerId); } catch (_) { /* not supported */ }
      peng.classList.add("patting");
      pat({ x: e.clientX, y: e.clientY }, "tap");
      startHold();
    });
    peng.addEventListener("pointermove", e => {
      if (!active || e.pointerId !== active.id) return;
      const dx = e.clientX - active.x;
      active.travel += Math.hypot(dx, e.clientY - active.y);
      active.x = e.clientX; active.y = e.clientY;
      if (Math.abs(dx) > 2) {
        peng.classList.toggle("rub-r", dx > 0);
        peng.classList.toggle("rub-l", dx < 0);
      }
      if (active.travel < STROKE_PX) return;
      startHold();
      const t = performance.now();
      if (t - active.lastPat < STROKE_GAP) return;
      active.travel = 0;
      active.lastPat = t;
      if (!peng.classList.contains("rub-l") && !peng.classList.contains("rub-r")) peng.classList.add("rub-r");
      pat({ x: e.clientX, y: e.clientY }, "rub");
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => peng.addEventListener(ev, end));
    peng.addEventListener("click", e => { if (e.detail === 0) pat(pointFrom(e, peng), "tap"); });
  }

  PI.uiPatting = { wirePatting };
})(window.PI = window.PI || {});
