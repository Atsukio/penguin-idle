/* Penguin Idle — UI Panels.
 * Builds and updates the core store tabs: Colony buildings, Upgrades, Workshop research,
 * Migration shores & helpers, Passport stamps, Mailbox letters, and Wardrobe cosmetics.
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

  const dialogs = () => PI.dialogs || PI.ui || {};
  const attachTooltip = (el, fn) => { const d = dialogs(); if (d.attachTooltip) d.attachTooltip(el, fn); };
  const activate = (kind, id, buy) => { const d = dialogs(); if (d.activate) d.activate(kind, id, buy); else buy(); };
  const openModal = opts => { const d = dialogs(); if (d.openModal) return d.openModal(opts); };

  const getBuyAmount = () => (PI.ui && PI.ui.buyAmount != null ? PI.ui.buyAmount : 1);
  const buyCount = b => (getBuyAmount() === "max" ? Math.max(1, E.maxAffordable(b)) : getBuyAmount());

  const els = {};
  let previewId = null;

  // =====================================================================
  // Colony: buildings and upgrades
  // =====================================================================
  function buildingTooltip(b) {
    const n = S().buildings[b.id];
    const next = D.MILESTONES.find(x => x > n);
    const each = E.buildingFps(b.id) * E.buffMult("prod");
    return `<div class="t-name">${b.icon} ${b.name}</div><div>${b.desc}</div><hr>
      <div>Each catches <b>${fmt(each)}</b>/s</div>
      <div>${fmt(n)} owned catch <b>${fmt(each * n)}</b>/s</div>
      ${next ? `<div class="t-cost">At ${next} owned: output ×${+M().milestoneMult.toFixed(2)}</div>` : ""}`;
  }

  function upgradeSubtitle(u) {
    if (u.kind === "building") return `${D.B_BY_ID[u.building].icon} ${D.B_BY_ID[u.building].name} · Tier ${D.TIER_NUMERALS[u.tier]}`;
    if (u.kind === "synergy") return u.pair.map(id => `${D.B_BY_ID[id].icon} ${D.B_BY_ID[id].name}`).join(" + ") + " synergy";
    if (u.kind === "scrapbook") return `Scrapbook upgrade · ${S().achievements.length} memories collected`;
    return { click: "Patting upgrade", global: "Whole-colony upgrade", gold: "Golden fish upgrade" }[u.kind] || "";
  }
  const upgradeTooltip = u => `<div class="t-name">${u.icon} ${u.name}</div><div class="t-sub">${upgradeSubtitle(u)}</div>
    <div>${u.desc}</div><div class="t-cost">🐟 ${fmt(E.upgradeCost(u))}</div>`;

  function buildBuildingList() {
    const list = $("buildings");
    if (!list) return;
    list.innerHTML = "";
    D.BUILDINGS.forEach(b => {
      const el = document.createElement("button");
      el.className = "building";
      el.innerHTML = `
        <div class="icon" aria-hidden="true">${b.icon}</div>
        <div>
          <div class="name">${b.name}</div>
          <div class="desc b-fps"></div>
          <div class="milestone-bar" aria-hidden="true"><div></div></div>
        </div>
        <div class="b-right"><span class="b-cost cost"></span><span class="owned" aria-hidden="true">0</span></div>`;
      el.addEventListener("click", e => activate("building", b.id, () => E.buyBuilding(b.id, buyCount(b), pointFrom(e, el))));
      attachTooltip(el, () => buildingTooltip(b));
      const preview = on => () => { if (on) previewId = b.id; else if (previewId === b.id) previewId = null; paintBuilding(b); };
      el.addEventListener("mouseenter", preview(true));
      el.addEventListener("mouseleave", preview(false));
      el.addEventListener("focus", preview(true));
      el.addEventListener("blur", preview(false));
      list.appendChild(el);
      els[b.id] = {
        root: el, cost: el.querySelector(".b-cost"), fps: el.querySelector(".b-fps"),
        owned: el.querySelector(".owned"), bar: el.querySelector(".milestone-bar > div"),
      };
    });
  }

  function paintBuilding(b) {
    const e = els[b.id];
    if (!e) return;
    const n = buyCount(b);
    const d = dialogs();
    const sheetSel = d.sheetSel;
    const p = (previewId === b.id || (sheetSel && sheetSel.kind === "building" && sheetSel.id === b.id)) && n > 1 && !e.root.disabled
      ? E.previewBuy(b.id, n) : null;
    const owned = p ? p.owned : S().buildings[b.id];
    const each = p ? p.each : E.buildingFps(b.id);
    e.root.classList.toggle("previewing", !!p);
    setText(e.owned, String(owned));
    const buff = E.buffMult("prod");
    setText(e.fps, owned > 0 ? `${fmt(each * owned * buff)}/s · ${fmt(each * buff)} each` : `${fmt(each * buff)}/s each`);
    const prev = [0, ...D.MILESTONES].filter(x => x <= owned).pop();
    const next = D.MILESTONES.find(x => x > owned);
    e.bar.style.width = next ? `${((owned - prev) / (next - prev)) * 100}%` : "100%";
  }
  const refreshBuildings = () => D.BUILDINGS.forEach(paintBuilding);

  function tickBuildings() {
    let revealNext = true;
    const d = dialogs();
    const sheetSel = d.sheetSel;
    D.BUILDINGS.forEach((b, i) => {
      const e = els[b.id], owned = S().buildings[b.id];
      if (!e) return;
      const visible = E.buildingVisible(b, i);
      e.root.classList.toggle("hidden", !visible && !revealNext);
      e.root.classList.toggle("locked", !visible);
      e.root.disabled = !visible;
      if (!visible) revealNext = false;
      const n = buyCount(b);
      const cost = E.costOf(b, owned, n);
      if (previewId === b.id || e.root.classList.contains("previewing") || (sheetSel && sheetSel.id === b.id)) paintBuilding(b);
      setText(e.cost, `${n > 1 || getBuyAmount() === "max" ? `${n}× ` : ""}🐟 ${fmt(cost)}`);
      const can = S().fish >= cost;
      e.root.classList.toggle("affordable", can);
      e.root.setAttribute("aria-label", visible
        ? `${b.name}: buy ${n} for ${fmt(cost)} fish${can ? "" : " (not enough fish)"}. You own ${owned}.`
        : "Undiscovered colony member");
    });
  }

  let lastUpgradeKey = "";
  function renderUpgrades(force = false) {
    const ups = E.availableUpgrades();
    const key = ups.map(u => u.id).join(",");
    const grid = $("upgrades");
    if (!grid) return;
    if (key !== lastUpgradeKey || force) {
      const hadFocus = grid.contains(document.activeElement);
      lastUpgradeKey = key;
      grid.innerHTML = "";
      ups.forEach(u => {
        const el = document.createElement("button");
        el.className = `upgrade kind-${u.kind}`;
        el.dataset.id = u.id;
        el.innerHTML = `<span class="u-icon" aria-hidden="true">${u.icon}</span>` +
          (u.kind === "building" ? `<span class="u-badge tier-${u.tier}" aria-hidden="true">${D.TIER_NUMERALS[u.tier]}</span>` : "");
        el.setAttribute("aria-label", `${u.name}, ${upgradeSubtitle(u)}: ${u.desc} Costs ${fmt(E.upgradeCost(u))} fish.`);
        el.addEventListener("click", e => activate("upgrade", u.id, () => E.buyUpgrade(u.id, pointFrom(e, el))));
        attachTooltip(el, () => upgradeTooltip(u));
        grid.appendChild(el);
      });
      const noUp = $("noUpgrades");
      if (noUp) noUp.classList.toggle("hidden", ups.length > 0);
      if (hadFocus) (grid.firstElementChild || $("buildings").querySelector(".building:not(.hidden)")).focus({ preventScroll: true });
      const d = dialogs();
      if (d.sheetSel && d.sheetSel.kind === "upgrade" && d.selectForSheet) d.selectForSheet("upgrade", d.sheetSel.id);
    }
  }

  function tickUpgrades() {
    let affordable = 0;
    const grid = $("upgrades");
    if (!grid) return;
    grid.querySelectorAll(".upgrade").forEach(el => {
      const can = S().fish >= E.upgradeCost(D.UP_BY_ID[el.dataset.id]);
      if (can) affordable++;
      el.classList.toggle("affordable", can);
    });
    const btn = $("buyAllBtn");
    if (btn) {
      btn.disabled = affordable === 0;
      setText(btn, affordable ? `Buy all (${affordable})` : "Buy all");
    }
  }

  // =====================================================================
  // Workshop
  // =====================================================================
  function buildResearch() {
    const list = $("research");
    if (!list) return;
    list.innerHTML = "";
    D.RESEARCH.forEach(r => {
      const el = document.createElement("button");
      el.className = "research";
      el.dataset.id = r.id;
      el.innerHTML = `
        <div class="icon" aria-hidden="true">${r.icon}</div>
        <div>
          <div class="name">${r.name} <span class="r-level"></span> <span class="cost r-cost"></span></div>
          <div class="desc r-effect"></div>
          <div class="r-bar" aria-hidden="true"><div></div></div>
        </div>`;
      el.addEventListener("click", e => E.buyResearch(r.id, pointFrom(e, el)));
      list.appendChild(el);
    });
  }

  function tickResearch() {
    const list = $("research");
    if (!list) return;
    list.querySelectorAll(".research").forEach(el => {
      const r = D.R_BY_ID[el.dataset.id], L = E.researchLevel(r.id);
      const unlocked = E.researchUnlocked(r), maxed = L >= r.max;
      const cost = E.researchCost(r, L), can = unlocked && !maxed && S().fish >= cost;
      el.classList.toggle("locked", !unlocked);
      el.classList.toggle("maxed", maxed);
      el.classList.toggle("affordable", can);
      el.disabled = !unlocked || maxed;
      setText(el.querySelector(".r-level"), unlocked ? `Lv ${L}/${r.max}` : "");
      const effect = !unlocked ? `Unlocks after catching ${fmt(r.unlockAt)} fish this migration`
        : maxed ? r.text(L) : L ? `${r.text(L)} → ${r.text(L + 1)}` : `First level: ${r.text(1)}`;
      setText(el.querySelector(".r-effect"), effect);
      setText(el.querySelector(".r-cost"), !unlocked ? "🔒" : maxed ? "✔ Maxed" : `🐟 ${fmt(cost)}`);
      el.querySelector(".r-bar > div").style.width = `${(L / r.max) * 100}%`;
      el.setAttribute("aria-label", unlocked
        ? `${r.name}, level ${L} of ${r.max}. ${effect}.${maxed ? "" : ` Costs ${fmt(cost)} fish${can ? "" : " (not enough fish)"}.`}`
        : `${r.name}: ${effect}.`);
    });
  }

  // ---------- Moved to src/ui/community.js: migration, shores, passport stamps, helpers, letters and wardrobe ----------
  function migrateIsGood(...args) { return PI.uiCommunity.migrateIsGood(...args); }
  function tickMigration(...args) { return PI.uiCommunity.tickMigration(...args); }
  function migrateFlow(...args) { return PI.uiCommunity.migrateFlow(...args); }
  function renderShores(...args) { return PI.uiCommunity.renderShores(...args); }
  function renderPassport(...args) { return PI.uiCommunity.renderPassport(...args); }
  function renderHelpers(...args) { return PI.uiCommunity.renderHelpers(...args); }
  function renderLetters(...args) { return PI.uiCommunity.renderLetters(...args); }
  function renderWardrobe(...args) { return PI.uiCommunity.renderWardrobe(...args); }

  PI.panels = {
    buyCount,
    buildingTooltip,
    upgradeSubtitle,
    upgradeTooltip,
    buildBuildingList,
    paintBuilding,
    refreshBuildings,
    tickBuildings,
    renderUpgrades,
    tickUpgrades,
    buildResearch,
    tickResearch,
    migrateIsGood,
    tickMigration,
    migrateFlow,
    renderShores,
    renderPassport,
    renderHelpers,
    renderLetters,
    renderWardrobe,
    buildingRow: id => els[id] && els[id].root,
  };

  // Backward-compatibility delegation on PI.ui
  PI.ui = PI.ui || {};
  PI.ui.buildingTooltip = buildingTooltip;
  PI.ui.upgradeTooltip = upgradeTooltip;
  PI.ui.buildBuildingList = buildBuildingList;
  PI.ui.paintBuilding = paintBuilding;
  PI.ui.refreshBuildings = refreshBuildings;
  PI.ui.tickBuildings = tickBuildings;
  PI.ui.renderUpgrades = renderUpgrades;
  PI.ui.tickUpgrades = tickUpgrades;
  PI.ui.buildResearch = buildResearch;
  PI.ui.tickResearch = tickResearch;
  PI.ui.tickMigration = tickMigration;
  PI.ui.migrateFlow = migrateFlow;
  PI.ui.renderShores = renderShores;
  PI.ui.renderPassport = renderPassport;
  PI.ui.renderHelpers = renderHelpers;
  PI.ui.renderLetters = renderLetters;
  PI.ui.renderWardrobe = renderWardrobe;
  PI.ui.buildingRow = id => els[id] && els[id].root;
})(window.PI = window.PI || {});
