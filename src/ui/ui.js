/* Penguin Idle — User Interface Shell & Frame Loop.
 * Coordinates tabs, top bar stats, rolling fish counters, patting interactions,
 * and 60fps frame loop tickers, delegating tab views to specialized modules:
 *   - src/ui-dialogs.js: Modals, Toasts, Tooltips, Touch Sheet
 *   - src/ui-memories.js: Memories (101 achievements), Statistics, SVG History Graph, Nap Stars
 *   - src/ui-panels.js: Colony buildings, Upgrades, Workshop research, Migration/Shores, Helpers, Letters & Wardrobe
 *   - src/ui-activities.js: Heirloom Tree, Campfire Kettle cooking, Diving & Relics
 *   - src/scene.js: Canvas colony landscape, waddlers, chatter, animated props
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

  const topbar = () => PI.uiTopbar || {};
  const updateBadges = () => topbar().updateBadges && topbar().updateBadges();
  const renderLetterReset = () => topbar().renderLetterReset && topbar().renderLetterReset();
  const renderNextGoal = () => topbar().renderNextGoal && topbar().renderNextGoal();
  const bumpCounter = () => topbar().bumpCounter && topbar().bumpCounter();
  const tick = () => topbar().tick && topbar().tick();
  const slowTick = () => topbar().slowTick && topbar().slowTick();
  const getShownFish = () => (topbar().shownFish != null ? topbar().shownFish : 0);
  const setShownFish = v => { if (topbar().shownFish != null) topbar().shownFish = v; };

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

  const wire = () => PI.uiInteractions && PI.uiInteractions.wire();
  const wirePatting = peng => PI.uiInteractions && PI.uiInteractions.wirePatting(peng);

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

    setShownFish(S().fish);
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
    setShownFish,
    get shownFish() { return getShownFish(); },
    renderTab,
    refreshStructure,
    updateBadges,

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
