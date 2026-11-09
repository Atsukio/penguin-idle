/* Penguin Idle — UI Dialogs, Modals, Toasts, Tooltips, and Touch Sheet.
 * Handles accessible focus management, popups, and hover/touch details.
 */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data, fmt = PI.fmt;
  const S = () => (E && E.state) || {};
  const $ = id => document.getElementById(id);
  const setHTML = (el, v) => { if (el && el.dataset.html !== v) { el.dataset.html = v; el.innerHTML = v; return true; } return false; };
  const pointFrom = (e, el) => {
    if (e && e.clientX) return { x: e.clientX, y: e.clientY };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const isTouch = () => window.matchMedia("(hover: none)").matches;

  // =====================================================================
  // Modals: a stack where the top one owns focus and everything behind is inert
  // =====================================================================
  const modals = [];

  function openModal({ title, body, actions, dismissable = true, danger = false, onOpen }) {
    const entry = { prevFocus: document.activeElement, dismissable };
    const wrap = document.createElement("div");
    wrap.className = "modal";
    const id = `modal-${Math.random().toString(36).slice(2, 8)}`;
    wrap.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <h2 id="${id}"></h2><div class="modal-body"></div><div class="row end"></div></div>`;
    wrap.querySelector("h2").textContent = title;
    wrap.querySelector(".modal-body").innerHTML = body;
    const row = wrap.querySelector(".row");
    let focusTarget = null;
    actions.forEach(a => {
      const b = document.createElement("button");
      b.className = `btn${a.primary ? " primary" : ""}${a.danger ? " danger" : ""}`;
      b.textContent = a.label;
      b.addEventListener("click", () => { closeModal(entry); a.onClick && a.onClick(wrap); });
      row.appendChild(b);
      // Destructive dialogs focus the safe choice; others focus the main action
      if ((danger && a.cancel) || (!danger && a.primary) || !focusTarget) focusTarget = b;
    });
    entry.wrap = wrap;
    entry.cancel = () => { closeModal(entry); const c = actions.find(a => a.cancel); c && c.onClick && c.onClick(wrap); };
    wrap.addEventListener("click", e => { if (e.target === wrap && entry.dismissable) entry.cancel(); });
    modals.push(entry);
    const root = $("modalRoot");
    if (root) root.appendChild(wrap);
    syncInert();
    if (onOpen) onOpen(wrap);
    focusTarget && focusTarget.focus();
    hideTooltip();
    return entry;
  }

  function closeModal(entry) {
    const i = modals.indexOf(entry);
    if (i < 0) return;
    modals.splice(i, 1);
    entry.wrap.remove();
    syncInert();
    const top = modals[modals.length - 1];
    const back = top ? top.wrap.querySelector(".btn") : entry.prevFocus;
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  }

  function syncInert() {
    const any = modals.length > 0;
    ["topbar", "layout", "goldenLayer", "infoSheet"].forEach(id => { if ($(id)) $(id).inert = any; });
    modals.forEach((m, i) => { m.wrap.inert = i !== modals.length - 1; });
  }

  document.addEventListener("keydown", e => {
    const top = modals[modals.length - 1];
    if (!top) {
      if (e.key === "Escape" && sheetSel) { e.preventDefault(); closeSheet(); }
      return;
    }
    if (e.key === "Escape" && top.dismissable) { e.preventDefault(); top.cancel(); return; }
    if (e.key === "Tab") {   // trap focus inside the dialog
      const f = [...top.wrap.querySelectorAll("button, [href], input, select, textarea")].filter(x => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // =====================================================================
  // Toasts (memories are grouped so a burst of unlocks doesn't bury the screen)
  // =====================================================================
  let heldToasts = [], holdUntil = 0;
  function toast(html, ms = 4500) {
    if (PI.napping || Date.now() < holdUntil) { heldToasts.push([html, ms]); return; }
    const box = $("toasts");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = html;
    el.title = "Click to dismiss";
    box.appendChild(el);
    let gone = false;
    const dismiss = () => { if (gone) return; gone = true; el.classList.add("out"); setTimeout(() => el.remove(), 350); };
    el.addEventListener("click", e => { if (!e.target.closest("button, a, input")) dismiss(); });
    setTimeout(dismiss, ms);
    while (box.children.length > 4) box.firstChild.remove();
  }

  let memoryQueue = [], memoryTimer = null;
  function afterNap(delay = 1800) {
    holdUntil = Date.now() + delay;
    setTimeout(() => {
      holdUntil = 0;
      heldToasts.splice(0).slice(-3).forEach(([h, ms]) => toast(h, ms));
      if (memoryQueue.length) queueMemories([]);
    }, delay);
  }
  function queueMemories(list) {
    memoryQueue.push(...list);
    clearTimeout(memoryTimer);
    memoryTimer = setTimeout(() => {
      if (PI.napping || Date.now() < holdUntil) return;
      const q = memoryQueue;
      memoryQueue = [];
      if (q.length <= 2) q.forEach(a => toast(`<span class="polaroid">${a.icon}</span> <b>${a.name}</b><br>${a.desc}`));
      else toast(`<span class="polaroid">📔</span> <b>${q.length} new memories!</b><br>${q.map(a => a.icon).join(" ")}`);
    }, 350);
  }

  // =====================================================================
  // Tooltips (mouse hover and keyboard focus) and the touch info sheet
  // =====================================================================
  let tooltipFn = null;
  function attachTooltip(el, fn) {
    if (!el) return;
    el.addEventListener("mouseenter", e => showTooltip(fn, e.clientX, e.clientY));
    el.addEventListener("mouseleave", hideTooltip);
    el.addEventListener("focus", () => {
      if (!el.matches(":focus-visible") || isTouch()) return;
      const r = el.getBoundingClientRect();
      showTooltip(fn, r.right, r.top);
    });
    el.addEventListener("blur", hideTooltip);
  }
  function showTooltip(fn, x, y) {
    if (isTouch()) return;
    tooltipFn = fn;
    const t = $("tooltip");
    if (!t) return;
    t.innerHTML = fn();
    t.classList.remove("hidden");
    positionTooltip(x, y);
  }
  function positionTooltip(cx, cy) {
    const t = $("tooltip");
    if (!t) return;
    const r = t.getBoundingClientRect();
    let x = cx + 16, y = cy + 16;
    if (x + r.width > innerWidth - 8) x = cx - r.width - 16;
    if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    t.style.left = `${Math.max(8, x)}px`;
    t.style.top = `${Math.max(8, y)}px`;
  }
  function hideTooltip() { tooltipFn = null; const t = $("tooltip"); if (t) t.classList.add("hidden"); }
  document.addEventListener("mousemove", e => {
    if (tooltipFn) {
      const t = $("tooltip");
      if (t) { t.innerHTML = tooltipFn(); positionTooltip(e.clientX, e.clientY); }
    }
  });

  // On touch screens the first tap shows details here; a second tap (or Buy) purchases
  let sheetSel = null;
  function selectForSheet(kind, id) {
    sheetSel = { kind, id };
    document.querySelectorAll(".sheet-selected").forEach(x => x.classList.remove("sheet-selected"));
    const panels = PI.panels || {};
    const bRow = panels.buildingRow || (PI.ui && PI.ui.buildingRow);
    const el = kind === "building" ? (bRow && bRow(id))
      : kind === "prop" ? $("props") && $("props").querySelector(`[data-id="${id}"]`)
      : $("upgrades") && $("upgrades").querySelector(`[data-id="${id}"]`);
    if (el) el.classList.add("sheet-selected");
    const sheet = $("infoSheet");
    if (sheet) sheet.classList.remove("hidden");
    renderSheet();
    if (sheet) {
      const sheetH = sheet.getBoundingClientRect().height + 24;
      document.body.style.paddingBottom = `${sheetH}px`;
      if (el) {
        const r = el.getBoundingClientRect(), limit = innerHeight - sheetH;
        if (r.bottom > limit) window.scrollBy({ top: r.bottom - limit + 8, behavior: "instant" });
      }
    }
  }
  function closeSheet() {
    sheetSel = null;
    document.querySelectorAll(".sheet-selected").forEach(x => x.classList.remove("sheet-selected"));
    const sheet = $("infoSheet");
    if (sheet) sheet.classList.add("hidden");
    document.body.style.paddingBottom = "";
  }
  function activate(kind, id, buy) {
    if (isTouch() && !(sheetSel && sheetSel.kind === kind && sheetSel.id === id)) { selectForSheet(kind, id); return; }
    buy();
  }
  function renderSheet() {
    if (!sheetSel) return;
    const { kind, id } = sheetSel;
    const panels = PI.panels || PI.ui || {};
    let html, cost, can, label;
    if (kind === "building" || kind === "prop") {
      const b = D.B_BY_ID[id];
      const buyCount = panels.buyCount || (b => 1);
      const n = buyCount(b);
      cost = E.costOf(b, S().buildings[id], n);
      can = S().fish >= cost;
      label = `Buy ${n > 1 ? `${n}× ` : ""}· 🐟 ${fmt(cost)}`;
      html = kind === "prop" ? (PI.scene && PI.scene.propTooltip ? PI.scene.propTooltip(id) : "")
                             : (panels.buildingTooltip ? panels.buildingTooltip(b) : "");
    } else {
      const u = D.UP_BY_ID[id];
      if (!u || E.has(id)) { closeSheet(); return; }
      cost = E.upgradeCost(u);
      can = S().fish >= cost;
      label = `Buy · 🐟 ${fmt(cost)}`;
      html = panels.upgradeTooltip ? panels.upgradeTooltip(u) : "";
    }
    const full = `<button class="sheet-close" id="sheetClose" aria-label="Close details">✕</button>
      <div class="sheet-body">${html}</div>
      <button class="btn primary" id="sheetBuy"${can ? "" : " disabled"}>${can ? label : `${label} (not enough fish)`}</button>`;
    const box = $("infoSheet");
    if (!box) return;
    const hadFocus = document.activeElement && document.activeElement.id === "sheetBuy";
    if (!setHTML(box, full)) return;
    $("sheetClose").addEventListener("click", closeSheet);
    $("sheetBuy").addEventListener("click", e => {
      const pos = pointFrom(e, $("sheetBuy"));
      if (kind === "building" || kind === "prop") {
        const buyCount = panels.buyCount || (b => 1);
        E.buyBuilding(id, buyCount(D.B_BY_ID[id]), pos);
      } else {
        E.buyUpgrade(id, pos);
      }
    });
    if (hadFocus) $("sheetBuy").focus({ preventScroll: true });
  }

  PI.dialogs = {
    openModal, closeModal, syncInert,
    toast, afterNap, queueMemories,
    attachTooltip, showTooltip, positionTooltip, hideTooltip,
    selectForSheet, closeSheet, activate, renderSheet,
    get tooltipFn() { return tooltipFn; },
    get sheetSel() { return sheetSel; },
    get modalOpen() { return modals.length > 0; },
  };

  // Backward-compatibility delegation on PI.ui
  PI.ui = PI.ui || {};
  PI.ui.openModal = openModal;
  PI.ui.closeModal = closeModal;
  PI.ui.toast = toast;
  PI.ui.afterNap = afterNap;
  PI.ui.queueMemories = queueMemories;
  PI.ui.attachTooltip = attachTooltip;
  PI.ui.showTooltip = showTooltip;
  PI.ui.hideTooltip = hideTooltip;
  PI.ui.selectForSheet = selectForSheet;
  PI.ui.closeSheet = closeSheet;
  PI.ui.activate = activate;
  PI.ui.renderSheet = renderSheet;
})(window.PI = window.PI || {});
