/* Penguin Idle: the Heirloom Tree: nodes, inspector and connecting lines.
 * Moved verbatim from activities.js; helpers from other files are reached through one-line forwarders. */
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

  PI.uiTree = { buildTree, nodeState, refreshTree, renderInspector, drawTreeLines };
})(window.PI = window.PI || {});
