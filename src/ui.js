/* Penguin Idle — user interface.
 * Structure re-renders when the engine emits an event; a light ticker updates only the numbers
 * that change continuously (fish, costs, affordability, timers).
 */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data, fmt = PI.fmt, fmtTime = PI.fmtTime;
  const S = () => E.state;
  const M = () => E.M;
  const $ = id => document.getElementById(id);
  const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
  const setHTML = (el, v) => { if (el && el.dataset.html !== v) { el.dataset.html = v; el.innerHTML = v; return true; } return false; };
  const pointFrom = (e, el) => {
    if (e && e.clientX) return { x: e.clientX, y: e.clientY };   // pointer
    const r = el.getBoundingClientRect();                         // keyboard: use the element's centre
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const isTouch = () => window.matchMedia("(hover: none)").matches;

  let currentTab = "colony";
  let buyAmount = 1;
  const els = {};

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
    $("modalRoot").appendChild(wrap);
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
  function toast(html) {
    const box = $("toasts");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = html;
    box.appendChild(el);
    const dismiss = () => { el.classList.add("out"); setTimeout(() => el.remove(), 350); };
    setTimeout(dismiss, 4500);
    while (box.children.length > 4) box.firstChild.remove();
  }

  let memoryQueue = [], memoryTimer = null;
  function queueMemories(list) {
    memoryQueue.push(...list);
    clearTimeout(memoryTimer);
    memoryTimer = setTimeout(() => {
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
    t.innerHTML = fn();
    t.classList.remove("hidden");
    positionTooltip(x, y);
  }
  function positionTooltip(cx, cy) {
    const t = $("tooltip"), r = t.getBoundingClientRect();
    let x = cx + 16, y = cy + 16;
    if (x + r.width > innerWidth - 8) x = cx - r.width - 16;
    if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    t.style.left = `${Math.max(8, x)}px`;
    t.style.top = `${Math.max(8, y)}px`;
  }
  function hideTooltip() { tooltipFn = null; $("tooltip").classList.add("hidden"); }
  document.addEventListener("mousemove", e => { if (tooltipFn) { $("tooltip").innerHTML = tooltipFn(); positionTooltip(e.clientX, e.clientY); } });

  // On touch screens the first tap shows details here; a second tap (or Buy) purchases
  let sheetSel = null;
  function selectForSheet(kind, id) {
    sheetSel = { kind, id };
    document.querySelectorAll(".sheet-selected").forEach(x => x.classList.remove("sheet-selected"));
    const el = kind === "building" ? els[id] && els[id].root
      : kind === "prop" ? $("props").querySelector(`[data-id="${id}"]`) : $("upgrades").querySelector(`[data-id="${id}"]`);
    if (el) el.classList.add("sheet-selected");
    $("infoSheet").classList.remove("hidden");
    renderSheet();
    // Keep the tapped item visible above the sheet so it can be tapped again
    const sheetH = $("infoSheet").getBoundingClientRect().height + 24;
    document.body.style.paddingBottom = `${sheetH}px`;
    if (el) {
      const r = el.getBoundingClientRect(), limit = innerHeight - sheetH;
      if (r.bottom > limit) window.scrollBy({ top: r.bottom - limit + 8, behavior: "instant" });
    }
  }
  function closeSheet() {
    sheetSel = null;
    document.querySelectorAll(".sheet-selected").forEach(x => x.classList.remove("sheet-selected"));
    $("infoSheet").classList.add("hidden");
    document.body.style.paddingBottom = "";
  }
  function activate(kind, id, buy) {
    if (isTouch() && !(sheetSel && sheetSel.kind === kind && sheetSel.id === id)) { selectForSheet(kind, id); return; }
    buy();
  }
  function renderSheet() {
    if (!sheetSel) return;
    const { kind, id } = sheetSel;
    let html, cost, can, label;
    if (kind === "building" || kind === "prop") {
      const b = D.B_BY_ID[id], n = buyCount(b);
      cost = E.costOf(b, S().buildings[id], n);
      can = S().fish >= cost;
      label = `Buy ${n > 1 ? `${n}× ` : ""}· 🐟 ${fmt(cost)}`;
      html = kind === "prop" ? propTooltip(id) : buildingTooltip(b);
    } else {
      const u = D.UP_BY_ID[id];
      if (!u || E.has(id)) { closeSheet(); return; }
      cost = E.upgradeCost(u);
      can = S().fish >= cost;
      label = `Buy · 🐟 ${fmt(cost)}`;
      html = upgradeTooltip(u);
    }
    const full = `<button class="sheet-close" id="sheetClose" aria-label="Close details">✕</button>
      <div class="sheet-body">${html}</div>
      <button class="btn primary" id="sheetBuy"${can ? "" : " disabled"}>${can ? label : `${label} (not enough fish)`}</button>`;
    const box = $("infoSheet");
    const hadFocus = document.activeElement && document.activeElement.id === "sheetBuy";
    if (!setHTML(box, full)) return;
    $("sheetClose").addEventListener("click", closeSheet);
    $("sheetBuy").addEventListener("click", e => {
      const pos = pointFrom(e, $("sheetBuy"));
      if (kind === "building" || kind === "prop") E.buyBuilding(id, buyCount(D.B_BY_ID[id]), pos);
      else E.buyUpgrade(id, pos);
    });
    if (hadFocus) $("sheetBuy").focus({ preventScroll: true });
  }

  // =====================================================================
  // Colony: buildings and upgrades
  // =====================================================================
  const buyCount = b => (buyAmount === "max" ? Math.max(1, E.maxAffordable(b)) : buyAmount);

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
    list.innerHTML = "";
    D.BUILDINGS.forEach(b => {
      const el = document.createElement("button");
      el.className = "building";
      el.innerHTML = `
        <div class="icon" aria-hidden="true">${b.icon}</div>
        <div>
          <div class="name">${b.name}</div>
          <div class="desc"><span class="b-cost cost"></span> · <span class="b-fps"></span></div>
          <div class="milestone-bar" aria-hidden="true"><div></div></div>
        </div>
        <div class="owned" aria-hidden="true">0</div>`;
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

  // The row being hovered or focused (or picked on a phone) shows its after-purchase count and
  // output when buying more than one at a time
  let previewId = null;
  function paintBuilding(b) {
    const e = els[b.id];
    if (!e) return;
    const n = buyCount(b);
    const p = (previewId === b.id || (sheetSel && sheetSel.kind === "building" && sheetSel.id === b.id)) && n > 1 && !e.root.disabled
      ? E.previewBuy(b.id, n) : null;
    const owned = p ? p.owned : S().buildings[b.id];
    const each = p ? p.each : E.buildingFps(b.id);
    e.root.classList.toggle("previewing", !!p);
    setText(e.owned, String(owned));
    // The row's total output grows with every purchase; the per-member rate only jumps at milestones
    const buff = E.buffMult("prod");
    setText(e.fps, owned > 0 ? `${fmt(each * owned * buff)}/s · ${fmt(each * buff)} each` : `${fmt(each * buff)}/s each`);
    const prev = [0, ...D.MILESTONES].filter(x => x <= owned).pop();
    const next = D.MILESTONES.find(x => x > owned);
    e.bar.style.width = next ? `${((owned - prev) / (next - prev)) * 100}%` : "100%";
  }
  const refreshBuildings = () => D.BUILDINGS.forEach(paintBuilding);

  function tickBuildings() {
    let revealNext = true;
    D.BUILDINGS.forEach((b, i) => {
      const e = els[b.id], owned = S().buildings[b.id];
      const visible = E.buildingVisible(b, i);
      e.root.classList.toggle("hidden", !visible && !revealNext);
      e.root.classList.toggle("locked", !visible);
      e.root.disabled = !visible;
      if (!visible) revealNext = false;
      const n = buyCount(b);
      const cost = E.costOf(b, owned, n);
      // Max changes as fish come in, and the phone's picked row changes on taps, so keep previews current
      if (previewId === b.id || e.root.classList.contains("previewing") || (sheetSel && sheetSel.id === b.id)) paintBuilding(b);
      setText(e.cost, `${n > 1 ? `${n}× ` : ""}🐟 ${fmt(cost)}`);
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
      $("noUpgrades").classList.toggle("hidden", ups.length > 0);
      if (hadFocus) (grid.firstElementChild || $("buildings").querySelector(".building:not(.hidden)")).focus({ preventScroll: true });
      if (sheetSel && sheetSel.kind === "upgrade") selectForSheet("upgrade", sheetSel.id);
    }
  }
  function tickUpgrades() {
    let affordable = 0;
    $("upgrades").querySelectorAll(".upgrade").forEach(el => {
      const can = S().fish >= E.upgradeCost(D.UP_BY_ID[el.dataset.id]);
      if (can) affordable++;
      el.classList.toggle("affordable", can);
    });
    const btn = $("buyAllBtn");
    btn.disabled = affordable === 0;
    setText(btn, affordable ? `Buy all (${affordable})` : "Buy all");
  }

  // =====================================================================
  // Workshop
  // =====================================================================
  function buildResearch() {
    const list = $("research");
    list.innerHTML = "";
    D.RESEARCH.forEach(r => {
      const el = document.createElement("button");
      el.className = "research";
      el.dataset.id = r.id;
      el.innerHTML = `
        <div class="icon" aria-hidden="true">${r.icon}</div>
        <div>
          <div class="name">${r.name} <span class="r-level"></span></div>
          <div class="desc r-effect"></div>
          <div class="r-bar" aria-hidden="true"><div></div></div>
        </div>
        <div class="cost r-cost"></div>`;
      el.addEventListener("click", e => E.buyResearch(r.id, pointFrom(e, el)));
      list.appendChild(el);
    });
  }

  function tickResearch() {
    $("research").querySelectorAll(".research").forEach(el => {
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

  // =====================================================================
  // Migration: shores, helpers and the Heirloom Tree
  // =====================================================================
  const migrateIsGood = () => E.pendingFeathers() >= Math.max(1, S().feathersEarned);

  function tickMigration() {
    const pend = E.pendingFeathers();
    setText($("pendingFeathers"), fmt(pend));
    setText($("nextFeather"), fmt(E.nextFeatherAt()));
    $("migrateBtn").disabled = pend < 1;
    const hint = pend < 1 ? (S().feathersEarned ? "Keep fishing: your next feather is on its way." : "Keep fishing: your first feather is on its way.")
      : migrateIsGood() ? "✨ Good time to migrate: this would at least double your feathers."
      : `Migrating now adds ${fmt((pend / Math.max(1, S().feathersEarned)) * 100)}% to your feathers. Many players wait until it would double them.`;
    setText($("migrateHint"), hint);
  }

  function migrateFlow() {
    const gainF = E.pendingFeathers();
    if (gainF < 1) return;
    const shores = E.availableShores();
    const radios = shores.map(sh => `
      <label class="shore-radio"><input type="radio" name="shore" value="${sh.id}"${sh.id === S().nextShore ? " checked" : ""}>
        <span aria-hidden="true">${sh.icon}</span> <b>${sh.name}</b> <small class="muted">${sh.desc}</small></label>`).join("");
    openModal({
      title: "Set off on the Great Migration?",
      body: `<p>The colony will pack up and waddle to fresh ice, earning <b>🪶 ${fmt(gainF)}</b> Emperor Feathers
             (+${fmt(gainF * M().featherPer * 100)}% production, forever), plus feathers to spend.</p>
             <p>Your fish, colony, upgrades and Workshop research stay behind.</p>
             ${shores.length > 1 ? `<fieldset class="shore-pick"><legend>Where to?</legend>${radios}</fieldset>` : ""}`,
      actions: [
        { label: "Not yet", cancel: true },
        { label: "Let's go!", primary: true, onClick: wrap => {
          const chosen = wrap.querySelector('input[name="shore"]:checked');
          const id = chosen ? chosen.value : "home";
          E.setNextShore(id);
          E.doMigrate(id);
          E.save();
        } },
      ],
    });
  }

  function renderShores() {
    const avail = E.availableShores().map(s => s.id);
    const html = D.SHORES.map(sh => {
      const open = avail.includes(sh.id), here = S().shore === sh.id, next = S().nextShore === sh.id;
      const visited = S().shoresVisited.includes(sh.id);
      return `<button class="shore${here ? " here" : ""}${next ? " next" : ""}${open ? "" : " locked"}" data-id="${sh.id}"${open ? "" : " disabled"}
        aria-pressed="${next}" aria-label="${sh.name}: ${sh.desc}${here ? " You live here now." : ""}${next ? " Your next stop." : ""}${open ? "" : ` Unlocks after ${sh.unlockAt - 1} migrations.`}">
        <div class="sh-icon" aria-hidden="true">${open ? sh.icon : "🔒"}</div>
        <div><div class="name">${sh.name} ${here ? '<span class="tag">You are here</span>' : ""}${next ? '<span class="tag next">Next stop</span>' : ""}</div>
        <div class="desc">${open ? sh.desc : `Unlocks after ${sh.unlockAt - 1} migration${sh.unlockAt - 1 === 1 ? "" : "s"}`}${visited && !here ? " · visited" : ""}</div></div></button>`;
    }).join("");
    if (setHTML($("shores"), html)) {
      $("shores").querySelectorAll(".shore:not(.locked)").forEach(el => el.addEventListener("click", () => E.setNextShore(el.dataset.id)));
    }
  }

  function renderHelpers() {
    const spend = E.spendableFeathers();
    const html = D.HELPERS.map(h => {
      const hired = h.id in S().helpers, on = E.helperOn(h.id);
      const action = hired
        ? `<button class="btn small toggle${on ? " on" : ""}" data-toggle="${h.id}" aria-pressed="${on}">${on ? "On" : "Off"}</button>`
        : `<button class="btn small${spend >= h.cost ? " primary" : ""}" data-hire="${h.id}"${spend >= h.cost ? "" : " disabled"}>Hire · 🪶 ${fmt(h.cost)}</button>`;
      return `<div class="helper${hired ? " hired" : ""}${on ? " on" : ""}"><div class="hp-icon" aria-hidden="true">${h.icon}</div>
        <div><div class="name">${h.name}</div><div class="desc">${h.desc}</div></div>${action}</div>`;
    }).join("");
    if (setHTML($("helpers"), html)) {
      $("helpers").querySelectorAll("[data-hire]").forEach(b => b.addEventListener("click", e => E.hireHelper(b.dataset.hire, pointFrom(e, b))));
      $("helpers").querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => {
        E.toggleHelper(b.dataset.toggle);
        const nb = $("helpers").querySelector(`[data-toggle="${b.dataset.toggle}"]`);
        if (nb) nb.focus({ preventScroll: true });
      }));
    }
  }

  // ---------- Heirloom Tree ----------
  let selectedNode = "spirit";
  function buildTree() {
    const tree = $("tree");
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
    $("tree").querySelectorAll(".node").forEach(el => {
      const n = D.H_BY_ID[el.dataset.id], L = E.nodeLevel(n.id), st = nodeState(n);
      el.className = `node branch-${n.branch} state-${st}${L > 0 ? " learned" : ""}${n.capstone ? " capstone" : ""}${n.id === selectedNode ? " selected" : ""}`;
      setText(el.querySelector(".n-level"), n.max > 1 ? `${L}/${n.max}` : L ? "✔" : "");
      el.setAttribute("aria-label", `${n.name}${n.capstone ? " (capstone)" : ""}, ${n.max > 1 ? `level ${L} of ${n.max}` : L ? "learned" : "not learned"}${st === "locked" ? ", locked" : st === "available" ? ", can learn" : ""}`);
      el.setAttribute("aria-current", n.id === selectedNode ? "true" : "false");
    });
    setText($("featherSpendable"), fmt(E.spendableFeathers()));
    $("respecBtn").disabled = !Object.keys(S().heritage).length;
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
    const html = `
      <div class="i-icon" aria-hidden="true">${n.icon}</div>
      <div class="i-body">
        <div class="name">${n.name}${n.capstone ? ' <span class="cap">Capstone</span>' : ""}</div>
        <div class="i-sub">${D.BRANCH_NAMES[n.branch]} · ${n.max > 1 ? `Level ${L}/${n.max}` : L ? "Learned" : "Not learned"}</div>
        ${L > 0 ? `<div><b>Now:</b> ${n.text(L)}</div>` : ""}
        ${!maxed ? `<div><b>${L ? "Next" : "Gives"}:</b> ${n.text(L + 1)}</div>` : ""}
        ${req ? `<div class="i-req">🔒 ${req}</div>` : ""}
      </div>
      <button class="btn primary" id="learnBtn"${canLearn ? "" : " disabled"}>${label}</button>`;
    const box = $("treeInspector");
    const hadFocus = document.activeElement && document.activeElement.id === "learnBtn";
    if (!setHTML(box, html)) return;
    const btn = $("learnBtn");
    btn.addEventListener("click", e => E.learnNode(n.id, pointFrom(e, btn)));
    // Keep keyboard focus in place after levelling up; fall back to the node if the button is now disabled
    if (hadFocus) (btn.disabled ? $("tree").querySelector(`[data-id="${n.id}"]`) : btn).focus({ preventScroll: true });
  }

  function drawTreeLines() {
    const wrap = $("treeWrap"), svg = $("treeLines");
    if (!wrap.offsetParent) return;   // tab hidden; redrawn when it opens
    const wr = wrap.getBoundingClientRect();
    svg.setAttribute("width", wr.width);
    svg.setAttribute("height", wr.height);
    svg.setAttribute("viewBox", `0 0 ${wr.width} ${wr.height}`);
    const centre = id => {
      const r = $("tree").querySelector(`[data-id="${id}"]`).getBoundingClientRect();
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
  // Home: penguin letters and the wardrobe
  // =====================================================================
  function renderLetters() {
    const L = S().letters;
    const lt = id => D.LETTER_TYPES.find(t => t.id === id);
    const html = L.list.map((l, i) => {
      const prog = E.letterProgress(l), done = prog >= l.target;
      return `<div class="letter${l.claimed ? " claimed" : done ? " ready" : ""}">
        <div class="l-from"><span aria-hidden="true">${l.icon}</span> From <b>${l.sender}</b></div>
        <p class="l-text">${lt(l.type).text(l.target)}</p>
        <div class="l-bar" aria-hidden="true"><div style="width:${(prog / l.target) * 100}%"></div></div>
        <div class="l-foot"><span>${fmt(prog)} / ${fmt(l.target)}</span>
          ${l.claimed ? '<span class="muted">✔ Answered</span>'
            : `<button class="btn small${done ? " primary" : ""}" data-claim="${i}"${done ? "" : " disabled"}>${done ? `Reply · 🐟 ${fmt(E.letterReward())}` : "In progress"}</button>`}</div>
      </div>`;
    }).join("");
    if (setHTML($("letters"), html)) {
      $("letters").querySelectorAll("[data-claim]").forEach(b => b.addEventListener("click", e => E.claimLetter(Number(b.dataset.claim), pointFrom(e, b))));
    }
    const allDone = L.list.length && L.list.every(l => l.claimed);
    const bonus = L.bonus ? '<p class="muted">📦 Today\'s care package has been opened. New letters arrive tomorrow.</p>'
      : allDone ? '<button class="btn primary" id="bonusBtn">📦 Open the care package (production ×7 for a while)</button>'
      : '<p class="muted">Answer all three letters today for a care package. New letters arrive each day, with no pressure to keep a streak.</p>';
    if (setHTML($("letterBonus"), bonus) && $("bonusBtn")) $("bonusBtn").addEventListener("click", e => E.claimLetterBonus(pointFrom(e, $("bonusBtn"))));
  }

  function renderWardrobe() {
    const html = Object.entries(D.COSMETIC_SLOTS).map(([slot, label]) => {
      const items = D.COSMETICS[slot].map(c => {
        const unlocked = c.need(S()), worn = S().cosmetics[slot] === c.id;
        const swatch = c.emoji !== undefined ? (c.emoji || "∅")
          : `<span class="swatch" style="background:${(c.beanie || c.colors)[0].startsWith("url") ? "linear-gradient(90deg,#ff9a8b,#ffd27a,#a6e3bd,#a9c8ff,#d9b3ff)" : (c.beanie || c.colors)[0]}"></span>`;
        return `<button class="ward${worn ? " worn" : ""}${unlocked ? "" : " locked"}" data-slot="${slot}" data-id="${c.id}" aria-pressed="${worn}"
          aria-label="${c.name}${unlocked ? "" : `, locked: ${c.unlockText}`}" title="${c.name}${unlocked ? "" : ` (🔒 ${c.unlockText})`}">
          <span class="w-swatch" aria-hidden="true">${unlocked ? swatch : "🔒"}</span><span class="w-name">${c.name}</span>
          ${unlocked ? "" : `<span class="w-lock">${c.unlockText}</span>`}</button>`;
      }).join("");
      return `<div class="ward-slot"><h3>${label}</h3><div class="ward-row">${items}</div></div>`;
    }).join("");
    if (setHTML($("wardrobe"), html)) {
      $("wardrobe").querySelectorAll(".ward:not(.locked)").forEach(b => b.addEventListener("click", () => {
        E.setOutfit(b.dataset.slot, b.dataset.id);
        const nb = $("wardrobe").querySelector(`[data-slot="${b.dataset.slot}"][data-id="${b.dataset.id}"]`);
        if (nb) nb.focus({ preventScroll: true });
      }));
    }
  }

  // =====================================================================
  // Memories and stats
  // =====================================================================
  function renderAchievements() {
    const html = D.ACHIEVEMENTS.map(a => {
      const done = S().achievements.includes(a.id);
      return `<div class="ach ${done ? "done" : ""}">
        <div class="a-icon" aria-hidden="true">${a.icon}${a.badge ? `<span class="a-badge">${a.badge}</span>` : ""}</div>
        <div><div class="name">${a.name}${done ? "" : ' <span class="visually-hidden">(locked)</span>'}</div><div class="desc">${a.desc}</div></div></div>`;
    }).join("");
    setHTML($("achievements"), html);
  }

  function renderStatsGraph() {
    const h = S().history;
    const box = $("statsGraph");
    if (h.length < 2) { setHTML(box, '<p class="muted">The graph fills in as you play (one point a minute).</p>'); return; }
    const W = 600, H = 140, pad = 6;
    const vals = h.map(p => Math.log10(Math.max(1, p[1])));
    const lo = Math.min(...vals), hi = Math.max(...vals, lo + 1);
    const pts = vals.map((v, i) => `${(pad + (i / (vals.length - 1)) * (W - 2 * pad)).toFixed(1)},${(H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad)).toFixed(1)}`).join(" ");
    const span = (h[h.length - 1][0] - h[0][0]) / 1000;
    setHTML(box, `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Fish per second over the last ${fmtTime(span)}, from ${fmt(Math.pow(10, lo))} to ${fmt(Math.pow(10, hi))}">
        <polyline points="${pad},${H - pad} ${pts} ${W - pad},${H - pad}" class="g-fill"/><polyline points="${pts}" class="g-line"/></svg>
      <div class="g-axis"><span>${fmtTime(span)} ago</span><span>${fmt(Math.pow(10, lo))} → ${fmt(Math.pow(10, hi))} /s (log scale)</span><span>now</span></div>`);
  }

  function renderStats() {
    const st = S().stats;
    const rows = [
      ["Fish caught this migration", fmt(S().runFish)],
      ["Fish caught all time", fmt(S().lifetimeFish)],
      ["Fish from patting", fmt(st.clickFish)],
      ["Penguin pats", fmt(st.clicks)],
      ["Big Catches", `${fmt(st.bigCatches)} (${+(M().critChance * 100).toFixed(1)}% chance, ×${fmt(M().critMult)})`],
      ["Golden fish caught", fmt(st.goldenClicks)],
      ["Colony members", fmt(D.totalColony(S()))],
      ["Upgrades owned", `${S().upgrades.length}`],
      ["Workshop levels", `${Object.values(S().research).reduce((a, b) => a + b, 0)}`],
      ["Heirloom levels", `${Object.values(S().heritage).reduce((a, b) => a + b, 0)}`],
      ["Migrations", `${S().migrations}`],
      ["Shores visited", `${S().shoresVisited.length} of ${D.SHORES.length}`],
      ["Letters answered", fmt(st.lettersClaimed)],
      ["Catches carried to the basket", fmt(st.deliveries)],
      ["Music listened to", fmtTime(st.musicSeconds)],
      ["Feather bonus", `+${fmt((M().feather - 1) * 100)}%`],
      ["Memories bonus", `+${fmt((M().ach - 1) * 100)}%`],
      ["This migration started", `${fmtTime((E.now() - st.runStartedAt) / 1000)} ago`],
      ["Playing since", new Date(st.startedAt).toLocaleDateString()],
    ];
    setHTML($("stats"), rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join(""));
    renderStatsGraph();
  }

  function renderBuffs() {
    const now = E.now();
    const html = S().buffs.filter(b => b.until > now)
      .map(b => `<span class="buff">${b.name} ×${b.mult} · ${Math.ceil((b.until - now) / 1000)}s</span>`).join("");
    if ($("buffs").innerHTML !== html) $("buffs").innerHTML = html;
  }

  // =====================================================================
  // Colony scene: grows as you build, follows the clock and the seasons
  // =====================================================================
  const SCENE_PROPS = [
    { id: "fisher",  icon: "🎣", style: "left:4%;bottom:24%" },
    { id: "drill",   icon: "🛖", style: "left:13%;bottom:28%" },
    { id: "igloo",   igloo: true, style: "left:72%;bottom:28%" },
    { id: "krill",   icon: "🦐", style: "left:88%;bottom:10%;font-size:1.2rem" },
    { id: "trawler", icon: "⛵", style: "left:84%;bottom:40%;font-size:1.3rem", cls: "rock" },
    { id: "orca",    icon: "🐋", style: "left:62%;bottom:40%;font-size:1.2rem", cls: "breach" },
    { id: "factory", icon: "🧶", style: "left:27%;bottom:8%;font-size:1.3rem" },
    { id: "rocket",  icon: "🎈", style: "left:18%;top:22%", cls: "float" },
    { id: "portal",  icon: "🔮", style: "left:64%;bottom:8%;font-size:1.3rem", cls: "glimmer" },
    { id: "time",    icon: "🕰️", style: "left:36%;bottom:30%;font-size:1.3rem" },
  ];
  const SEASON_DECOR = {
    sunlit: '<span class="decor" style="right:8%;top:10%;font-size:1.8rem">🌞</span>',
    awareness: '<span class="decor" style="left:6%;top:12%">🎗️</span><span class="decor" style="right:6%;top:12%">🎗️</span>',
    worldpenguin: '<span class="decor bunting" aria-hidden="true">🎉 🎈 🎊 🎈 🎉</span>',
    midwinter: '<span class="decor" style="left:40%;bottom:16%">🕯️</span><span class="decor" style="left:58%;bottom:16%">🕯️</span>',
  };

  // Each shore has its own landscape and weather. back = behind the ground (sky features, hills),
  // front = on the ground behind the residents, over = in front of everything (fog, spray).
  // Colours live in style.css under .colony[data-shore=...].
  const SHORE_SCENES = {
    home: { weather: "snow",
      back: '<div class="berg" style="left:6%;width:90px;height:46px"></div><div class="berg" style="left:58%;width:130px;height:60px"></div><div class="berg small" style="left:80%;width:70px;height:34px"></div>' },
    krillbay: { weather: "bubbles",
      back: '<div class="sea"><div class="waves"></div></div><div class="berg" style="left:70%;width:80px;height:38px;bottom:48%"></div>',
      front: '<span class="decor" style="left:46%;bottom:30%;font-size:1rem">🐚</span><span class="decor" style="left:22%;bottom:4%;font-size:.95rem">🦀</span>' },
    sunnycove: { weather: "sparkle",
      back: '<div class="sun"></div><div class="hill" style="left:-6%;width:180px;height:50px"></div><div class="hill" style="left:62%;width:220px;height:44px"></div>',
      front: '<span class="decor" style="left:8%;bottom:30%">⛱️</span><span class="decor" style="left:84%;bottom:26%;font-size:1rem">🪣</span>' },
    blizzard: { weather: "blizzard",
      back: '<div class="peak" style="left:-4%;width:150px;height:84px"></div><div class="peak" style="left:30%;width:120px;height:66px"></div><div class="peak" style="left:62%;width:170px;height:92px"></div>',
      over: '<div class="fog"></div><div class="fog two"></div>' },
    aurorafields: { weather: "motes", aurora: true,
      back: '<div class="hill" style="left:-10%;width:240px;height:40px"></div><div class="hill" style="left:55%;width:260px;height:48px"></div>',
      front: '<span class="decor glimmer" style="left:10%;bottom:28%;font-size:1rem">💎</span><span class="decor glimmer" style="left:90%;bottom:32%;font-size:.9rem">💎</span>' },
    quiethollow: { weather: "fluff",
      back: '<span class="pine" style="left:2%;font-size:2.6rem">🌲</span><span class="pine" style="left:11%;font-size:2rem">🌲</span><span class="pine" style="left:78%;font-size:2.4rem">🌲</span><span class="pine" style="left:89%;font-size:2.9rem">🌲</span><span class="pine far" style="left:60%;font-size:1.6rem">🌲</span><span class="pine far" style="left:30%;font-size:1.5rem">🌲</span>',
      front: '<span class="decor" style="left:20%;bottom:6%;font-size:.95rem">🍄</span><span class="decor" style="left:66%;bottom:4%;font-size:.95rem">🦉</span>' },
    harbour: { weather: "rain",
      back: '<div class="sea harbour-water"><div class="waves"></div></div><div class="town"><i style="height:30px"></i><i style="height:44px"></i><i style="height:24px"></i><i style="height:38px"></i><i style="height:52px"></i><i style="height:28px"></i></div><div class="lighthouse"><div class="beam"></div></div><span class="moored" style="left:44%">⛵</span>',
      front: '<span class="decor" style="left:24%;bottom:30%;font-size:1rem">🏮</span><span class="decor" style="left:56%;bottom:30%;font-size:1rem">🏮</span><span class="decor" style="left:90%;bottom:6%;font-size:1rem">📦</span>' },
    rookery: { weather: "feathers",
      back: '<div class="crag" style="left:-6%;width:160px;height:70px"></div><div class="crag" style="left:66%;width:200px;height:80px"></div>',
      front: '<span class="decor" style="left:8%;bottom:26%;font-size:1.5rem">🪨</span><span class="decor" style="left:86%;bottom:24%;font-size:1.3rem">🪨</span><span class="decor" style="left:24%;bottom:30%;font-size:1rem">🥚</span>' },
  };
  // ?shore=blizzard previews a shore's scenery without changing the game
  const previewShore = new URLSearchParams(location.search).get("shore");
  const sceneShore = () => (SHORE_SCENES[previewShore] ? previewShore : S().shore in SHORE_SCENES ? S().shore : "home");

  function buildLights() {
    const colors = ["#e8735a", "#ffd27a", "#a6e3bd", "#a9c8ff"];
    $("lights").innerHTML = Array.from({ length: 16 }, (_, i) =>
      `<span class="bulb" style="background:${colors[i % 4]};box-shadow:0 0 8px ${colors[i % 4]};animation-delay:${(i % 4) * 0.6}s"></span>`).join("");
  }

  let sceneKey = "";
  function rebuildScene(force = false) {
    const total = D.totalColony(S());
    const count = Math.min(22, Math.ceil(Math.sqrt(total) * 1.4));
    const present = SCENE_PROPS.filter(p => S().buildings[p.id] > 0).map(p => p.id);
    const hour = new Date().getHours();
    const night = hour < 7 || hour >= 19;
    const season = M().season;
    const shoreId = sceneShore(), look = SHORE_SCENES[shoreId];
    const key = `${count}|${present.join(",")}|${S().buildings.aurora > 0}|${night}|${season && season.id}|${shoreId}|${S().settings.reduceMotion}`;
    if (key === sceneKey && !force) return;
    sceneKey = key;
    PI.fx.Music.setMood({ night, shore: shoreId, season: season && season.id });   // the music follows the scene
    PI.bus.emit("musicMood");
    const colony = $("colony");
    colony.classList.toggle("night", night);
    if (colony.dataset.shore !== shoreId) {
      colony.dataset.shore = shoreId;
      $("landBack").innerHTML = look.back || "";
      $("landFront").innerHTML = look.front || "";
      $("landOver").innerHTML = look.over || "";
    }
    PI.fx.Particles.setWeather(look.weather);
    $("aurora").classList.toggle("on", S().buildings.aurora > 0 || night || !!look.aurora);
    $("props").innerHTML = SCENE_PROPS.filter(p => present.includes(p.id)).map(p => p.igloo
      ? `<div class="prop igloo" data-id="${p.id}" style="${p.style}"></div>`
      : `<span class="prop${p.cls ? " " + p.cls : ""}" data-id="${p.id}" style="${p.style}">${p.icon}</span>`).join("");
    $("props").querySelectorAll("[data-id]").forEach(bindProp);
    $("sceneDecor").innerHTML = season ? SEASON_DECOR[season.id] || "" : "";
    const shore = M().shore;
    setText($("shorePill"), `${shore.icon} ${shore.name}`);
    const box = $("waddlers");
    box.innerHTML = "";
    colony.querySelectorAll(".chat-bubble").forEach(x => x.remove());
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "waddler";
      p.innerHTML = '<span class="w-body">🐧</span>';
      const x = 5 + Math.random() * 85;
      p.dataset.x = x;
      p.style.left = `${x}%`;
      p.style.bottom = `${4 + Math.random() * 32}px`;
      const size = 16 + Math.random() * 8;
      p.style.fontSize = `${size}px`;
      // Smaller penguins take quicker, shorter steps
      p.style.setProperty("--step", `${(0.32 + size / 80).toFixed(2)}s`);
      if (Math.random() < 0.5) p.classList.add("flip");
      if (night && i % 3 === 0) p.classList.add("huddle");   // at night some gather by the fire
      box.appendChild(p);
      if (!S().settings.reduceMotion && !p.classList.contains("huddle")) {
        setTimeout(() => wander(p), 300 + Math.random() * 4000);
      }
    }
    applyNames();
  }

  // ---------- Named residents: the player's names go to the first few penguins, who wear a little tag ----------
  function applyNames() {
    const names = E.residentNames(), all = [...$("waddlers").children];
    all.forEach((p, i) => {
      const name = names[i] || "";
      if ((p.dataset.name || "") === name) return;
      let tag = p.querySelector(".w-tag");
      if (!name) { delete p.dataset.name; if (tag) tag.remove(); return; }
      if (!tag) { tag = document.createElement("span"); tag.className = "w-tag"; p.appendChild(tag); }
      p.dataset.name = name;
      tag.textContent = name;
    });
  }

  function buildFriends() {
    const box = $("friendNames");
    box.innerHTML = Array.from({ length: E.NAME_SLOTS }, (_, i) =>
      `<label class="friend"><span aria-hidden="true">🐧</span><input type="text" maxlength="16" data-slot="${i}" placeholder="Name a resident" aria-label="Resident ${i + 1}'s name" autocomplete="off" spellcheck="false"></label>`).join("");
    box.querySelectorAll("input").forEach(inp => {
      const commit = () => { if (E.setName(Number(inp.dataset.slot), inp.value)) E.save(); inp.value = S().names[inp.dataset.slot] || ""; };
      inp.addEventListener("change", commit);
      inp.addEventListener("keydown", e => { if (e.key === "Enter") { commit(); inp.blur(); } });
    });
    fillFriends();
  }
  function fillFriends() {
    $("friendNames").querySelectorAll("input").forEach(inp => {
      if (document.activeElement !== inp) inp.value = S().names[inp.dataset.slot] || "";
    });
  }

  // ---------- Props: hover (or tap, on phones) a colony member's prop to see what it earns ----------
  function propShare(id) {
    const all = D.BUILDINGS.reduce((t, b) => t + fpsOf(b.id), 0);
    const pct = (fpsOf(id) / (all || 1)) * 100;
    return pct > 0 && pct < 1 ? "under 1%" : `${Math.round(pct)}%`;
  }
  const propTooltip = id => `${buildingTooltip(D.B_BY_ID[id])}<div class="t-sub">That's <b>${propShare(id)}</b> of the colony's catch.</div>`;
  function bindProp(el) {
    const id = el.dataset.id;
    attachTooltip(el, () => propTooltip(id));
    el.addEventListener("mouseenter", () => { if (!isTouch()) lookedAtProp(); });
    el.addEventListener("click", () => { if (isTouch()) { lookedAtProp(); selectForSheet("prop", id); } });
  }
  function lookedAtProp() { S().stats.propLooks++; }

  // A resident walks a short way, stops, maybe looks around or hops, then picks a new spot
  // y (optional) also moves the penguin nearer or further, in px from the bottom of the scene
  function walkTo(p, to, done, y) {
    const from = parseFloat(p.dataset.x);
    const speed = 2.2 + Math.random() * 2;            // % of the scene per second
    const fromY = parseFloat(p.style.bottom) || 8, toY = y == null ? fromY : y;
    const dur = Math.max(400, (Math.max(Math.abs(to - from), Math.abs(toY - fromY) / 4) / speed) * 1000);
    p.classList.toggle("flip", to > from);
    p.classList.add("walking");
    const walk = p.animate([{ left: `${from}%`, bottom: `${fromY}px` }, { left: `${to}%`, bottom: `${toY}px` }], { duration: dur, easing: "cubic-bezier(.3,0,.7,1)", fill: "forwards" });
    walk.onfinish = () => {
      p.style.left = `${to}%`;
      p.style.bottom = `${toY}px`;
      p.dataset.x = to;
      walk.cancel();
      p.classList.remove("walking");
      if (p.isConnected) done();
    };
  }

  function wander(p) {
    if (!p.isConnected || S().settings.reduceMotion) return;
    if (p.dataset.busy) { setTimeout(() => wander(p), 2000 + Math.random() * 3000); return; }   // chatting
    const from = parseFloat(p.dataset.x);
    let dir = Math.random() < 0.5 ? -1 : 1;
    if (from < 12) dir = 1; else if (from > 85) dir = -1;
    const to = Math.max(3, Math.min(92, from + dir * (6 + Math.random() * 28)));
    walkTo(p, to, () => {
      if (p.dataset.busy) { setTimeout(() => wander(p), 3000); return; }
      const r = Math.random();
      const act = r < 0.3 ? "look" : r < 0.45 ? "hop" : r < 0.55 ? "flap" : "";
      if (act) {
        p.classList.add(act);
        setTimeout(() => p.classList.remove(act), 1400);
      }
      setTimeout(() => wander(p), 1500 + Math.random() * 5000);
    });
  }

  // ---------- Chatter: every so often two residents meet and have a little conversation ----------
  const CHATS = [
    ["Nice weather for fishing!", "Every weather is fishing weather."],
    ["Have you seen my scarf?", "You're wearing it.", "Oh! So I am."],
    ["I caught a fish this big!", "That's a pebble.", "…A fish-shaped pebble."],
    ["Cocoa later?", "Cocoa always."],
    ["Do you ever think about krill?", "Constantly."],
    ["Race you to the water!", "…After my nap."],
    ["The big penguin got patted again.", "Lucky duck.", "Penguin.", "Lucky penguin."],
    ["I'm knitting a hat for my egg.", "Aww!", "It has little fish on it."],
    ["Waddle, waddle.", "Waddle!"],
    ["Is it fish o'clock?", "It's always fish o'clock."],
    ["My flippers are cold.", "Hug?", "Hug."],
    ["I named a snowflake Gerald.", "Where's Gerald now?", "Everywhere."],
    ["Did you hear the orcas singing?", "I thought that was you."],
    ["Best colony ever.", "Best colony ever!"],
    ["I slid on my belly all the way here.", "Again?", "Again!"],
    ["Want half my fish?", "You're the best.", "I know."],
    () => [`How many fish do we have now?`, `${fmt(S().fish)}!`, "Is that a lot?", "It's a lot."],
    () => [`There are ${fmt(D.totalColony(S()))} of us now!`, "So many friends!"],
  ];
  const NIGHT_CHATS = [
    ["Look at the stars!", "That one looks like a fish.", "They all look like fish to you."],
    ["Can't sleep.", "Count fish?", "One fish… two fish… zzz"],
    ["The fire's so cozy.", "Five more minutes.", "You said that an hour ago."],
    ["Goodnight!", "Night night!"],
  ];
  const SHORE_CHATS = {
    home: [["Good to be home.", "Home is where the ice is."]],
    krillbay: [["So. Much. Krill.", "I'll need a bigger beak."], ["The sea is fizzing today.", "That's the bubbles."]],
    sunnycove: [["Is this… a tan?", "Penguins don't tan.", "Then why am I golden?"], ["Sunscreen?", "On my beak, please."]],
    blizzard: [["WHAT?", "I SAID IT'S WINDY!", "WHAT?"], ["Huddle up!", "Already huddled!"]],
    aurorafields: [["The sky is dancing!", "Let's dance too.", "*wiggle wiggle*"], ["What makes the lights?", "Happy penguins, I think."]],
    quiethollow: [["Shh. Listen.", "…", "I hear the trees."], ["There's an owl watching us.", "It's very polite."]],
    harbour: [["Another boat came in!", "Any fish on it?", "Only fish."], ["Wet again.", "Good for the feathers!"]],
    rookery: [["Back in my day…", "Here we go.", "…we waddled uphill both ways!"], ["Granny says hi.", "Hi, Granny!"]],
  };
  const SEASON_CHATS = {
    sunlit: [["Does the sun ever set?", "Not this week!"]],
    awareness: [["Everyone's thinking about us!", "As they should."]],
    worldpenguin: [["Happy World Penguin Day!", "Isn't every day?"]],
    midwinter: [["Happy Midwinter!", "Pass the fish pie!"]],
  };

  function pickChat() {
    const special = [...(SHORE_CHATS[sceneShore()] || [])];
    if ($("colony").classList.contains("night")) special.push(...NIGHT_CHATS);
    if (M().season) special.push(...(SEASON_CHATS[M().season.id] || []));
    if (S().buffs.some(b => b.until > E.now())) special.push(["Did you see the golden fish?", "So shiny!"]);
    const pool = special.length && Math.random() < 0.5 ? special : CHATS;
    const c = pool[Math.floor(Math.random() * pool.length)];
    return typeof c === "function" ? c() : c;
  }

  const centreOf = p => { const r = p.getBoundingClientRect(); return r.left + r.width / 2; };

  function startChat() {
    const colony = $("colony");
    if (document.hidden || colony.querySelector(".chat-bubble")) return false;
    const idle = [...$("waddlers").children].filter(p => !p.classList.contains("walking") && !p.dataset.busy);
    if (idle.length < 2) return false;
    // Huddled penguins chat with each other by the fire; the rest find a neighbour
    const a = idle[Math.floor(Math.random() * idle.length)];
    const huddled = a.classList.contains("huddle");
    const others = idle.filter(p => p !== a && p.classList.contains("huddle") === huddled);
    if (!others.length) return false;
    const ax = centreOf(a);
    const b = others.reduce((best, p) => (Math.abs(centreOf(p) - ax) < Math.abs(centreOf(best) - ax) ? p : best));
    a.dataset.busy = b.dataset.busy = "1";
    const lines = [...pickChat()];
    if (b.dataset.name && Math.random() < 0.5) lines[0] = `Hey ${b.dataset.name}! ${lines[0]}`;   // friends greet each other by name
    const begin = () => {
      const bx = centreOf(b), ax2 = centreOf(a);   // turn to face each other ("flip" faces right)
      a.classList.toggle("flip", bx > ax2);
      b.classList.toggle("flip", ax2 > bx);
      speak(a, b, lines, 0);
    };
    // Far apart? The second penguin waddles over first.
    const gap = Math.abs(parseFloat(b.dataset.x) - parseFloat(a.dataset.x));
    if (huddled || S().settings.reduceMotion || gap < 14) begin();
    else {
      const side = parseFloat(b.dataset.x) > parseFloat(a.dataset.x) ? 1 : -1;
      walkTo(b, Math.max(3, Math.min(92, parseFloat(a.dataset.x) + side * (7 + Math.random() * 3))), begin);
    }
    return true;
  }

  function speak(a, b, lines, i) {
    const colony = $("colony");
    const done = () => { delete a.dataset.busy; delete b.dataset.busy; a.classList.remove("talking"); b.classList.remove("talking"); };
    if (i >= lines.length || !a.isConnected || !b.isConnected) { done(); return; }
    const who = i % 2 ? b : a;
    const bubble = document.createElement("span");
    bubble.className = "chat-bubble";
    if (who.dataset.name) {   // named residents sign their lines
      const n = document.createElement("b");
      n.className = "who";
      n.textContent = who.dataset.name;
      bubble.append(n, " ");
    }
    bubble.append(lines[i]);
    colony.appendChild(bubble);
    // Sit above the speaker, kept inside the scene, with the tail still pointing at them
    const cr = colony.getBoundingClientRect(), pr = who.getBoundingClientRect();
    const half = bubble.offsetWidth / 2, x = pr.left + pr.width / 2 - cr.left;
    const left = Math.max(half + 4, Math.min(cr.width - half - 4, x));
    bubble.style.left = `${left}px`;
    bubble.style.bottom = `${cr.bottom - pr.top + 4}px`;
    bubble.style.setProperty("--tail", `${x - left}px`);
    who.classList.add("talking");
    setTimeout(() => {
      bubble.remove();
      who.classList.remove("talking");
      setTimeout(() => speak(a, b, lines, i + 1), 300);
    }, 1500 + lines[i].length * 55);
  }

  function scheduleChat(delay) {
    setTimeout(() => { startChat(); scheduleChat(14000 + Math.random() * 16000); }, delay);
  }

  // ---------- Work: residents fetch fish from around the colony and carry them to the basket by the fire ----------
  // Each spot is a colony member's prop (the ice hole stands in for chicks, fishers and observatories).
  // rod = fish at the hole, enter = pop inside and come out with a fish, toss = a fish is thrown over from it.
  const WORK = [
    { id: "hole", kind: "rod", weight: () => fpsOf("chick") + fpsOf("fisher") + fpsOf("aurora") },
    { id: "drill", kind: "enter" }, { id: "igloo", kind: "enter" },
    { id: "krill", kind: "toss" }, { id: "trawler", kind: "toss" }, { id: "orca", kind: "toss" }, { id: "factory", kind: "toss" },
    { id: "rocket", kind: "toss" }, { id: "portal", kind: "toss" }, { id: "time", kind: "toss" },
  ];
  const fpsOf = id => E.buildingFps(id) * S().buildings[id];
  const clampX = x => Math.max(3, Math.min(92, x));
  let lastDelivery = Date.now();

  // Centre of an element in scene pixels, plus its x as a % of the scene's width
  function spotOf(el) {
    const cr = $("colony").getBoundingClientRect(), r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 - cr.left;
    return { x, y: r.top + r.height / 2 - cr.top, pct: (x / cr.width) * 100 };
  }

  function hold(p, icon) {
    let h = p.querySelector(".w-held");
    if (!icon) { if (h) h.remove(); return; }
    if (!h) { h = document.createElement("span"); h.className = "w-held"; p.appendChild(h); }
    h.textContent = icon;
    h.dataset.item = icon === "🎣" ? "rod" : "fish";
  }

  // A fish flies in a little arc between two points in the scene
  function flyFish(from, to, done) {
    const el = document.createElement("span");
    el.className = "fly-fish";
    el.textContent = "🐟";
    $("colony").appendChild(el);
    const lift = 16 + Math.abs(to.x - from.x) * 0.15, spin = to.x < from.x ? -1 : 1;
    const frames = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      const x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t - lift * 4 * t * (1 - t);
      return { transform: `translate(${x}px, ${y}px) rotate(${Math.round(spin * t * 200)}deg)` };
    });
    el.animate(frames, { duration: 700 }).onfinish = () => { el.remove(); if (done) done(to); };
  }

  function popAt(pt, text) {
    const el = document.createElement("span");
    el.className = "catch-pop";
    el.textContent = text;
    el.style.left = `${pt.x}px`;
    el.style.top = `${pt.y - 14 - $("colony").querySelectorAll(".catch-pop").length * 13}px`;   // stack if two land together
    $("colony").appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  function startWork() {
    if (document.hidden || S().settings.reduceMotion) return false;
    updateBasket();   // the hole appears with the first colony member
    const all = [...$("waddlers").children];
    const kinds = D.BUILDINGS.filter(b => S().buildings[b.id] > 0).length;
    const working = all.filter(p => p.dataset.job).length;
    if (!kinds || working >= Math.min(4, 1 + Math.floor(kinds / 3), Math.max(1, Math.floor(all.length / 2)))) return false;
    const idle = all.filter(p => !p.dataset.busy && !p.classList.contains("walking") && !p.classList.contains("huddle"));
    const jobs = WORK.map(j => ({ j, el: j.kind === "rod" ? $("iceHole") : $("props").querySelector(`[data-id="${j.id}"]`), w: Math.sqrt(j.weight ? j.weight() : fpsOf(j.id)) }))
      .filter(x => x.el && x.el.offsetParent && x.w > 0);
    if (!idle.length || !jobs.length) return false;
    // Busier colony members get visited more often (square root, so small ones still get a turn)
    let r = Math.random() * jobs.reduce((t, x) => t + x.w, 0);
    const { j, el } = jobs.find(x => (r -= x.w) <= 0) || jobs[jobs.length - 1];
    const spot = spotOf(el);
    const p = idle.reduce((best, q) => (Math.abs(q.dataset.x - spot.pct) < Math.abs(best.dataset.x - spot.pct) ? q : best));
    p.dataset.busy = p.dataset.job = j.id;
    const side = j.kind === "rod" || parseFloat(p.dataset.x) > spot.pct ? 1 : -1;   // fishers stand right of the hole, clear of the 🎣 prop
    const standX = clampX(spot.pct + side * (j.kind === "rod" ? 5 : j.kind === "enter" ? 0 : 3));
    const alive = () => p.isConnected;
    const caught = () => {
      hold(p, "🐟");
      p.classList.add("hop");
      setTimeout(() => { p.classList.remove("hop"); if (alive()) deliver(p); }, 700);
    };
    walkTo(p, standX, () => {
      p.classList.toggle("flip", spot.pct > standX);   // face the spot
      if (j.kind === "rod") {
        hold(p, "🎣");
        p.classList.add("fishing");
        setTimeout(() => {
          if (!alive()) return;
          p.classList.remove("fishing");
          hold(p, null);
          flyFish(spot, spotOf(p), () => alive() && caught());
        }, 2500 + Math.random() * 2500);
      } else if (j.kind === "enter") {
        p.classList.add("inside");
        setTimeout(() => { if (!alive()) return; p.classList.remove("inside"); caught(); }, 1800 + Math.random() * 1800);
      } else {
        setTimeout(() => alive() && flyFish(spot, spotOf(p), () => alive() && caught()), 500 + Math.random() * 800);
      }
    }, j.kind === "toss" ? 38 : 30);
    return true;
  }

  // Carry the catch to the basket and toss it in. The "+" shows what the colony caught since the last delivery.
  function deliver(p) {
    const basket = $("fishBasket"), bp = spotOf(basket);
    const standX = clampX(bp.pct + (parseFloat(p.dataset.x) > bp.pct ? 4 : -4));
    walkTo(p, standX, () => {
      p.classList.toggle("flip", bp.pct > standX);
      hold(p, null);
      const from = spotOf(p);
      flyFish({ x: from.x, y: from.y - 6 }, { x: bp.x, y: bp.y - 6 }, () => {
        basket.classList.remove("bump");
        void basket.offsetWidth;   // restart the bump animation
        basket.classList.add("bump");
        const now = Date.now(), amount = E.fishPerSecond() * Math.min(60, (now - lastDelivery) / 1000);
        lastDelivery = now;
        S().stats.deliveries++;
        if (amount > 0 && S().settings.particles) popAt(bp, `+${fmt(amount)}`);
        updateBasket();
        if (p.dataset.name) cheerFor(p.dataset.name);
      });
      setTimeout(() => { delete p.dataset.busy; delete p.dataset.job; }, 900);
    }, 4 + Math.random() * 12);
  }

  // Now and then the big penguin cheers when a named friend brings in the catch
  let lastCheer = 0;
  const CHEERS = [n => `${n} caught a whopper!`, n => `Nice one, ${n}!`, n => `${n} brought in the catch!`, n => `Look at ${n} go!`, n => `Thank you, ${n}! 🐟`];
  function cheerFor(name) {
    if (Date.now() - lastCheer < 90000 || Math.random() > 0.35) return;
    if (PI.penguin.say(CHEERS[Math.floor(Math.random() * CHEERS.length)](name))) lastCheer = Date.now();
  }

  function scheduleWork(delay) {
    setTimeout(() => { startWork(); scheduleWork(2500 + Math.random() * 3500); }, delay);
  }

  // The basket fills up as fish pile up (one more fish for roughly every 25× more), and empties as you spend
  const PILE = [[0, 0, -10], [-9, 1, 15], [9, 1, -20], [-4, 7, 25], [5, 7, -5], [-13, 4, -30], [13, 4, 30], [0, 13, 10], [-8, 12, -15], [8, 13, 20], [0, 19, -5]];
  function updateBasket() {
    const n = Math.max(0, Math.min(PILE.length, Math.ceil(Math.log10(S().fish + 1) * 0.7)));
    const pile = $("fishPile");
    if (pile.childElementCount !== n) pile.innerHTML = PILE.slice(0, n).map(([x, y, r]) => `<span style="left:${x}px;bottom:${y}px;rotate:${r}deg">🐟</span>`).join("");
    $("iceHole").classList.toggle("hidden", !D.BUILDINGS.some(b => S().buildings[b.id] > 0));
  }

  // ---------- Props at work: each colony member makes its fish in its own way ----------
  // move = how the prop itself moves; fish: out = a fish flops out onto the ice, in = one leaps up into it,
  // jump = one hops out and back; puff = a little extra that drifts up
  const wobble = deg => [{ transform: "none" }, { transform: `rotate(${-deg}deg)` }, { transform: `rotate(${deg}deg)` }, { transform: "none" }];
  const squash = [{ transform: "none" }, { transform: "scale(1.1, .9)" }, { transform: "scale(.96, 1.05)" }, { transform: "none" }];
  const PROP_ACTS = {
    drill:   { move: squash, fish: "out", puff: "💨" },
    igloo:   { move: squash, fish: "out" },
    krill:   { move: wobble(14), fish: "jump" },
    trawler: { move: [{ transform: "none" }, { transform: "translateY(3px) rotate(-7deg)" }, { transform: "none" }], fish: "in" },
    orca:    { move: [{ transform: "none" }, { transform: "translateY(-7px) rotate(-8deg)" }, { transform: "none" }], fish: "out", puff: "💦" },
    factory: { move: [{ transform: "none" }, { transform: "rotate(360deg)" }], fish: "out" },
    rocket:  { move: [{ transform: "none" }, { transform: "translateY(5px)" }, { transform: "none" }], fish: "in" },
    portal:  { move: [{ transform: "none" }, { transform: "translateX(-3px) rotate(-6deg)" }, { transform: "translateX(3px) rotate(6deg)" }, { transform: "translateX(-2px)" }, { transform: "none" }], fish: "out", puff: "✨" },
    time:    { move: wobble(10), fish: "out", puff: "💤" },
  };

  function propAct() {
    if (document.hidden || S().settings.reduceMotion) return;
    const cands = [...$("props").querySelectorAll("[data-id]")].map(el => ({ el, a: PROP_ACTS[el.dataset.id], w: Math.sqrt(fpsOf(el.dataset.id)) }))
      .filter(x => x.a && x.w > 0);
    if (!cands.length) return;
    let r = Math.random() * cands.reduce((t, x) => t + x.w, 0);
    const { el, a } = cands.find(x => (r -= x.w) <= 0) || cands[cands.length - 1];
    el.animate(a.move, { duration: 700, easing: "ease-in-out" });
    const c = spotOf(el), h = $("colony").clientHeight, w = $("colony").clientWidth;
    const dir = c.x > w * 0.6 ? -1 : 1;   // flop toward the middle of the scene
    if (a.fish === "out") flyFish(c, { x: c.x + dir * (16 + Math.random() * 18), y: Math.max(c.y + 8, h - 12 - Math.random() * 40) }, landed);
    else if (a.fish === "in") flyFish({ x: c.x - dir * 22, y: c.y + 22 }, c);
    else flyFish(c, { x: c.x + dir * 4, y: c.y });
    if (a.puff) {
      const pf = document.createElement("span");
      pf.className = "puff";
      pf.textContent = a.puff;
      pf.style.left = `${c.x + 8}px`;
      pf.style.top = `${c.y - 16}px`;
      $("colony").appendChild(pf);
      setTimeout(() => pf.remove(), 1400);
    }
  }
  // A fish that flopped onto the ice wiggles for a moment, then someone tidies it into the basket
  function landed(pt) {
    const f = document.createElement("span");
    f.className = "landed-fish";
    f.textContent = "🐟";
    f.style.left = `${pt.x}px`;
    f.style.top = `${pt.y}px`;
    $("colony").appendChild(f);
    setTimeout(() => f.remove(), 1800);
  }

  function scheduleProps(delay) {
    setTimeout(() => { propAct(); scheduleProps(1400 + Math.random() * 1800); }, delay);
  }

  // A newly bought colony member walks into the scene
  function arrival(id) {
    if (S().settings.reduceMotion) return;
    const b = D.B_BY_ID[id];
    const el = document.createElement("span");
    el.className = "arrival walking flip";
    el.style.setProperty("--step", "0.4s");
    el.innerHTML = `<span class="w-body">🐧</span><small>${b.icon}</small>`;
    el.style.bottom = `${6 + Math.random() * 26}px`;
    $("colony").appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // =====================================================================
  // Golden fish
  // =====================================================================
  function spawnGolden() {
    if (M().noGolden) return;
    const el = document.createElement("button");
    el.className = "golden-fish";
    el.textContent = "🐟";
    el.setAttribute("aria-label", "Golden fish! Catch it");
    const dur = Math.min(30, 12 * M().goldenDur);
    el.style.animationDuration = `${dur}s, .7s`;
    const left = 5 + Math.random() * 80, top = 15 + Math.random() * 65;
    el.style.left = `${left}vw`;
    el.style.top = `${top}vh`;
    let caught = false;
    const catchIt = (pos, auto) => { if (caught) return; caught = true; el.remove(); E.goldenEffect(pos, auto); };
    el.addEventListener("click", e => catchIt(pointFrom(e, el), false));
    $("goldenLayer").appendChild(el);
    setTimeout(() => el.remove(), dur * 1000);
    if (E.helperOn("lookout")) setTimeout(() => { if (document.contains(el)) catchIt(pointFrom(null, el), true); }, 3000);
    PI.bus.emit("goldenSpawn", { x: (left / 100) * innerWidth, y: (top / 100) * innerHeight });
  }

  // =====================================================================
  // Tabs, badges and the fish counter
  // =====================================================================
  function selectTab(name, focus = false) {
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
    if (currentTab === "colony") { renderUpgrades(full); tickUpgrades(); tickBuildings(); }
    if (currentTab === "workshop") tickResearch();
    if (currentTab === "heritage") { tickMigration(); if (full) { renderShores(); renderHelpers(); refreshTree(); } }
    if (currentTab === "home") { renderLetters(); if (full) renderWardrobe(); }
    if (currentTab === "achievements" && full) renderAchievements();
    if (currentTab === "stats" && full) renderStats();
  }

  function updateBadges() {
    setText($("achCount"), `${S().achievements.length}/${D.ACHIEVEMENTS.length}`);
    const claimable = S().letters.list.filter(l => !l.claimed && E.letterProgress(l) >= l.target).length
      + (S().letters.list.length && S().letters.list.every(l => l.claimed) && !S().letters.bonus ? 1 : 0);
    const lb = $("homeBadge");
    setText(lb, claimable ? String(claimable) : "");
    lb.classList.toggle("hidden", !claimable);
    $("migrateBadge").classList.toggle("hidden", !migrateIsGood());
  }

  function bumpCounter() {
    const el = $("fish").parentElement;
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }

  // Smoothly rolling fish counter: eases toward the real value instead of jumping
  let shownFish = 0;
  function tickCounter() {
    const real = S().fish;
    shownFish = Math.abs(real - shownFish) / Math.max(1, real) < 0.002 || S().settings.reduceMotion ? real : shownFish + (real - shownFish) * 0.35;
    setText($("fish"), fmt(Math.floor(shownFish)));
  }

  function tick() {
    tickCounter();
    setText($("fps"), fmt(E.fishPerSecond()));
    setText($("clickPower"), fmt(E.clickPower()));
    setText($("featherTotal"), fmt(S().feathersEarned));
    setText($("featherBonus"), M().feather >= 11 ? `×${fmt(M().feather)}` : `+${fmt((M().feather - 1) * 100)}%`);
    $("featherBadge").classList.toggle("hidden", S().feathersEarned === 0 && E.pendingFeathers() === 0);
    const title = `${fmt(Math.floor(S().fish))} fish · Penguin Idle`;
    if (document.title !== title) document.title = title;
    renderBuffs();
    renderTab(false);
    renderSheet();
  }

  function slowTick() {   // once a second: things that change slowly
    if (currentTab === "colony") renderUpgrades();
    if (currentTab === "stats") renderStats();
    updateBadges();
    rebuildScene();
    updateBasket();
    renderSeasonBadge();
  }

  function renderSeasonBadge() {
    const se = M().season;
    const b = $("seasonBadge");
    b.classList.toggle("hidden", !se);
    if (se) { setText(b, `${se.icon} ${se.name}`); b.title = se.desc; }
  }

  // ---------- Structural refresh (event-driven) ----------
  function refreshStructure() {
    refreshBuildings();
    rebuildScene();
    updateBadges();
    if (currentTab === "achievements") renderAchievements();
    if (currentTab === "heritage") { renderShores(); renderHelpers(); refreshTree(); }
    if (currentTab === "home") { renderLetters(); renderWardrobe(); }
    renderTab(false);
  }

  function wire() {
    const bus = PI.bus;
    bus.on("structure", refreshStructure);
    bus.on("buffs", refreshBuildings);
    bus.on("stateReplaced", () => { shownFish = S().fish; rebuildScene(true); renderTab(true); fillFriends(); });
    bus.on("names", () => { applyNames(); fillFriends(); });
    bus.on("letters", () => { if (currentTab === "home") renderLetters(); updateBadges(); });
    bus.on("outfit", () => { if (currentTab === "home") renderWardrobe(); });
    bus.on("buyBuilding", d => arrival(d.id));
    bus.on("milestone", d => toast(`<b>Milestone!</b> ${d.b.plural} now catch ${d.mult === 2 ? "twice" : `${+d.mult.toFixed(2)}×`} as many fish.`));
    bus.on("buyAll", d => toast(`🛍️ Bought <b>${d.count}</b> upgrade${d.count > 1 ? "s" : ""}.`));
    bus.on("golden", d => toast(d.auto ? `📯 Lookout Lumi caught a golden fish! ${d.msg}` : d.msg));
    bus.on("achievements", list => queueMemories(list));
    bus.on("respec", () => toast("🪶 <b>Feathers refunded.</b> Plant your tree however you like."));
    bus.on("hireHelper", d => toast(`${d.h.icon} <b>${d.h.name}</b> has joined the colony!`));
    bus.on("letterClaimed", d => toast(`💌 You wrote back to <b>${d.l.sender}</b>. +${fmt(d.reward)} fish`));
    bus.on("letterBonus", d => toast(`📦 <b>Care package!</b> Production ×7 for ${d.secs}s.`));
    bus.on("seasonUnlock", d => toast(`${d.season.icon} <b>${d.season.name} gift!</b> New in your wardrobe: ${d.item.name}.`));
    bus.on("migrate", d => toast(d.auto
      ? `🗓️ <b>Planner Pem</b> led the colony to ${d.shore.icon} ${d.shore.name}. +🪶 ${fmt(d.gained)}`
      : `<b>Welcome to ${d.shore.icon} ${d.shore.name}!</b> The colony settles in with 🪶 ${fmt(d.feathers)} feathers.`));
  }

  function init() {
    buildBuildingList();
    buildResearch();
    buildTree();
    buildLights();
    buildFriends();
    scheduleChat(6000 + Math.random() * 6000);
    scheduleWork(2000 + Math.random() * 2000);
    scheduleProps(1500);
    wire();

    const peng = $("bigPenguin");
    peng.addEventListener("click", e => E.clickPenguin(pointFrom(e, peng)));
    peng.addEventListener("keydown", e => { if (e.repeat && (e.key === " " || e.key === "Enter")) e.preventDefault(); });

    // Tabs with roving focus and arrow-key navigation
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
    $("buyAllBtn").addEventListener("click", e => E.buyAllUpgrades(pointFrom(e, $("buyAllBtn"))));
    $("migrateBtn").addEventListener("click", migrateFlow);
    $("respecBtn").addEventListener("click", () => openModal({
      title: "Refund your heirlooms?",
      body: `<p>Every feather spent in the Heirloom Tree comes back to you, so you can choose a different path.</p>
             <p class="muted">Helpers stay hired, and your production bonus from feathers stays the same. It's free, and you can do it any time.</p>`,
      actions: [{ label: "Keep my tree", cancel: true }, { label: "Refund feathers", primary: true, onClick: () => { E.refundTree(); E.save(); } }],
    }));

    shownFish = S().fish;
    rebuildScene(true);
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
    PI.fx.Sound.play("tick");
    renderTab(false);
    if (tooltipFn) $("tooltip").innerHTML = tooltipFn();
  }
  const cycleBuyAmount = () => { const order = ["1", "10", "100", "max"]; setBuyAmount(order[(order.indexOf(String(buyAmount)) + 1) % order.length]); };

  PI.ui = {
    init, tick, slowTick, openModal, toast, selectTab, spawnGolden, bumpCounter, migrateFlow,
    cycleBuyAmount, refreshStructure, renderTab, closeSheet, chatNow: startChat, workNow: startWork, propNow: propAct,
    buildingRow: id => els[id] && els[id].root,
    get modalOpen() { return modals.length > 0; },
    get currentTab() { return currentTab; },
  };
})(window.PI = window.PI || {});
