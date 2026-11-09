/* Penguin Idle — User Interface Shell & Frame Loop.
 * Coordinates tabs, top bar stats, rolling fish counters, patting interactions,
 * and 60fps frame loop tickers, delegating tab views to specialized modules:
 *   - src/ui/dialogs.js: Modals, Toasts, Tooltips, Touch Sheet
 *   - src/ui/memories.js: Memories (101 achievements), Statistics, SVG History Graph, Nap Stars
 *   - src/ui/panels.js: Colony buildings, Upgrades, Workshop research, Migration/Shores, Helpers, Letters & Wardrobe
 *   - src/ui/activities.js: Heirloom Tree, Campfire Kettle cooking, Diving & Relics
 *   - src/scene/scene.js: Canvas colony landscape, waddlers, chatter, animated props
 */
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

  let currentTab = "colony";
  let buyAmount = 1;

  // =====================================================================
  // Tabs, badges and the fish counter
  // =====================================================================
  function selectTab(name, focus = false) {
    if (currentTab === "achievements" && name !== "achievements") E.clearNewMemories();
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
    closeSheet();
    renderTab(true);
  }

  function renderTab(full) {
    const P = panels(), A = activities(), M_UI = memoriesUI();
    if (currentTab === "colony") {
      if (P.renderUpgrades) P.renderUpgrades(full);
      if (P.tickUpgrades) P.tickUpgrades();
      if (P.tickBuildings) P.tickBuildings();
    }
    if (currentTab === "workshop" && P.tickResearch) P.tickResearch();
    if (currentTab === "heritage") {
      if (P.tickMigration) P.tickMigration();
      if (full) {
        if (P.renderShores) P.renderShores();
        if (P.renderPassport) P.renderPassport();
        if (P.renderHelpers) P.renderHelpers();
        if (A.refreshTree) A.refreshTree();
      }
    }
    if (currentTab === "home") {
      if (P.renderLetters) P.renderLetters();
      renderLetterReset();
      if (A.renderKettle) A.renderKettle();
      if (A.renderDiving) A.renderDiving();
      if (full) {
        if (P.renderWardrobe) P.renderWardrobe();
        if (A.renderRelicShelf) A.renderRelicShelf();
      }
    }
    if (currentTab === "achievements" && full && M_UI.renderAchievements) M_UI.renderAchievements();
    if (currentTab === "stats" && full && M_UI.renderStats) M_UI.renderStats();
  }

  function updateBadges() {
    setText($("achCount"), `${S().achievements.length}/${D.ACHIEVEMENTS.length}`);
    const nNew = S().achNew.length;
    setText($("achNew"), `${nNew} new`);
    $("achNew").classList.toggle("hidden", !nNew || currentTab === "achievements");

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

  function bumpCounter() {
    const p = $("fish") && $("fish").parentElement;
    if (p) { p.classList.remove("bump"); void p.offsetWidth; p.classList.add("bump"); }
  }

  // Smoothly rolling fish counter: eases toward the real value instead of jumping
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
    renderTab(false);
    if (dialogs().renderSheet) dialogs().renderSheet();
  }

  function renderBuffs() {
    const now = E.now();
    const html = S().buffs.filter(b => b.until > now)
      .map(b => `<span class="buff">${b.name} ×${b.mult} · ${Math.ceil((b.until - now) / 1000)}s</span>`).join("");
    const buffsEl = $("buffs");
    if (buffsEl && buffsEl.innerHTML !== html) buffsEl.innerHTML = html;
  }

  function slowTick() {
    const M_UI = memoriesUI(), P = panels(), A = activities(), S_SC = scene();
    if (M_UI.renderNapStars) M_UI.renderNapStars();
    if (currentTab === "colony" && P.renderUpgrades) P.renderUpgrades();
    if (currentTab === "home") {
      if (A.renderKettle) A.renderKettle();
      if (A.renderDiving) A.renderDiving();
    }
    if (currentTab === "stats" && M_UI.renderStats) M_UI.renderStats();
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

  function renderSeasonBadge() {
    const se = M().season;
    const b = $("seasonBadge");
    if (!b) return;
    b.classList.toggle("hidden", !se);
    if (se) { setText(b, `${se.icon} ${se.name}`); b.title = se.desc; }
  }

  // ---------- Structural refresh (event-driven) ----------
  function refreshStructure() {
    const P = panels(), A = activities(), M_UI = memoriesUI(), S_SC = scene();
    if (P.refreshBuildings) P.refreshBuildings();
    if (S_SC.rebuildScene) S_SC.rebuildScene();
    updateBadges();
    if (A.updateSceneIceHole) A.updateSceneIceHole();
    if (currentTab === "achievements" && M_UI.renderAchievements) M_UI.renderAchievements();
    if (currentTab === "heritage") {
      if (P.renderShores) P.renderShores();
      if (P.renderPassport) P.renderPassport();
      if (P.renderHelpers) P.renderHelpers();
      if (A.refreshTree) A.refreshTree();
    }
    if (currentTab === "home") {
      if (P.renderLetters) P.renderLetters();
      if (P.renderWardrobe) P.renderWardrobe();
      if (A.renderKettle) A.renderKettle();
      if (A.renderDiving) A.renderDiving();
      if (A.renderRelicShelf) A.renderRelicShelf();
    }
    renderTab(false);
  }

  function wire() {
    const bus = PI.bus, P = panels(), A = activities(), S_SC = scene();
    bus.on("structure", refreshStructure);
    bus.on("buffs", () => P.refreshBuildings && P.refreshBuildings());
    bus.on("stateReplaced", () => {
      shownFish = S().fish;
      if (S_SC.rebuildScene) S_SC.rebuildScene(true);
      renderTab(true);
      if (S_SC.fillFriends) S_SC.fillFriends();
    });
    bus.on("names", () => {
      if (S_SC.applyNames) S_SC.applyNames();
      if (S_SC.fillFriends) S_SC.fillFriends();
    });
    bus.on("letters", () => { if (currentTab === "home" && P.renderLetters) P.renderLetters(); updateBadges(); });
    bus.on("outfit", () => { if (currentTab === "home" && P.renderWardrobe) P.renderWardrobe(); });
    bus.on("buyBuilding", d => S_SC.arrival && S_SC.arrival(d.id));
    bus.on("milestone", d => toast(`<b>Milestone!</b> ${d.b.plural} now catch ${d.mult === 2 ? "twice" : `${+d.mult.toFixed(2)}×`} as many fish.`));
    bus.on("buyAll", d => toast(`🛍️ Bought <b>${d.count}</b> upgrade${d.count > 1 ? "s" : ""}.`));
    bus.on("golden", d => {
      if (d.quiet) return;
      const vName = d.variant === "rainbow" ? "a rainbow fish"
                  : d.variant === "glacier" ? "a glacier fish"
                  : d.variant === "feathered" ? "a feathered fish"
                  : "a golden fish";
      toast(d.auto ? `📯 Lookout Lumi caught ${vName}! ${d.msg}` : d.msg);
    });
    bus.on("achievements", list => queueMemories(list));
    bus.on("napStreak", ns => toast(ns.mask
      ? "😴 <b>7 nap days in a row!</b> The Sleep Mask is in your wardrobe."
      : `😴 <b>Nap streak: ${ns.count} day${ns.count === 1 ? "" : "s"}</b>${ns.best < 7 ? ` · ${7 - ns.count} more for the Sleep Mask` : ""}`));
    bus.on("respec", () => toast("🪶 <b>Feathers refunded.</b> Plant your tree however you like."));
    bus.on("hireHelper", d => toast(`${d.h.icon} <b>${d.h.name}</b> has joined the colony!`));
    bus.on("passportStamp", d => {
      const shName = (d.shore && d.shore.name) || (D.SHORE_BY_ID[d.stamp.shoreId] && D.SHORE_BY_ID[d.stamp.shoreId].name) || "";
      toast(`🛂 <b>Passport Stamped!</b> ${d.stamp.icon} <b>${d.stamp.name}</b> (${shName}): ${d.stamp.rewardDesc}`);
      if (currentTab === "heritage" && P.renderPassport) P.renderPassport();
    });
    bus.on("dishCooked", d => {
      toast(`${d.recipe.icon} <b>${d.recipe.name}</b> is simmering over the campfire! ${d.recipe.effectDesc}`);
      if (currentTab === "home" && A.renderKettle) A.renderKettle();
      const sceneKettle = $("sceneKettle");
      if (sceneKettle) sceneKettle.classList.add("simmering");
    });
    bus.on("dishFinished", d => {
      if (d.recipe) toast(`🥣 The pot of <b>${d.recipe.name}</b> has been enjoyed by the colony.`);
      if (currentTab === "home" && A.renderKettle) A.renderKettle();
      const sceneKettle = $("sceneKettle");
      if (sceneKettle) sceneKettle.classList.remove("simmering");
    });
    bus.on("diveStarted", d => {
      toast(`🤿 Diver plunged into the <b>${d.spot.name}</b>!`, 3500);
      if (currentTab === "home" && A.renderDiving) A.renderDiving();
      if (A.updateSceneIceHole) A.updateSceneIceHole();
    });
    bus.on("diveReady", d => {
      toast(`🤿 <b>Diver Returned!</b> Resurfaced from the ${d.spot.name}. Tap the Ice Hole or visit Home to collect!`);
      if (currentTab === "home" && A.renderDiving) A.renderDiving();
      if (A.updateSceneIceHole) A.updateSceneIceHole();
    });
    bus.on("relicFound", d => {
      if (currentTab === "home") {
        if (A.renderDiving) A.renderDiving();
        if (A.renderRelicShelf) A.renderRelicShelf();
      }
      if (A.updateSceneIceHole) A.updateSceneIceHole();
    });
    bus.on("letterClaimed", d => toast(`💌 You wrote back to <b>${d.l.sender}</b>. +${fmt(d.reward)} fish`));
    bus.on("letterBonus", d => toast(`📦 <b>Care package!</b> Production ×7 for ${d.secs}s.`));
    bus.on("seasonUnlock", d => toast(`${d.season.icon} <b>${d.season.name} gift!</b> New in your wardrobe: ${d.item.name}.`));
    bus.on("migrate", d => toast(d.auto
      ? `🗓️ <b>Planner Pem</b> led the colony to ${d.shore.icon} ${d.shore.name}. +🪶 ${fmt(d.gained)}`
      : `<b>Welcome to ${d.shore.icon} ${d.shore.name}!</b> The colony settles in with 🪶 ${fmt(d.feathers)} feathers.`));
  }

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

  function init() {
    const P = panels(), A = activities(), M_UI = memoriesUI(), S_SC = scene();
    if (P.buildBuildingList) P.buildBuildingList();
    if (P.buildResearch) P.buildResearch();
    if (A.buildTree) A.buildTree();
    if (S_SC.init) S_SC.init();
    wire();
    if (M_UI.bindNapStars) M_UI.bindNapStars();

    const peng = $("bigPenguin");
    wirePatting(peng);
    if (peng) peng.addEventListener("keydown", e => { if (e.repeat && (e.key === " " || e.key === "Enter")) e.preventDefault(); });

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

    document.querySelectorAll("#buyMode button").forEach(btn => btn.addEventListener("click", () => setBuyAmount(btn.dataset.n)));
    const buyAllBtn = $("buyAllBtn");
    if (buyAllBtn) buyAllBtn.addEventListener("click", e => E.buyAllUpgrades(pointFrom(e, buyAllBtn)));
    const migBtn = $("migrateBtn");
    if (migBtn) migBtn.addEventListener("click", () => panels().migrateFlow && panels().migrateFlow());
    const respecBtn = $("respecBtn");
    if (respecBtn) respecBtn.addEventListener("click", () => openModal({
      title: "Refund your heirlooms?",
      body: `<p>Every feather spent in the Heirloom Tree comes back to you, so you can choose a different path.</p>
             <p class="muted">Helpers stay hired, and your production bonus from feathers stays the same. It's free, and you can do it any time.</p>`,
      actions: [{ label: "Keep my tree", cancel: true }, { label: "Refund feathers", primary: true, onClick: () => { E.refundTree(); E.save(); } }],
    }));

    const fireEl = $("colonyFire");
    if (fireEl) {
      const goKettle = () => {
        selectTab("home", true);
        const k = $("campfireKettleUI");
        if (k) k.scrollIntoView({ behavior: "smooth", block: "center" });
      };
      fireEl.addEventListener("click", goKettle);
      fireEl.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goKettle(); } });
    }

    const iceHoleEl = $("iceHole");
    if (iceHoleEl) {
      const handleHole = e => {
        const active = E.activeDive ? E.activeDive() : null;
        if (active && active.ready) {
          const res = E.claimDive();
          if (res) {
            if (A.popRelicReward) A.popRelicReward(res, pointFrom(e, iceHoleEl));
            if (A.renderDiving) A.renderDiving();
            if (A.renderRelicShelf) A.renderRelicShelf();
          }
        } else {
          selectTab("home", true);
          const d = $("divingUI");
          if (d) d.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };
      iceHoleEl.addEventListener("click", handleHole);
      iceHoleEl.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleHole(e); } });
    }

    shownFish = S().fish;
    if (S_SC.rebuildScene) S_SC.rebuildScene(true);
    refreshStructure();
    renderTab(true);
  }

  function setBuyAmount(n) {
    document.querySelectorAll("#buyMode button").forEach(x => {
      const on = x.dataset.n === String(n);
      x.classList.toggle("active", on);
      x.setAttribute("aria-pressed", String(on));
    });
    buyAmount = n === "max" ? "max" : Number(n);
    if (PI.fx && PI.fx.Sound) PI.fx.Sound.play("tick");
    renderTab(false);
    const d = dialogs();
    if (d.tooltipFn) {
      const t = $("tooltip");
      if (t) t.innerHTML = d.tooltipFn();
    }
  }
  const cycleBuyAmount = () => { const order = ["1", "10", "100", "max"]; setBuyAmount(order[(order.indexOf(String(buyAmount)) + 1) % order.length]); };

  PI.ui = {
    init, tick, slowTick, selectTab, bumpCounter,
    cycleBuyAmount, refreshStructure, renderTab, updateBadges, renderNextGoal,
    get currentTab() { return currentTab; },
    get buyAmount() { return buyAmount; },
    setBuyAmount,
    pointFrom,
    isTouch,

    // Dialogs delegation
    openModal,
    closeModal,
    toast,
    afterNap,
    queueMemories,
    hideTooltip,
    closeSheet,
    attachTooltip: (...args) => dialogs().attachTooltip && dialogs().attachTooltip(...args),
    showTooltip: (...args) => dialogs().showTooltip && dialogs().showTooltip(...args),
    selectForSheet: (...args) => dialogs().selectForSheet && dialogs().selectForSheet(...args),
    renderSheet: (...args) => dialogs().renderSheet && dialogs().renderSheet(...args),
    get modalOpen() { return dialogs().modalOpen; },

    // Panels delegation
    buildingRow: id => panels().buildingRow && panels().buildingRow(id),
    buildingTooltip: (...args) => panels().buildingTooltip && panels().buildingTooltip(...args),
    upgradeTooltip: (...args) => panels().upgradeTooltip && panels().upgradeTooltip(...args),
    renderUpgrades: (...args) => panels().renderUpgrades && panels().renderUpgrades(...args),
    tickBuildings: (...args) => panels().tickBuildings && panels().tickBuildings(...args),
    tickUpgrades: (...args) => panels().tickUpgrades && panels().tickUpgrades(...args),
    buildResearch: (...args) => panels().buildResearch && panels().buildResearch(...args),
    tickResearch: (...args) => panels().tickResearch && panels().tickResearch(...args),
    migrateFlow: () => panels().migrateFlow && panels().migrateFlow(),
    renderShores: (...args) => panels().renderShores && panels().renderShores(...args),
    renderPassport: (...args) => panels().renderPassport && panels().renderPassport(...args),
    renderHelpers: (...args) => panels().renderHelpers && panels().renderHelpers(...args),
    renderLetters: (...args) => panels().renderLetters && panels().renderLetters(...args),
    renderWardrobe: (...args) => panels().renderWardrobe && panels().renderWardrobe(...args),

    // Memories delegation
    renderAchievements: (...args) => memoriesUI().renderAchievements && memoriesUI().renderAchievements(...args),
    renderStats: (...args) => memoriesUI().renderStats && memoriesUI().renderStats(...args),
    renderStatsGraph: (...args) => memoriesUI().renderStatsGraph && memoriesUI().renderStatsGraph(...args),
    renderNapStars: (...args) => memoriesUI().renderNapStars && memoriesUI().renderNapStars(...args),
    renderNapStarList: (...args) => memoriesUI().renderNapStarList && memoriesUI().renderNapStarList(...args),
    bindNapStars: (...args) => memoriesUI().bindNapStars && memoriesUI().bindNapStars(...args),

    // Scene & Activities delegation
    spawnGolden: force => scene().spawnGolden && scene().spawnGolden(force),
    chatNow: () => scene().startChat && scene().startChat(),
    workNow: () => scene().startWork && scene().startWork(),
    propNow: () => scene().propAct && scene().propAct(),
    updateSceneIceHole: () => activities().updateSceneIceHole && activities().updateSceneIceHole(),
    buildTree: () => activities().buildTree && activities().buildTree(),
    refreshTree: () => activities().refreshTree && activities().refreshTree(),
    drawTreeLines: () => activities().drawTreeLines && activities().drawTreeLines(),
    renderKettle: () => activities().renderKettle && activities().renderKettle(),
    renderDiving: () => activities().renderDiving && activities().renderDiving(),
    renderRelicShelf: () => activities().renderRelicShelf && activities().renderRelicShelf(),
    popRelicReward: (...args) => activities().popRelicReward && activities().popRelicReward(...args),
  };
})(window.PI = window.PI || {});
