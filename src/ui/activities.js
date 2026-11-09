/* Penguin Idle — activities and minigames UI.
 * Handles the Heirloom Tree SVG visualization, Campfire Kettle cooking,
 * and deep-sea Diving Expeditions & Relics collection shelf.
 */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data, fmt = PI.fmt, fmtTime = PI.fmtTime;
  const S = () => E.state;
  const $ = id => document.getElementById(id);
  const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
  const setHTML = (el, v) => { if (el && el.dataset.html !== v) { el.dataset.html = v; el.innerHTML = v; return true; } return false; };

  const pointFrom = (e, el) => {
    if (e && e.clientX) return { x: e.clientX, y: e.clientY };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // =====================================================================
  // Heirloom Tree
  // =====================================================================
  let selectedNode = "spirit";

  function buildTree() {
    const tree = $("tree");
    if (!tree) return;
    tree.innerHTML = "";
    D.TREE.forEach(n => {
      const el = document.createElement("button");
      el.className = "node";
      el.dataset.id = n.id;
      el.style.gridColumn = String(n.x + 1);
      el.style.gridRow = String(n.y + 1);
      el.innerHTML = `<span class="n-icon" aria-hidden="true">${n.icon}</span><span class="n-level" aria-hidden="true"></span>`;
      el.addEventListener("click", () => { selectedNode = n.id; refreshTree(); });
      el.addEventListener("dblclick", e => E.learnNode(n.id, pointFrom(e, el)));
      tree.appendChild(el);
    });
    if (window.ResizeObserver) new ResizeObserver(() => drawTreeLines()).observe($("treeWrap"));
  }

  function nodeState(n) {
    const L = E.nodeLevel(n.id);
    if (L >= n.max) return "maxed";
    if (!E.nodeReqsMet(n)) return "locked";
    return E.spendableFeathers() >= E.nodeCost(n, L) ? "available" : "waiting";
  }

  function refreshTree() {
    const tree = $("tree");
    if (!tree) return;
    tree.querySelectorAll(".node").forEach(el => {
      const n = D.H_BY_ID[el.dataset.id], L = E.nodeLevel(n.id), st = nodeState(n);
      el.className = `node branch-${n.branch} state-${st}${L > 0 ? " learned" : ""}${n.capstone ? " capstone" : ""}${n.tier2 ? " tier2" : ""}${n.id === selectedNode ? " selected" : ""}`;
      setText(el.querySelector(".n-level"), n.max > 1 ? `${L}/${n.max}` : L ? "✔" : "");
      el.setAttribute("aria-label", `${n.name}${n.capstone ? (n.tier2 ? " (tier-2 capstone)" : " (capstone)") : ""}, ${n.max > 1 ? `level ${L} of ${n.max}` : L ? "learned" : "not learned"}${st === "locked" ? ", locked" : st === "available" ? ", can learn" : ""}`);
      el.setAttribute("aria-current", n.id === selectedNode ? "true" : "false");
    });
    setText($("featherSpendable"), fmt(E.spendableFeathers()));
    const respecBtn = $("respecBtn");
    if (respecBtn) respecBtn.disabled = !Object.keys(S().heritage).length;
    renderInspector();
    drawTreeLines();
  }

  function renderInspector() {
    const n = D.H_BY_ID[selectedNode], L = E.nodeLevel(n.id), maxed = L >= n.max;
    const cost = maxed ? 0 : E.nodeCost(n, L);
    const names = ids => ids.map(id => `${D.H_BY_ID[id].icon} ${D.H_BY_ID[id].name}`);
    const req = E.nodeReqsMet(n) ? "" : n.requiresAny ? `Needs any one of: ${names(n.requiresAny).join(", ")}` : `Needs: ${names(n.requires).join(" and ")}`;
    const canLearn = n.id !== "spirit" && !maxed && !req && E.spendableFeathers() >= cost;
    const label = n.id === "spirit" ? "Always yours" : maxed ? "✔ Fully learned" : `${L ? "Level up" : "Learn"} · 🪶 ${fmt(cost)}`;
    const capHtml = n.capstone ? (n.tier2 ? ' <span class="cap tier2">Tier-2 Capstone</span>' : ' <span class="cap">Capstone</span>') : "";
    const html = `
      <div class="i-icon" aria-hidden="true">${n.icon}</div>
      <div class="i-body">
        <div class="name">${n.name}${capHtml}</div>
        <div class="i-sub">${D.BRANCH_NAMES[n.branch]} · ${n.max > 1 ? `Level ${L}/${n.max}` : L ? "Learned" : "Not learned"}</div>
        ${L > 0 ? `<div><b>Now:</b> ${n.text(L)}</div>` : ""}
        ${!maxed ? `<div><b>${L ? "Next" : "Gives"}:</b> ${n.text(L + 1)}</div>` : ""}
        ${req ? `<div class="i-req">🔒 ${req}</div>` : ""}
      </div>
      <button class="btn primary" id="learnBtn"${canLearn ? "" : " disabled"}>${label}</button>`;
    const box = $("treeInspector");
    if (!box) return;
    const hadFocus = document.activeElement && document.activeElement.id === "learnBtn";
    if (!setHTML(box, html)) return;
    const btn = $("learnBtn");
    btn.addEventListener("click", e => E.learnNode(n.id, pointFrom(e, btn)));
    // Keep keyboard focus in place after levelling up; fall back to the node if the button is now disabled
    if (hadFocus) (btn.disabled ? $("tree").querySelector(`[data-id="${n.id}"]`) : btn).focus({ preventScroll: true });
  }

  function drawTreeLines() {
    const wrap = $("treeWrap"), svg = $("treeLines");
    if (!wrap || !wrap.offsetParent || !svg) return;   // tab hidden; redrawn when it opens
    const wr = wrap.getBoundingClientRect();
    svg.setAttribute("width", wr.width);
    svg.setAttribute("height", wr.height);
    svg.setAttribute("viewBox", `0 0 ${wr.width} ${wr.height}`);
    const centre = id => {
      const el = $("tree").querySelector(`[data-id="${id}"]`);
      if (!el) return [0, 0];
      const r = el.getBoundingClientRect();
      return [r.left - wr.left + r.width / 2, r.top - wr.top + r.height / 2];
    };
    let out = "";
    D.TREE.forEach(n => {
      [...(n.requires || []), ...(n.requiresAny || [])].forEach(p => {
        const [x1, y1] = centre(p), [x2, y2] = centre(n.id);
        const cls = E.nodeLevel(n.id) > 0 ? "learned" : E.nodeLevel(p) > 0 ? "open" : "closed";
        out += `<line class="${cls}${n.requiresAny ? " any" : ""}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
      });
    });
    svg.innerHTML = out;
  }

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
      activeBanner = `
        <div class="kettle-active-card">
          <div class="k-act-head">
            <span class="k-act-icon" aria-hidden="true">${active.icon}</span>
            <div class="k-act-info">
              <div class="k-act-title"><b>${active.name}</b> · Simmering</div>
              <div class="k-act-sub">${active.effectDesc}</div>
            </div>
            <span class="k-act-timer" aria-live="off">⏱️ ${fmtTime(remSecs)}</span>
          </div>
          <div class="k-act-bar" aria-hidden="true"><div style="width:${pct}%"></div></div>
        </div>`;
    } else {
      activeBanner = `
        <div class="kettle-idle-banner">
          <span class="k-idle-icon" aria-hidden="true">🫖</span>
          <div>
            <b>The kettle is waiting over the embers.</b>
            <div class="muted">Simmer a meal below for a cozy boost to fishing, patting, or offline rest.</div>
          </div>
        </div>`;
    }

    const recipesHtml = D.COOKING_RECIPES.map(r => {
      const unlocked = E.recipeUnlocked(r);
      const isCookingThis = active && active.id === r.id;
      const cost = E.recipeCost(r);
      const canAfford = S().fish >= cost;
      const durStr = fmtTime(r.duration);

      let actionHtml = "";
      if (!unlocked) {
        actionHtml = `<span class="k-lock">🔒 Needs ${fmt(r.unlockLifetime)} lifetime fish</span>`;
      } else if (isCookingThis) {
        actionHtml = `<span class="k-serving">✔ Simmering now</span>`;
      } else {
        actionHtml = `<button class="btn small primary k-cook-btn" data-cook="${r.id}"${canAfford ? "" : " disabled"}>
          ${active ? "Switch dish" : "Simmer"} · 🐟 ${fmt(cost)}
        </button>`;
      }

      return `
        <div class="recipe-card${isCookingThis ? " cooking" : ""}${unlocked ? "" : " locked"}">
          <div class="r-head">
            <div class="r-icon" aria-hidden="true">${r.icon}</div>
            <div class="r-meta">
              <div class="r-title">${r.name}</div>
              <div class="r-dur">⏳ ${durStr} · ${r.flavor}</div>
            </div>
          </div>
          <div class="r-effect"><b>Effect:</b> ${r.effectDesc}</div>
          <div class="r-foot">${actionHtml}</div>
        </div>`;
    }).join("");

    const fullHtml = `${activeBanner}<div class="recipes-grid">${recipesHtml}</div>`;
    if (setHTML(box, fullHtml)) {
      box.querySelectorAll("[data-cook]").forEach(btn => {
        btn.addEventListener("click", e => {
          const id = btn.dataset.cook;
          E.cookRecipe(id, pointFrom(e, btn));
          renderKettle();
        });
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
    const diver = $("holeDiver");
    const chest = $("holeChest");
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
    const diverHired = "diver" in S().helpers;
    const diverOn = E.helperOn("diver");
    const curDiverStrat = E.diverStrategy ? E.diverStrategy() : (S().diverStrategy || "hunter");

    let autoBarHtml = "";
    if (diverHired) {
      autoBarHtml = `
        <div class="dive-auto-bar">
          <div class="d-auto-left">
            <span class="d-auto-badge">🥽 Diver Marina</span>
            <button class="btn small toggle${diverOn ? " on" : ""}" id="diverAutoToggle" aria-pressed="${diverOn}">
              Auto-Dive: ${diverOn ? "ON" : "OFF"}
            </button>
          </div>
          <div class="strat-pills">
            ${D.DIVER_STRATEGIES.map(st => `
              <button class="strat-pill${curDiverStrat === st.id ? " active" : ""}" data-diver-strat="${st.id}" aria-pressed="${curDiverStrat === st.id}" title="${st.desc}">
                <span>${st.icon}</span> ${st.label}
              </button>
            `).join("")}
          </div>
        </div>`;
    } else {
      const diverCost = (D.HELPER_BY_ID.diver && D.HELPER_BY_ID.diver.cost) || 100;
      const canHire = spend >= diverCost;
      autoBarHtml = `
        <div class="dive-auto-hire-banner">
          <span class="d-hire-icon" aria-hidden="true">🥽</span>
          <div class="d-hire-info">
            <b>Automate Expeditions with Diver Marina</b>
            <div class="muted">Hire Diver Marina in the Heritage tab to automatically claim relics and re-plunge into expeditions.</div>
          </div>
          ${canHire ? `<button class="btn small primary" id="quickHireDiver">Hire · 🪶 ${fmt(diverCost)}</button>` : `<button class="btn small" id="gotoHeritageBtn">View in Heritage →</button>`}
        </div>`;
    }

    let activeBanner = "";
    if (active) {
      if (active.ready) {
        activeBanner = `
          <div class="dive-ready-card">
            <div class="d-ready-head">
              <span class="d-ready-icon" aria-hidden="true">🎁</span>
              <div class="d-ready-info">
                <div class="d-ready-title"><b>Diver Returned!</b> · Ready to claim</div>
                <div class="d-ready-sub">Your diver has resurfaced from the ${active.spot.name} with an ancient deep-sea treasure!</div>
              </div>
              <button class="btn primary d-claim-btn" id="claimDiveBtn">🦪 Open Treasure</button>
            </div>
          </div>`;
      } else {
        const remSecs = active.remaining;
        const pct = Math.floor(active.progress * 100);
        activeBanner = `
          <div class="dive-active-card">
            <div class="d-act-head">
              <span class="d-act-icon" aria-hidden="true">🤿</span>
              <div class="d-act-info">
                <div class="d-act-title"><b>Diving in progress</b> · ${active.spot.name}</div>
                <div class="d-act-sub">${active.spot.desc}</div>
              </div>
              <span class="d-act-timer" aria-live="off">⏱️ ${fmtTime(remSecs)}</span>
            </div>
            <div class="d-act-bar" aria-hidden="true"><div style="width:${pct}%"></div></div>
          </div>`;
      }
    } else {
      activeBanner = `
        <div class="dive-idle-banner">
          <span class="d-idle-icon" aria-hidden="true">🤿</span>
          <div>
            <b>The ice hole is open and clear.</b>
            <div class="muted">Send an expedition diver below to scavenge underwater relics for your collection shelf.</div>
          </div>
        </div>`;
    }

    const spotsHtml = D.DIVE_SPOTS.map(spot => {
      const unlocked = E.diveSpotUnlocked(spot);
      const isThisActive = active && active.spotId === spot.id;
      const durStr = fmtTime(spot.duration);

      const relicIconsHtml = (spot.relics || []).map(rId => {
        const r = D.RELIC_BY_ID[rId];
        if (!r) return "";
        const lvl = E.relicLevel(rId);
        const stars = lvl === 0 ? "☆☆☆" : "★".repeat(lvl) + "☆".repeat(3 - lvl);
        return `<span class="spot-relic-pill${lvl > 0 ? " owned" : ""}" title="${r.name} (${lvl}/3 stars: ${r.effect})">${r.icon} <span class="stars">${stars}</span></span>`;
      }).join(" ");

      let actionHtml = "";
      if (!unlocked) {
        actionHtml = `<span class="d-lock">🔒 Needs ${fmt(spot.unlockLifetime)} lifetime fish</span>`;
      } else if (isThisActive) {
        actionHtml = `<span class="d-active-label">${active.ready ? "✔ Dive complete!" : "⏳ Diver submerged"}</span>`;
      } else if (active) {
        actionHtml = `<button class="btn small primary" disabled>Diver busy</button>`;
      } else {
        actionHtml = `<button class="btn small primary d-start-btn" data-spot="${spot.id}">Plunge Diver (${durStr})</button>`;
      }

      return `
        <div class="dive-spot-card${isThisActive ? " active" : ""}${unlocked ? "" : " locked"}">
          <div class="d-head">
            <div class="d-icon" aria-hidden="true">${spot.icon}</div>
            <div class="d-meta">
              <div class="d-title">${spot.name}</div>
              <div class="d-dur">⏱️ ${durStr} · ${spot.desc}</div>
            </div>
          </div>
          <div class="d-relics-pool">
            <span class="d-pool-label">Relic Pool:</span>
            <div class="d-pool-list">${relicIconsHtml}</div>
          </div>
          <div class="d-foot">${actionHtml}</div>
        </div>`;
    }).join("");

    const fullHtml = `${autoBarHtml}${activeBanner}<div class="dive-spots-grid">${spotsHtml}</div>`;
    if (setHTML(box, fullHtml)) {
      const autoToggle = box.querySelector("#diverAutoToggle");
      if (autoToggle) {
        autoToggle.addEventListener("click", () => {
          E.toggleHelper("diver");
          renderDiving();
        });
      }
      box.querySelectorAll("[data-diver-strat]").forEach(btn => {
        btn.addEventListener("click", () => {
          E.setDiverStrategy(btn.dataset.diverStrat);
          renderDiving();
        });
      });
      const hireBtn = box.querySelector("#quickHireDiver");
      if (hireBtn) {
        hireBtn.addEventListener("click", e => {
          E.hireHelper("diver", pointFrom(e, hireBtn));
          renderDiving();
        });
      }
      const gotoHeritageBtn = box.querySelector("#gotoHeritageBtn");
      if (gotoHeritageBtn) {
        gotoHeritageBtn.addEventListener("click", () => {
          if (PI.ui && PI.ui.selectTab) PI.ui.selectTab("heritage", true);
          const h = $("helpers");
          if (h) h.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
      box.querySelectorAll("[data-spot]").forEach(btn => {
        btn.addEventListener("click", () => {
          const sId = btn.dataset.spot;
          if (E.startDive(sId)) {
            renderDiving();
          }
        });
      });
      const claimBtn = box.querySelector("#claimDiveBtn");
      if (claimBtn) {
        claimBtn.addEventListener("click", e => {
          const res = E.claimDive();
          if (res) {
            popRelicReward(res, pointFrom(e, claimBtn));
            renderDiving();
            renderRelicShelf();
          }
        });
      }
    }
  }

  function renderRelicShelf() {
    const box = $("relicShelfUI");
    if (!box) return;

    const cardsHtml = D.RELICS.map(r => {
      const lvl = E.relicLevel(r.id);
      const discovered = lvl > 0;
      const stars = lvl === 0 ? "☆☆☆" : "★".repeat(lvl) + "☆".repeat(3 - lvl);

      let multText = "";
      if (lvl === 1) multText = " (1× bonus)";
      else if (lvl === 2) multText = " (1.5× bonus)";
      else if (lvl === 3) multText = " (MAX 2× bonus)";

      return `
        <div class="relic-card${discovered ? " discovered" : " mystery"}">
          <div class="relic-icon-wrap" aria-hidden="true">
            <span class="relic-icon">${discovered ? r.icon : "❔"}</span>
          </div>
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
      if (res.relic) {
        toast(`🥽 <b>Diver Marina retrieved: ${res.relic.icon} ${res.relic.name}</b> (Lvl ${res.level})`, 3000);
      } else if (res.bonusFish > 0) {
        toast(`🥽 <b>Diver Marina retrieved +${fmt(res.bonusFish)} fish</b> from the deep!`, 3000);
      }
      return;
    }
    if (res.relic) {
      const lvl = res.level;
      const stars = "★".repeat(lvl) + "☆".repeat(3 - lvl);
      toast(`<b>${res.relic.icon} ${res.relic.name}</b> (${stars})<br>${res.relic.effect} (Level ${lvl} active!)`);
    } else if (res.bonusFish > 0) {
      toast(`<b>🎁 Deep-Sea Bounty!</b><br>All relics here are maxed! Retrieved +${fmt(res.bonusFish)} fish from the depths.`);
    }
  }

  PI.activities = {
    buildTree,
    nodeState,
    refreshTree,
    renderInspector,
    drawTreeLines,
    renderKettle,
    updateSceneIceHole,
    renderDiving,
    renderRelicShelf,
    popRelicReward,
  };
})(window.PI = window.PI || {});
