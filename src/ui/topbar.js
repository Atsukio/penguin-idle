/* Penguin Idle — UI Top bar, Rolling Ticker, Buffs, Warmth, and Frame Loop. */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data, fmt = PI.fmt, fmtTime = PI.fmtTime;
  const S = () => (E && E.state) || {};
  const M = () => (E && E.M) || {};
  const $ = id => document.getElementById(id);
  const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };

  const dialogs = () => PI.dialogs || {};
  const panels = () => PI.panels || {};
  const memoriesUI = () => PI.memoriesUI || {};
  const activities = () => PI.activities || {};
  const scene = () => PI.scene || {};
  const ui = () => PI.ui || {};

  const hasNews = () => S().seenVersion !== D.GAME_VERSION;

  function updateBadges() {
    setText($("achCount"), `${S().achievements.length}/${D.ACHIEVEMENTS.length}`);
    const nNew = S().achNew.length;
    setText($("achNew"), `${nNew} new`);
    $("achNew").classList.toggle("hidden", !nNew || ui().currentTab === "achievements");

    const letters = S().letters.list;
    const today = E.todaysLetters();
    const bonusDue = today.length && today.every(l => l.claimed) && !S().letters.bonus ? 1 : 0;
    const left = letters.filter(l => !l.claimed).length + bonusDue;
    const claimable = letters.filter(l => !l.claimed && E.letterProgress(l) >= l.target).length + bonusDue;
    const lb = $("homeBadge");
    setText(lb, left ? String(left) : "");
    lb.classList.toggle("hidden", !left);
    lb.classList.toggle("ready", claimable > 0);

    const claimed = today.filter(l => l.claimed).length;
    lb.style.setProperty("--done", String(today.length ? Math.round((claimed / today.length) * 100) : 0));
    lb.classList.toggle("full", !!today.length && claimed === today.length);

    const migGood = panels().migrateIsGood ? panels().migrateIsGood() : false;
    $("migrateBadge").classList.toggle("hidden", !migGood);
    const news = hasNews();
    $("newsBadge").classList.toggle("hidden", !news);
    $("whatsNewBtn").classList.toggle("has-news", news);
  }

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
      top.addEventListener("click", () => ui().selectTab && ui().selectTab("home", true));
      top.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (ui().selectTab) ui().selectTab("home", true); } });
    }
  }

  function renderNextGoal() {
    const g = E.nextGoal(), el = $("nextGoal");
    if (!el) return;
    const m = nearMemoryList().find(x => x.frac >= 0.8) || null;
    if (!el.dataset.bound) {
      el.dataset.bound = "1";
      el.addEventListener("click", () => { if (el.classList.contains("clickable") && ui().selectTab) ui().selectTab("achievements", true); });
    }
    el.classList.toggle("clickable", !!m);
    el.classList.toggle("hidden", !g && !m);
    if (!g && !m) return;
    const eta = !g || g.secs == null ? "" : g.secs < 1 ? " · any moment" : g.secs > 86400 * 2 ? "" : ` · about ${fmtTime(Math.max(1, g.secs))}`;
    const mem = m ? `📔 ${m.a.name} ${Math.floor(m.frac * 100)}%` : "";
    setText(el, [g ? `Next: ${g.icon} ${g.name} in 🐟 ${fmt(Math.ceil(g.need))}${eta}` : "", mem].filter(Boolean).join(" · "));
    el.title = [g ? `${g.name} costs 🐟 ${fmt(g.cost)}` : "", m ? `Nearly a new memory: ${m.a.name}. ${m.a.desc}` : ""].filter(Boolean).join(" · ");
  }

  function bumpCounter() {
    const p = $("fish") && $("fish").parentElement;
    if (p) { p.classList.remove("bump"); void p.offsetWidth; p.classList.add("bump"); }
  }

  let shownFish = 0;
  function tickCounter() {
    renderLetterReset();
    const real = S().fish;
    shownFish = Math.abs(real - shownFish) / Math.max(1, real) < 0.002 || S().settings.reduceMotion || PI.powerSaving ? real : shownFish + (real - shownFish) * 0.35;
    setText($("fish"), fmt(Math.floor(shownFish)));
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
    const se = M().season, b = $("seasonBadge");
    if (!b) return;
    b.classList.toggle("hidden", !se);
    if (se) { setText(b, `${se.icon} ${se.name}`); b.title = se.desc; }
  }

  function tick() {
    tickCounter();
    setText($("fps"), fmt(E.fishPerSecond()));
    setText($("clickPower"), fmt(E.clickPower()));
    const pps = E.patsPerSecond ? E.patsPerSecond() : 0;
    setText($("patsPerSec"), fmt(pps));
    const rateEl = $("patRate");
    if (rateEl) rateEl.classList.toggle("active", pps > 0);
    renderWarmth();
    setText($("featherTotal"), fmt(S().feathersEarned));
    setText($("featherBonus"), M().feather >= 11 ? `×${fmt(M().feather)}` : `+${fmt((M().feather - 1) * 100)}%`);
    $("featherBadge").classList.toggle("hidden", S().feathersEarned === 0 && E.pendingFeathers() === 0);
    const title = `${fmt(Math.floor(S().fish))} fish · Penguin Idle`;
    if (document.title !== title) document.title = title;
    renderBuffs();
    if (ui().renderTab) ui().renderTab(false);
    if (dialogs().renderSheet) dialogs().renderSheet();
  }

  function slowTick() {
    const M_UI = memoriesUI(), P = panels(), A = activities(), S_SC = scene();
    if (M_UI.renderNapStars) M_UI.renderNapStars();
    if (ui().currentTab === "colony" && P.renderUpgrades) P.renderUpgrades();
    if (ui().currentTab === "home") {
      if (A.renderKettle) A.renderKettle();
      if (A.renderDiving) A.renderDiving();
    }
    if (ui().currentTab === "stats" && M_UI.renderStats) M_UI.renderStats();
    const active = E.activeDish ? E.activeDish() : null;
    const sceneKettle = $("sceneKettle");
    if (sceneKettle) sceneKettle.classList.toggle("simmering", !!active);
    if (A.updateSceneIceHole) A.updateSceneIceHole();
    updateBadges();
    renderNextGoal();
    if (S_SC.rebuildScene) S_SC.rebuildScene();
    if (S_SC.updateBasket) S_SC.updateBasket();
    renderSeasonBadge();
  }

  PI.uiTopbar = {
    updateBadges,
    renderNextGoal,
    renderLetterReset,
    bumpCounter,
    tickCounter,
    renderWarmth,
    renderBuffs,
    renderSeasonBadge,
    tick,
    slowTick,
    get shownFish() { return shownFish; },
    set shownFish(v) { shownFish = v; },
  };
})(window.PI = window.PI || {});
