/* Penguin Idle: top bar extras: news dot, letter reset, next goal, warmth, buffs and season badge.
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

  const selectTab = (...args) => PI.ui.selectTab(...args);

  const hasNews = () => S().seenVersion !== D.GAME_VERSION;

  // Locked memories over halfway, recomputed about every two seconds rather than every frame
  let nearCache = [], nearCacheAt = -Infinity;
  function nearMemoryList() {
    const t = E.now();
    if (t - nearCacheAt > 2000) { nearCacheAt = t; nearCache = E.nearestMemories(99, 0.5); }
    return nearCache.filter(m => !S().achievements.includes(m.a.id));
  }

  function renderLetterReset() {
    const secs = E.secsToNewDay(new Date(E.now()));
    const h = Math.floor(secs / 3600), mi = Math.floor((secs % 3600) / 60);
    const left = `${h}h ${String(mi).padStart(2, "0")}m`;
    setText($("letterReset"), `New letters in ${left}`);
    const top = $("resetIn");
    if (!top) return;
    setText(top, `Letters reset in ${left}`);
    if (!top.dataset.bound) {
      top.dataset.bound = "1";
      top.setAttribute("role", "button");
      top.setAttribute("tabindex", "0");
      top.addEventListener("click", () => selectTab("home", true));
      top.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectTab("home", true); } });
    }
  }

  function renderNextGoal() {
    const g = E.nextGoal(), el = $("nextGoal");
    if (!el) return;
    const m = nearMemoryList().find(x => x.frac >= 0.8) || null;
    if (!el.dataset.bound) {
      el.dataset.bound = "1";
      el.addEventListener("click", () => { if (el.classList.contains("clickable")) selectTab("achievements", true); });
    }
    el.classList.toggle("clickable", !!m);
    el.classList.toggle("hidden", !g && !m);
    if (!g && !m) return;
    const eta = !g || g.secs == null ? "" : g.secs < 1 ? " · any moment" : g.secs > 86400 * 2 ? "" : ` · about ${fmtTime(Math.max(1, g.secs))}`;
    const mem = m ? `📔 ${m.a.name} ${Math.floor(m.frac * 100)}%` : "";
    setText(el, [g ? `Next: ${g.icon} ${g.name} in 🐟 ${fmt(Math.ceil(g.need))}${eta}` : "", mem].filter(Boolean).join(" · "));
    el.title = [g ? `${g.name} costs 🐟 ${fmt(g.cost)}` : "", m ? `Nearly a new memory: ${m.a.name}. ${m.a.desc}` : ""].filter(Boolean).join(" · ");
  }


  function renderWarmth() {
    const w = E.warmthLevel(), box = $("warmth");
    if (!box) return;
    box.classList.toggle("on", w > 0);
    box.classList.toggle("toasty", w >= 1);
    const fill = $("warmthFill");
    if (fill) fill.style.width = `${Math.round(w * 100)}%`;
    setText($("warmthLabel"), w >= 1 ? `Toasty! +${Math.round(E.WARMTH_BONUS * 100)}% pats` : w > 0 ? `Warming up +${Math.round(w * E.WARMTH_BONUS * 100)}%` : "");
  }


  function renderBuffs() {
    const now = E.now();
    const html = S().buffs.filter(b => b.until > now)
      .map(b => `<span class="buff">${b.name} ×${b.mult} · ${Math.ceil((b.until - now) / 1000)}s</span>`).join("");
    const buffsEl = $("buffs");
    if (buffsEl && buffsEl.innerHTML !== html) buffsEl.innerHTML = html;
  }


  function renderSeasonBadge() {
    const se = M().season;
    const b = $("seasonBadge");
    if (!b) return;
    b.classList.toggle("hidden", !se);
    if (se) { setText(b, `${se.icon} ${se.name}`); b.title = se.desc; }
  }

  PI.uiTopbar = { hasNews, renderLetterReset, renderNextGoal, renderWarmth, renderBuffs, renderSeasonBadge };
})(window.PI = window.PI || {});
