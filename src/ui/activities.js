/* Penguin Idle — activities and minigames UI.
 * Handles Campfire Kettle cooking, and exposes PI.activities for the Heirloom Tree
 * (src/ui/tree.js) and Diving Expeditions & Relics (src/ui/diving.js).
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

  // ---------- Moved to src/ui/tree.js: the Heirloom Tree: nodes, inspector and connecting lines ----------
  function buildTree(...args) { return PI.uiTree.buildTree(...args); }
  function nodeState(...args) { return PI.uiTree.nodeState(...args); }
  function refreshTree(...args) { return PI.uiTree.refreshTree(...args); }
  function renderInspector(...args) { return PI.uiTree.renderInspector(...args); }
  function drawTreeLines(...args) { return PI.uiTree.drawTreeLines(...args); }

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

  // ---------- Moved to src/ui/diving.js: the ice hole, diving expeditions and the relic shelf ----------
  function updateSceneIceHole(...args) { return PI.uiDiving.updateSceneIceHole(...args); }
  function renderDiving(...args) { return PI.uiDiving.renderDiving(...args); }
  function renderRelicShelf(...args) { return PI.uiDiving.renderRelicShelf(...args); }
  function popRelicReward(...args) { return PI.uiDiving.popRelicReward(...args); }

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
