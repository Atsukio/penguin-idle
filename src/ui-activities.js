/* Penguin Idle — Campfire Kettle cooking, Diving Expeditions & Relics collection shelf. */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data, fmt = PI.fmt, fmtTime = PI.fmtTime;
  const S = () => E.state;
  const $ = id => document.getElementById(id);
  const setHTML = (el, v) => { if (el && el.dataset.html !== v) { el.dataset.html = v; el.innerHTML = v; return true; } return false; };

  const pointFrom = (e, el) => {
    if (e && e.clientX) return { x: e.clientX, y: e.clientY };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // =====================================================================
  // Campfire Kettle
  // =====================================================================
  function renderKettle() {
    const box = $("campfireKettleUI");
    if (!box) return;
    const active = E.activeDish ? E.activeDish() : null;
    const sceneKettle = $("sceneKettle");
    if (sceneKettle) sceneKettle.classList.toggle("simmering", !!active);

    let activeBanner = "";
    if (active) {
      const remSecs = Math.ceil(active.remaining);
      const pct = Math.floor(active.frac * 100);
      activeBanner = `<div class="kettle-active-card">
          <div class="k-act-head">
            <span class="k-act-icon" aria-hidden="true">${active.icon}</span>
            <div class="k-act-info"><div class="k-act-title"><b>${active.name}</b> · Simmering</div><div class="k-act-sub">${active.effectDesc}</div></div>
            <span class="k-act-timer" aria-live="off">⏱️ ${fmtTime(remSecs)}</span>
          </div>
          <div class="k-act-bar" aria-hidden="true"><div style="width:${pct}%"></div></div>
        </div>`;
    } else {
      activeBanner = `<div class="kettle-idle-banner"><span class="k-idle-icon" aria-hidden="true">🫖</span><div><b>The kettle is waiting over the embers.</b><div class="muted">Simmer a meal below for a cozy boost to fishing, patting, or offline rest.</div></div></div>`;
    }

    const recipesHtml = D.COOKING_RECIPES.map(r => {
      const unlocked = E.recipeUnlocked(r);
      const isCookingThis = active && active.id === r.id;
      const cost = E.recipeCost(r);
      const canAfford = S().fish >= cost;
      const durStr = fmtTime(r.duration);
      let actionHtml = !unlocked ? `<span class="k-lock">🔒 Needs ${fmt(r.unlockLifetime)} lifetime fish</span>`
        : isCookingThis ? `<span class="k-serving">✔ Simmering now</span>`
        : `<button class="btn small primary k-cook-btn" data-cook="${r.id}"${canAfford ? "" : " disabled"}>${active ? "Switch dish" : "Simmer"} · 🐟 ${fmt(cost)}</button>`;

      return `<div class="recipe-card${isCookingThis ? " cooking" : ""}${unlocked ? "" : " locked"}">
          <div class="r-head"><div class="r-icon" aria-hidden="true">${r.icon}</div><div class="r-meta"><div class="r-title">${r.name}</div><div class="r-dur">⏳ ${durStr} · ${r.flavor}</div></div></div>
          <div class="r-effect"><b>Effect:</b> ${r.effectDesc}</div>
          <div class="r-foot">${actionHtml}</div>
        </div>`;
    }).join("");

    if (setHTML(box, `${activeBanner}<div class="recipes-grid">${recipesHtml}</div>`)) {
      box.querySelectorAll("[data-cook]").forEach(btn => {
        btn.addEventListener("click", e => { E.cookRecipe(btn.dataset.cook, pointFrom(e, btn)); renderKettle(); });
      });
    }
  }

  // =====================================================================
  // Diving Expeditions & Relics
  // =====================================================================
  function updateSceneIceHole() {
    const hole = $("iceHole");
    if (!hole) return;
    const hasColony = D.BUILDINGS.some(b => S().buildings[b.id] > 0);
    hole.classList.toggle("hidden", !hasColony);
    const diver = $("holeDiver"), chest = $("holeChest");
    const active = E.activeDive ? E.activeDive() : null;
    if (active) {
      if (active.ready) {
        if (diver) diver.classList.add("hidden");
        if (chest) { chest.classList.remove("hidden"); chest.classList.add("pulse"); }
      } else {
        if (chest) chest.classList.add("hidden");
        if (diver) { diver.classList.remove("hidden"); diver.classList.add("bobbing"); }
      }
    } else {
      if (diver) diver.classList.add("hidden");
      if (chest) chest.classList.add("hidden");
    }
  }

  function renderDiving() {
    const box = $("divingUI");
    if (!box) return;
    updateSceneIceHole();
    const active = E.activeDive ? E.activeDive() : null;
    const spend = E.spendableFeathers();
    const diverHired = "diver" in S().helpers, diverOn = E.helperOn("diver");
    const curDiverStrat = E.diverStrategy ? E.diverStrategy() : (S().diverStrategy || "hunter");

    let autoBarHtml = "";
    if (diverHired) {
      autoBarHtml = `<div class="dive-auto-bar">
          <div class="d-auto-left"><span class="d-auto-badge">🥽 Diver Marina</span><button class="btn small toggle${diverOn ? " on" : ""}" id="diverAutoToggle" aria-pressed="${diverOn}">Auto-Dive: ${diverOn ? "ON" : "OFF"}</button></div>
          <div class="strat-pills">${D.DIVER_STRATEGIES.map(st => `<button class="strat-pill${curDiverStrat === st.id ? " active" : ""}" data-diver-strat="${st.id}" aria-pressed="${curDiverStrat === st.id}" title="${st.desc}"><span>${st.icon}</span> ${st.label}</button>`).join("")}</div>
        </div>`;
    } else {
      const diverCost = (D.HELPER_BY_ID.diver && D.HELPER_BY_ID.diver.cost) || 100;
      autoBarHtml = `<div class="dive-auto-hire-banner"><span class="d-hire-icon" aria-hidden="true">🥽</span><div class="d-hire-info"><b>Automate Expeditions with Diver Marina</b><div class="muted">Hire Diver Marina in the Heritage tab to automatically claim relics and re-plunge into expeditions.</div></div>${spend >= diverCost ? `<button class="btn small primary" id="quickHireDiver">Hire · 🪶 ${fmt(diverCost)}</button>` : `<button class="btn small" id="gotoHeritageBtn">View in Heritage →</button>`}</div>`;
    }

    let activeBanner = "";
    if (active) {
      if (active.ready) {
        activeBanner = `<div class="dive-ready-card"><div class="d-ready-head"><span class="d-ready-icon" aria-hidden="true">🎁</span><div class="d-ready-info"><div class="d-ready-title"><b>Diver Returned!</b> · Ready to claim</div><div class="d-ready-sub">Your diver has resurfaced from the ${active.spot.name} with an ancient deep-sea treasure!</div></div><button class="btn primary d-claim-btn" id="claimDiveBtn">🦪 Open Treasure</button></div></div>`;
      } else {
        const remSecs = active.remaining, pct = Math.floor(active.progress * 100);
        activeBanner = `<div class="dive-active-card"><div class="d-act-head"><span class="d-act-icon" aria-hidden="true">🤿</span><div class="d-act-info"><div class="d-act-title"><b>Diving in progress</b> · ${active.spot.name}</div><div class="d-act-sub">${active.spot.desc}</div></div><span class="d-act-timer" aria-live="off">⏱️ ${fmtTime(remSecs)}</span></div><div class="d-act-bar" aria-hidden="true"><div style="width:${pct}%"></div></div></div>`;
      }
    } else {
      activeBanner = `<div class="dive-idle-banner"><span class="d-idle-icon" aria-hidden="true">🤿</span><div><b>The ice hole is open and clear.</b><div class="muted">Send an expedition diver below to scavenge underwater relics for your collection shelf.</div></div></div>`;
    }

    const spotsHtml = D.DIVE_SPOTS.map(spot => {
      const unlocked = E.diveSpotUnlocked(spot), isThisActive = active && active.spotId === spot.id, durStr = fmtTime(spot.duration);
      const relicIconsHtml = (spot.relics || []).map(rId => {
        const r = D.RELIC_BY_ID[rId]; if (!r) return "";
        const lvl = E.relicLevel(rId), stars = lvl === 0 ? "☆☆☆" : "★".repeat(lvl) + "☆".repeat(3 - lvl);
        return `<span class="spot-relic-pill${lvl > 0 ? " owned" : ""}" title="${r.name} (${lvl}/3 stars: ${r.effect})">${r.icon} <span class="stars">${stars}</span></span>`;
      }).join(" ");
      let actionHtml = !unlocked ? `<span class="d-lock">🔒 Needs ${fmt(spot.unlockLifetime)} lifetime fish</span>`
        : isThisActive ? `<span class="d-active-label">${active.ready ? "✔ Dive complete!" : "⏳ Diver submerged"}</span>`
        : active ? `<button class="btn small primary" disabled>Diver busy</button>`
        : `<button class="btn small primary d-start-btn" data-spot="${spot.id}">Plunge Diver (${durStr})</button>`;

      return `<div class="dive-spot-card${isThisActive ? " active" : ""}${unlocked ? "" : " locked"}">
          <div class="d-head"><div class="d-icon" aria-hidden="true">${spot.icon}</div><div class="d-meta"><div class="d-title">${spot.name}</div><div class="d-dur">⏱️ ${durStr} · ${spot.desc}</div></div></div>
          <div class="d-relics-pool"><span class="d-pool-label">Relic Pool:</span><div class="d-pool-list">${relicIconsHtml}</div></div>
          <div class="d-foot">${actionHtml}</div>
        </div>`;
    }).join("");

    if (setHTML(box, `${autoBarHtml}${activeBanner}<div class="dive-spots-grid">${spotsHtml}</div>`)) {
      const autoToggle = box.querySelector("#diverAutoToggle");
      if (autoToggle) autoToggle.addEventListener("click", () => { E.toggleHelper("diver"); renderDiving(); });
      box.querySelectorAll("[data-diver-strat]").forEach(btn => btn.addEventListener("click", () => { E.setDiverStrategy(btn.dataset.diverStrat); renderDiving(); }));
      const hireBtn = box.querySelector("#quickHireDiver");
      if (hireBtn) hireBtn.addEventListener("click", e => { E.hireHelper("diver", pointFrom(e, hireBtn)); renderDiving(); });
      const gotoHeritageBtn = box.querySelector("#gotoHeritageBtn");
      if (gotoHeritageBtn) gotoHeritageBtn.addEventListener("click", () => { if (PI.ui && PI.ui.selectTab) PI.ui.selectTab("heritage", true); const h = $("helpers"); if (h) h.scrollIntoView({ behavior: "smooth", block: "center" }); });
      box.querySelectorAll("[data-spot]").forEach(btn => btn.addEventListener("click", () => { if (E.startDive(btn.dataset.spot)) renderDiving(); }));
      const claimBtn = box.querySelector("#claimDiveBtn");
      if (claimBtn) claimBtn.addEventListener("click", e => {
        const res = E.claimDive();
        if (res) { popRelicReward(res, pointFrom(e, claimBtn)); renderDiving(); renderRelicShelf(); }
      });
    }
  }

  function renderRelicShelf() {
    const box = $("relicShelfUI");
    if (!box) return;
    const cardsHtml = D.RELICS.map(r => {
      const lvl = E.relicLevel(r.id), discovered = lvl > 0;
      const stars = lvl === 0 ? "☆☆☆" : "★".repeat(lvl) + "☆".repeat(3 - lvl);
      const multText = lvl === 1 ? " (1× bonus)" : lvl === 2 ? " (1.5× bonus)" : lvl === 3 ? " (MAX 2× bonus)" : "";
      return `<div class="relic-card${discovered ? " discovered" : " mystery"}">
          <div class="relic-icon-wrap" aria-hidden="true"><span class="relic-icon">${discovered ? r.icon : "❔"}</span></div>
          <div class="relic-meta">
            <div class="relic-title">${discovered ? r.name : "Undiscovered Relic"}</div>
            <div class="relic-stars" aria-label="${lvl} of 3 stars">${stars} <span class="lvl-label">${lvl > 0 ? `Lvl ${lvl}/3` : "Locked"}</span></div>
            <div class="relic-desc">${discovered ? r.desc : "Plunge into deep waters to recover this ancient artifact."}</div>
            <div class="relic-perk"><b>Perk:</b> ${r.effect}${multText}</div>
          </div>
        </div>`;
    }).join("");
    setHTML(box, `<div class="relic-grid">${cardsHtml}</div>`);
  }

  function popRelicReward(res, origin) {
    const toast = PI.ui && PI.ui.toast ? PI.ui.toast : () => {};
    if (res.auto) {
      if (res.relic) toast(`🥽 <b>Diver Marina retrieved: ${res.relic.icon} ${res.relic.name}</b> (Lvl ${res.level})`, 3000);
      else if (res.bonusFish > 0) toast(`🥽 <b>Diver Marina retrieved +${fmt(res.bonusFish)} fish</b> from the deep!`, 3000);
      return;
    }
    if (res.relic) {
      const stars = "★".repeat(res.level) + "☆".repeat(3 - res.level);
      toast(`<b>${res.relic.icon} ${res.relic.name}</b> (${stars})<br>${res.relic.effect} (Level ${res.level} active!)`);
    } else if (res.bonusFish > 0) {
      toast(`<b>🎁 Deep-Sea Bounty!</b><br>All relics here are maxed! Retrieved +${fmt(res.bonusFish)} fish from the depths.`);
    }
  }

  const tree = () => PI.uiTree || {};

  PI.activities = {
    buildTree: () => tree().buildTree && tree().buildTree(),
    nodeState: (...args) => tree().nodeState && tree().nodeState(...args),
    refreshTree: () => tree().refreshTree && tree().refreshTree(),
    renderInspector: () => tree().renderInspector && tree().renderInspector(),
    drawTreeLines: () => tree().drawTreeLines && tree().drawTreeLines(),
    renderKettle,
    updateSceneIceHole,
    renderDiving,
    renderRelicShelf,
    popRelicReward,
  };
})(window.PI = window.PI || {});
