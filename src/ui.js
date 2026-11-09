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
  // Toasts stack in the bottom-left corner. Clicking one (anywhere but its button) dismisses it.
  // While the colony naps (and for a moment after) notes wait, so the wake card arrives on its own
  let heldToasts = [], holdUntil = 0;
  function toast(html, ms = 4500) {
    if (PI.napping || Date.now() < holdUntil) { heldToasts.push([html, ms]); return; }
    const box = $("toasts");
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
      heldToasts.splice(0).slice(-3).forEach(([h, ms]) => toast(h, ms));   // the latest few are plenty
      if (memoryQueue.length) queueMemories([]);
    }, delay);
  }
  function queueMemories(list) {
    memoryQueue.push(...list);
    clearTimeout(memoryTimer);
    memoryTimer = setTimeout(() => {
      if (PI.napping || Date.now() < holdUntil) return;   // afterNap() lets them out
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
      setText(e.cost, `${n > 1 || buyAmount === "max" ? `${n}× ` : ""}🐟 ${fmt(cost)}`);
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
          <div class="name">${r.name} <span class="r-level"></span> <span class="cost r-cost"></span></div>
          <div class="desc r-effect"></div>
          <div class="r-bar" aria-hidden="true"><div></div></div>
        </div>`;
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
    setText($("migrateLifetimeFish"), fmt(S().lifetimeFish));
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
      const stamped = (S().shoreStamps || []).includes(sh.id);
      return `<button class="shore${here ? " here" : ""}${next ? " next" : ""}${open ? "" : " locked"}" data-id="${sh.id}"${open ? "" : " disabled"}
        aria-pressed="${next}" aria-label="${sh.name}: ${sh.desc}${here ? " You live here now." : ""}${next ? " Your next stop." : ""}${open ? "" : ` Unlocks after ${sh.unlockAt - 1} migrations.`}">
        <div class="sh-icon" aria-hidden="true">${open ? sh.icon : "🔒"}</div>
        <div><div class="name">${sh.name}</div>
        <div class="desc">${open ? sh.desc : `Unlocks after ${sh.unlockAt - 1} migration${sh.unlockAt - 1 === 1 ? "" : "s"}`}</div>
        ${here || next || (visited && !here) || stamped ? `<div class="sh-tags">${here ? '<span class="tag">You\'re here</span>' : ""}${next ? '<span class="tag next">👣 Next stop</span>' : ""}${visited && !here ? '<span class="tag visited">Visited</span>' : ""}${stamped ? '<span class="tag stamped">🛂 Stamped</span>' : ""}</div>` : ""}</div></button>`;
    }).join("");
    // Progress toward the two shore memories, shown above the list
    setText($("shoreMemories"), ["shores_3", "shores_all"].map(id => D.ACHIEVEMENTS.find(a => a.id === id)).map(a => {
      if (S().achievements.includes(a.id)) return `${a.icon} ${a.name} ✓`;
      const p = E.memoryProgress(a);
      return `${a.icon} ${a.name} ${p.cur}/${p.goal}`;
    }).join(" · "));
    if (setHTML($("shores"), html)) {
      $("shores").querySelectorAll(".shore:not(.locked)").forEach(el => el.addEventListener("click", () => E.setNextShore(el.dataset.id)));
    }
  }

  function renderPassport() {
    const box = $("passportGrid");
    if (!box) return;
    const stamps = S().shoreStamps || [];
    setText($("passportCount"), `${stamps.length} / ${D.PASSPORT_STAMPS.length} Stamps`);
    const hereShore = S().shore;
    const avail = E.availableShores().map(s => s.id);

    const html = D.PASSPORT_STAMPS.map(stamp => {
      const isStamped = stamps.includes(stamp.id);
      const isHere = hereShore === stamp.id;
      const sh = D.SHORE_BY_ID[stamp.shoreId];
      const prog = E.passportProgress(stamp.id);
      const unlocked = avail.includes(stamp.shoreId);

      let statusHtml = "";
      if (isStamped) {
        const dateStr = S().shoreStampDates && S().shoreStampDates[stamp.id]
          ? new Date(S().shoreStampDates[stamp.id]).toLocaleDateString() : "Stamped";
        statusHtml = `
          <div class="stamp-seal-wrap">
            <span class="stamp-seal" aria-label="Stamped on ${dateStr}">
              <span class="seal-icon">${stamp.stampIcon || "🛂"}</span> STAMPED
            </span>
            <span class="stamp-date">${dateStr}</span>
          </div>`;
      } else {
        const curVal = prog.time ? fmtTime(prog.cur) : fmt(prog.cur);
        const targetVal = prog.time ? fmtTime(prog.target) : fmt(prog.target);
        const pct = Math.floor(prog.frac * 100);
        const destLabel = S().migrations < 1 ? "Locked (needs 1 migration)"
                        : isHere ? '<span class="stamp-live">Active Shore</span>'
                        : (unlocked ? "Visit shore to stamp" : "Locked shore");
        statusHtml = `
          <div class="stamp-prog">
            <div class="stamp-bar" aria-hidden="true"><div style="width:${pct}%"></div></div>
            <div class="stamp-prog-foot">
              <span>${curVal} / ${targetVal}</span>
              <span class="stamp-dest">${destLabel}</span>
            </div>
          </div>`;
      }

      return `
        <div class="stamp-card${isStamped ? " stamped" : ""}${isHere && !isStamped ? " current-shore" : ""}">
          <div class="stamp-head">
            <div class="stamp-shore-icon" aria-hidden="true">${stamp.icon}</div>
            <div class="stamp-head-text">
              <div class="stamp-title">${stamp.name}</div>
              <div class="stamp-shore-name">${sh ? sh.name : stamp.shoreId}</div>
            </div>
          </div>
          <p class="stamp-desc">${stamp.desc}</p>
          <div class="stamp-reward"><b>Perk:</b> ${stamp.rewardDesc}</div>
          <div class="stamp-foot">${statusHtml}</div>
        </div>`;
    }).join("");

    setHTML(box, html);
  }

  function renderHelpers() {
    const spend = E.spendableFeathers();
    const curForemanStrat = E.foremanStrategy ? E.foremanStrategy() : (S().foremanStrategy || "impact");
    const foremanStratObj = (D.FOREMAN_STRATEGY_BY_ID && D.FOREMAN_STRATEGY_BY_ID[curForemanStrat]) || (D.FOREMAN_STRATEGIES && D.FOREMAN_STRATEGIES[0]) || { desc: "" };

    const curShopStrat = E.shopkeeperStrategy ? E.shopkeeperStrategy() : (S().shopkeeperStrategy || "impact");
    const shopStratObj = (D.SHOPKEEPER_STRATEGY_BY_ID && D.SHOPKEEPER_STRATEGY_BY_ID[curShopStrat]) || (D.SHOPKEEPER_STRATEGIES && D.SHOPKEEPER_STRATEGIES[0]) || { desc: "" };

    const curDiverStrat = E.diverStrategy ? E.diverStrategy() : (S().diverStrategy || "hunter");
    const diverStratObj = (D.DIVER_STRATEGY_BY_ID && D.DIVER_STRATEGY_BY_ID[curDiverStrat]) || (D.DIVER_STRATEGIES && D.DIVER_STRATEGIES[0]) || { desc: "" };

    const html = D.HELPERS.map(h => {
      const hired = h.id in S().helpers, on = E.helperOn(h.id);
      const action = hired
        ? `<button class="btn small toggle${on ? " on" : ""}" data-toggle="${h.id}" aria-pressed="${on}">${on ? "On" : "Off"}</button>`
        : `<button class="btn small${spend >= h.cost ? " primary" : ""}" data-hire="${h.id}"${spend >= h.cost ? "" : " disabled"}>Hire · 🪶 ${fmt(h.cost)}</button>`;

      let stratHtml = "";
      if (h.id === "foreman" && hired && D.FOREMAN_STRATEGIES) {
        stratHtml = `
          <div class="strat-group" role="group" aria-label="Foreman buying strategy">
            <div class="strat-pills">
              ${D.FOREMAN_STRATEGIES.map(st => `
                <button class="strat-pill${curForemanStrat === st.id ? " active" : ""}" data-foreman-strat="${st.id}" aria-pressed="${curForemanStrat === st.id}" title="${st.desc}">
                  <span aria-hidden="true">${st.icon}</span> ${st.label}
                </button>
              `).join("")}
            </div>
            <div class="strat-desc">${foremanStratObj.desc}</div>
          </div>`;
      } else if (h.id === "shopkeeper" && hired && D.SHOPKEEPER_STRATEGIES) {
        stratHtml = `
          <div class="strat-group" role="group" aria-label="Shopkeeper buying strategy">
            <div class="strat-pills">
              ${D.SHOPKEEPER_STRATEGIES.map(st => `
                <button class="strat-pill${curShopStrat === st.id ? " active" : ""}" data-shopkeeper-strat="${st.id}" aria-pressed="${curShopStrat === st.id}" title="${st.desc}">
                  <span aria-hidden="true">${st.icon}</span> ${st.label}
                </button>
              `).join("")}
            </div>
            <div class="strat-desc">${shopStratObj.desc}</div>
          </div>`;
      } else if (h.id === "diver" && hired && D.DIVER_STRATEGIES) {
        stratHtml = `
          <div class="strat-group" role="group" aria-label="Diver expedition strategy">
            <div class="strat-pills">
              ${D.DIVER_STRATEGIES.map(st => `
                <button class="strat-pill${curDiverStrat === st.id ? " active" : ""}" data-diver-strat="${st.id}" aria-pressed="${curDiverStrat === st.id}" title="${st.desc}">
                  <span aria-hidden="true">${st.icon}</span> ${st.label}
                </button>
              `).join("")}
            </div>
            <div class="strat-desc">${diverStratObj.desc}</div>
          </div>`;
      }

      return `<div class="helper${hired ? " hired" : ""}${on ? " on" : ""}"><div class="hp-icon" aria-hidden="true">${h.icon}</div>
        <div><div class="name">${h.name}</div><div class="desc">${h.desc}</div>${stratHtml}</div>${action}</div>`;
    }).join("");

    if (setHTML($("helpers"), html)) {
      $("helpers").querySelectorAll("[data-hire]").forEach(b => b.addEventListener("click", e => E.hireHelper(b.dataset.hire, pointFrom(e, b))));
      $("helpers").querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => {
        E.toggleHelper(b.dataset.toggle);
        const nb = $("helpers").querySelector(`[data-toggle="${b.dataset.toggle}"]`);
        if (nb) nb.focus({ preventScroll: true });
      }));
      $("helpers").querySelectorAll("[data-foreman-strat]").forEach(b => b.addEventListener("click", () => {
        E.setForemanStrategy(b.dataset.foremanStrat);
        const nb = $("helpers").querySelector(`[data-foreman-strat="${b.dataset.foremanStrat}"]`);
        if (nb) nb.focus({ preventScroll: true });
      }));
      $("helpers").querySelectorAll("[data-shopkeeper-strat]").forEach(b => b.addEventListener("click", () => {
        E.setShopkeeperStrategy(b.dataset.shopkeeperStrat);
        const nb = $("helpers").querySelector(`[data-shopkeeper-strat="${b.dataset.shopkeeperStrat}"]`);
        if (nb) nb.focus({ preventScroll: true });
      }));
      $("helpers").querySelectorAll("[data-diver-strat]").forEach(b => b.addEventListener("click", () => {
        E.setDiverStrategy(b.dataset.diverStrat);
        const nb = $("helpers").querySelector(`[data-diver-strat="${b.dataset.diverStrat}"]`);
        if (nb) nb.focus({ preventScroll: true });
      }));
    }
  }

  // Heirloom Tree visualization has been moved to src/ui-activities.js (PI.activities)
  const buildTree = () => PI.activities.buildTree();
  const refreshTree = () => PI.activities.refreshTree();
  const drawTreeLines = () => PI.activities.drawTreeLines();

  // =====================================================================
  // Home: penguin letters and the wardrobe
  // =====================================================================
  function renderLetters() {
    const L = S().letters;
    const lt = id => D.LETTER_TYPES.find(t => t.id === id);
    const html = L.list.map((l, i) => {
      const prog = E.letterProgress(l), done = prog >= l.target;
      return `<div class="letter${l.claimed ? " claimed" : done ? " ready" : ""}${l.late ? " late" : ""}">
        <div class="l-from"><span aria-hidden="true">${l.icon}</span> From <b>${l.sender}</b>${l.late ? ' <span class="late-tag">Late · from yesterday</span>' : ""}</div>
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
    const today = E.todaysLetters();
    const allDone = today.length && today.every(l => l.claimed);
    const late = L.list.some(l => l.late) ? " Late letters from yesterday stay open until midnight." : "";
    const bonus = L.bonus ? '<p class="muted">📦 Today\'s care package has been opened. New letters arrive tomorrow.</p>'
      : allDone ? '<button class="btn primary" id="bonusBtn">📦 Open the care package (production ×7 for a while)</button>'
      : `<p class="muted">Answer all three letters today for a care package. New letters arrive each day, with no pressure to keep a streak.${late}</p>`;
    if (setHTML($("letterBonus"), bonus) && $("bonusBtn")) $("bonusBtn").addEventListener("click", e => E.claimLetterBonus(pointFrom(e, $("bonusBtn"))));
  }

  function renderWardrobe() {
    const html = Object.entries(D.COSMETIC_SLOTS).map(([slot, label]) => {
      const items = D.COSMETICS[slot].map(c => {
        const unlocked = c.need(S()), worn = S().cosmetics[slot] === c.id;
        const swatch = c.emoji !== undefined ? (c.emoji || "∅")
          : `<span class="swatch" style="background:${(c.beanie || c.colors || c.mask)[0].startsWith("url") ? "linear-gradient(90deg,#ff9a8b,#ffd27a,#a6e3bd,#a9c8ff,#d9b3ff)" : (c.beanie || c.colors || c.mask)[0]}"></span>`;
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

  // Campfire Kettle and Diving & Relics have been moved to src/ui-activities.js (PI.activities)
  const renderKettle = () => PI.activities.renderKettle();
  const updateSceneIceHole = () => PI.activities.updateSceneIceHole();
  const renderDiving = () => PI.activities.renderDiving();
  const renderRelicShelf = () => PI.activities.renderRelicShelf();
  const popRelicReward = (res, origin) => PI.activities.popRelicReward(res, origin);

  // =====================================================================
  // Memories and stats
  // =====================================================================
  // "Ends in N days" or "starts in N days" for the real-date seasonal event, found by walking forward day by day.
  // Cached per local day, so it costs nothing on the frame loop.
  let seasonNoteDay = "", seasonNoteText = "";
  function seasonNote() {
    const now = new Date(E.now());
    const key = E.dayKey(now);
    if (key === seasonNoteDay) return seasonNoteText;
    seasonNoteDay = key;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const cur = E.currentSeason(start);
    seasonNoteText = "";
    for (let d = 1; d <= 366; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d, 12);
      const se = E.currentSeason(day);
      if ((se ? se.id : "") !== (cur ? cur.id : "")) {
        const when = d === 1 ? "tomorrow" : `in ${d} days`;
        seasonNoteText = cur ? `${cur.icon} ${cur.name} ends ${when}.` : `${se.icon} ${se.name} starts ${when}.`;
        break;
      }
    }
    return seasonNoteText;
  }

  function renderAchievements() {
    setText($("seasonNote"), seasonNote());
    $("seasonNote").classList.toggle("hidden", !seasonNote());
    const card = (a, extra = "") => {
      const done = S().achievements.includes(a.id);
      let prog = "", almost = "";
      const when = done && S().achDates[a.id] ? `<div class="a-date">Collected<b>${new Date(S().achDates[a.id]).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</b></div>` : "";
      const p = !done && E.memoryProgress(a);
      if (p) {
        const pct = Math.floor(p.frac * 100);
        const show = v => (p.kind === "time" ? fmtTime(v) : fmt(Math.floor(v)));
        // At 90% or more the card gets an "Almost!" marker and a glowing bar, instead of a toast
        if (pct >= 90) almost = ' <span class="a-almost">Almost!</span>';
        prog = `<div class="a-prog ${pct >= 90 ? "hot" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progress">
          <div class="a-bar"><span style="width:${pct}%"></span></div><div class="a-num">${show(p.cur)} / ${show(p.goal)}</div></div>`;
      } else if (!done && a.hint) prog = `<div class="a-hint">💡 ${a.hint}</div>`;
      // Collected since the player last left this tab
      if (done && S().achNew.includes(a.id)) almost += ' <span class="a-almost">New</span>';
      return `<div class="ach ${done ? "done" : ""} ${extra}">
        <div class="a-icon" aria-hidden="true">${a.icon}${a.badge ? `<span class="a-badge">${a.badge}</span>` : ""}</div>
        <div><div class="name">${a.name}${done ? "" : ' <span class="visually-hidden">(locked)</span>'}${almost}</div><div class="desc">${a.desc}</div>${prog}</div>${when}</div>`;
    };
    // Memories that are more than halfway done float to a "Nearly there" row
    const near = E.nearestMemories(3, 0.5);
    $("achNear").classList.toggle("hidden", !near.length);
    setHTML($("achNear"), near.length ? `<h3>Nearly there</h3><div class="ach-grid">${near.map(m => card(m.a, "near")).join("")}</div>` : "");
    // Order: locked memories closest to done first (ones with no progress bar last), then collected ones, newest first
    const frac = a => { const p = E.memoryProgress(a); return p ? p.frac : -1; };
    const dateOf = a => S().achDates[a.id] || 0;
    const hideDone = !!S().settings.hideDone;
    const all = D.ACHIEVEMENTS.filter(a => !hideDone || !S().achievements.includes(a.id));
    const locked = all.filter(a => !S().achievements.includes(a.id)).sort((x, y) => frac(y) - frac(x));
    const collected = all.filter(a => S().achievements.includes(a.id)).sort((x, y) => dateOf(y) - dateOf(x));
    setHTML($("achievements"), [...locked, ...collected].map(a => card(a)).join(""));
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
    // Minutes the colony napped are shaded behind the line
    const step = (W - 2 * pad) / (vals.length - 1);
    const naps = h.map((p, i) => (p[2] ? `<rect class="g-nap" x="${(pad + (i - 0.5) * step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}"/>` : "")).join("");
    const napped = h.some(p => p[2]);
    setHTML(box, `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Fish per second over the last ${fmtTime(span)}, from ${fmt(Math.pow(10, lo))} to ${fmt(Math.pow(10, hi))}">
        ${naps}<polyline points="${pad},${H - pad} ${pts} ${W - pad},${H - pad}" class="g-fill"/><polyline points="${pts}" class="g-line"/></svg>
      <div class="g-axis"><span>${fmtTime(span)} ago</span><span>${fmt(Math.pow(10, lo))} → ${fmt(Math.pow(10, hi))} /s (log scale)</span><span>now</span></div>${napped ? '<p class="g-key"><span class="g-swatch"></span> Napping</p>' : ""}`);
  }

  function renderStats() {
    const st = S().stats;
    const rows = [
      ["Fish caught this migration", fmt(S().runFish)],
      ["Fish caught all time", fmt(S().lifetimeFish)],
      ["Fish from patting", fmt(st.clickFish)],
      ["Penguin pats", fmt(st.clicks)],
      ["Pats by rubbing", fmt(st.rubPats)],
      ["Big Catches", `${fmt(st.bigCatches)} (${+(M().critChance * 100).toFixed(1)}% chance, ×${fmt(M().critMult)})`],
      ["Golden fish caught", fmt(st.goldenClicks)],
      ["Exotic fish caught", fmt(st.exoticCatches || 0)],
      ["Colony members", fmt(D.totalColony(S()))],
      ["Upgrades owned", `${S().upgrades.length}`],
      ["Workshop levels", `${Object.values(S().research).reduce((a, b) => a + b, 0)}`],
      ["Heirloom levels", `${Object.values(S().heritage).reduce((a, b) => a + b, 0)}`],
      ["Migrations", `${S().migrations}`],
      ["Shores visited", `${S().shoresVisited.length} of ${D.SHORES.length}`],
      ["Passport stamps", `${(S().shoreStamps || []).length} of ${D.PASSPORT_STAMPS.length}`],
      ["Campfire meals cooked", fmt(st.dishesCooked || 0)],
      ["Deep-sea dives completed", fmt(st.divesCompleted || 0)],
      ["Relics discovered", `${Object.keys(S().relics || {}).length} of ${D.RELICS.length}`],
      ["Letters answered", fmt(st.lettersClaimed)],
      ["Catches carried to the basket", fmt(st.deliveries)],
      ["Music listened to", fmtTime(st.musicSeconds)],
      ["Time spent napping", fmtTime(st.napSeconds)],
      ["Extra fish from the nap bonus", fmt(st.napBonusFish)],
      ["Nap streak", `${E.napStreakNow()} day${E.napStreakNow() === 1 ? "" : "s"} (best ${S().napStreak.best})`],
      ["Feather bonus", `+${fmt((M().feather - 1) * 100)}%`],
      ["Memories bonus", `+${fmt((M().ach - 1) * 100)}%`],
      ["This migration started", `${fmtTime((E.now() - st.runStartedAt) / 1000)} ago`],
      ["Playing since", new Date(st.startedAt).toLocaleDateString()],
    ];
    setHTML($("stats"), rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join(""));
    renderNapStarList();
    renderStatsGraph();
  }

  function renderBuffs() {
    const now = E.now();
    const html = S().buffs.filter(b => b.until > now)
      .map(b => `<span class="buff">${b.name} ×${b.mult} · ${Math.ceil((b.until - now) / 1000)}s</span>`).join("");
    if ($("buffs").innerHTML !== html) $("buffs").innerHTML = html;
  }

  // Colony scene and golden fish simulation have been moved to src/scene.js (PI.scene)

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
    if (currentTab === "colony") { renderUpgrades(full); tickUpgrades(); tickBuildings(); }
    if (currentTab === "workshop") tickResearch();
    if (currentTab === "heritage") { tickMigration(); if (full) { renderShores(); renderPassport(); renderHelpers(); refreshTree(); } }
    if (currentTab === "home") { renderLetters(); renderLetterReset(); renderKettle(); renderDiving(); if (full) { renderWardrobe(); renderRelicShelf(); } }
    if (currentTab === "achievements" && full) renderAchievements();
    if (currentTab === "stats" && full) renderStats();
  }

  function updateBadges() {
    setText($("achCount"), `${S().achievements.length}/${D.ACHIEVEMENTS.length}`);
    // Memories collected since the Memories tab was last left (hidden while you're on that tab)
    const nNew = S().achNew.length;
    setText($("achNew"), `${nNew} new`);
    $("achNew").classList.toggle("hidden", !nNew || currentTab === "achievements");
    // Home: how many mailbox items are still left (unclaimed letters, plus the bonus once they're all done).
    // Gold when something is ready to claim.
    const letters = S().letters.list;
    const today = E.todaysLetters();
    const bonusDue = today.length && today.every(l => l.claimed) && !S().letters.bonus ? 1 : 0;
    const left = letters.filter(l => !l.claimed).length + bonusDue;
    const claimable = letters.filter(l => !l.claimed && E.letterProgress(l) >= l.target).length + bonusDue;
    const lb = $("homeBadge");
    setText(lb, left ? String(left) : "");
    lb.classList.toggle("hidden", !left);
    lb.classList.toggle("ready", claimable > 0);
    // The ring fills with the share of this round's letters already claimed
    const claimed = today.filter(l => l.claimed).length;
    lb.style.setProperty("--done", String(today.length ? Math.round((claimed / today.length) * 100) : 0));
    lb.classList.toggle("full", !!today.length && claimed === today.length);
    $("migrateBadge").classList.toggle("hidden", !migrateIsGood());
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

  // What you're saving up for, under the penguin
  // Countdown to the daily letters reset (local midnight), in the Mailbox and the top bar
  function renderLetterReset() {
    const secs = E.secsToNewDay(new Date(E.now()));
    const h = Math.floor(secs / 3600), mi = Math.floor((secs % 3600) / 60);
    const left = `${h}h ${String(mi).padStart(2, "0")}m`;
    setText($("letterReset"), `New letters in ${left}`);
    const top = $("resetIn");
    setText(top, `Letters reset in ${left}`);
    // The top-bar countdown is a shortcut to the Mailbox
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
    // A memory that is nearly collected gets a mention too; clicking the line opens the Memories tab
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
    const el = $("fish").parentElement;
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }

  // Smoothly rolling fish counter: eases toward the real value instead of jumping
  let shownFish = 0;
  function tickCounter() {
    renderLetterReset();
    const real = S().fish;
    shownFish = Math.abs(real - shownFish) / Math.max(1, real) < 0.002 || S().settings.reduceMotion || PI.powerSaving ? real : shownFish + (real - shownFish) * 0.35;
    setText($("fish"), fmt(Math.floor(shownFish)));
  }

  // The warmth meter under the penguin: fills as you keep patting, cools when you stop
  function renderWarmth() {
    const w = E.warmthLevel(), box = $("warmth");
    box.classList.toggle("on", w > 0);
    box.classList.toggle("toasty", w >= 1);
    $("warmthFill").style.width = `${Math.round(w * 100)}%`;
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
    renderSheet();
  }

  // One little lavender star in the sky for every hour the colony has napped (up to 24)
  function renderNapStars() {
    const n = Math.min(D.NAP_STARS, Math.floor(S().stats.napSeconds / 3600)), box = $("napStars");
    $("colony").classList.toggle("moonlit", n >= D.NAP_STARS);
    if (box.childElementCount === n) return;
    box.innerHTML = Array.from({ length: n }, (_, i) => {
      // Scattered like a real sky, but each star keeps its place: x steps along evenly, y comes from a fixed hash
      const hash = k => { const v = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
      const x = 4 + ((i * 0.618034 + 0.13) % 1) * 92, y = 8 + hash(i + 1) * 34;
      return `<span data-star="${i}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;animation-delay:${(i % 7) * 0.6}s">✦</span>`;
    }).join("");
  }
  function napStarNote(i) {
    return `✦ <b>Nap star ${i + 1}</b><br>${S().napStars[i] ? `Earned ${napStarText(i)}, ${i + 1} hour${i ? "s" : ""} into your naps.` : "Earned before the stars kept dates."}`;
  }

  function renderNapStarList() {
    const n = Math.min(D.NAP_STARS, Math.floor(S().stats.napSeconds / 3600)), box = $("napStarList");
    box.classList.toggle("hidden", !n);
    if (!n) return;
    setText(box.querySelector("summary"), `✦ Nap stars: ${n} of ${D.NAP_STARS}${n >= D.NAP_STARS ? " (the sky is moonlit)" : ""}`);
    setHTML(box.querySelector("ol"), Array.from({ length: n }, (_, i) => `<li>${napStarText(i)}</li>`).join(""));
  }
  function napStarText(i) {
    const t = S().napStars[i];
    return t ? new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
      : "Before the stars kept dates";
  }

  function bindNapStars() {
    $("napStars").addEventListener("click", e => {
      const s = e.target.closest("[data-star]");
      if (s) { e.stopPropagation(); toast(napStarNote(Number(s.dataset.star))); }
    });
  }

  function slowTick() {   // once a second: things that change slowly
    renderNapStars();
    if (currentTab === "colony") renderUpgrades();
    if (currentTab === "home") { renderKettle(); renderDiving(); }
    if (currentTab === "stats") renderStats();
    const active = E.activeDish ? E.activeDish() : null;
    const sceneKettle = $("sceneKettle");
    if (sceneKettle) sceneKettle.classList.toggle("simmering", !!active);
    updateSceneIceHole();
    updateBadges();
    renderNextGoal();
    PI.scene.rebuildScene();
    PI.scene.updateBasket();
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
    PI.scene.rebuildScene();
    updateBadges();
    updateSceneIceHole();
    if (currentTab === "achievements") renderAchievements();
    if (currentTab === "heritage") { renderShores(); renderPassport(); renderHelpers(); refreshTree(); }
    if (currentTab === "home") { renderLetters(); renderWardrobe(); renderKettle(); renderDiving(); renderRelicShelf(); }
    renderTab(false);
  }

  function wire() {
    const bus = PI.bus;
    bus.on("structure", refreshStructure);
    bus.on("buffs", refreshBuildings);
    bus.on("stateReplaced", () => { shownFish = S().fish; PI.scene.rebuildScene(true); renderTab(true); PI.scene.fillFriends(); });
    bus.on("names", () => { PI.scene.applyNames(); PI.scene.fillFriends(); });
    bus.on("letters", () => { if (currentTab === "home") renderLetters(); updateBadges(); });
    bus.on("outfit", () => { if (currentTab === "home") renderWardrobe(); });
    bus.on("buyBuilding", d => PI.scene.arrival(d.id));
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
      ?"😴 <b>7 nap days in a row!</b> The Sleep Mask is in your wardrobe."
      : `😴 <b>Nap streak: ${ns.count} day${ns.count === 1 ? "" : "s"}</b>${ns.best < 7 ? ` · ${7 - ns.count} more for the Sleep Mask` : ""}`));
    bus.on("respec", () => toast("🪶 <b>Feathers refunded.</b> Plant your tree however you like."));
    bus.on("hireHelper", d => toast(`${d.h.icon} <b>${d.h.name}</b> has joined the colony!`));
    bus.on("passportStamp", d => {
      const shName = (d.shore && d.shore.name) || (D.SHORE_BY_ID[d.stamp.shoreId] && D.SHORE_BY_ID[d.stamp.shoreId].name) || "";
      toast(`🛂 <b>Passport Stamped!</b> ${d.stamp.icon} <b>${d.stamp.name}</b> (${shName}): ${d.stamp.rewardDesc}`);
      if (currentTab === "heritage") renderPassport();
    });
    bus.on("dishCooked", d => {
      toast(`${d.recipe.icon} <b>${d.recipe.name}</b> is simmering over the campfire! ${d.recipe.effectDesc}`);
      if (currentTab === "home") renderKettle();
      const sceneKettle = $("sceneKettle");
      if (sceneKettle) sceneKettle.classList.add("simmering");
    });
    bus.on("dishFinished", d => {
      if (d.recipe) toast(`🥣 The pot of <b>${d.recipe.name}</b> has been enjoyed by the colony.`);
      if (currentTab === "home") renderKettle();
      const sceneKettle = $("sceneKettle");
      if (sceneKettle) sceneKettle.classList.remove("simmering");
    });
    bus.on("diveStarted", d => {
      toast(`🤿 Diver plunged into the <b>${d.spot.name}</b>!`, 3500);
      if (currentTab === "home") renderDiving();
      updateSceneIceHole();
    });
    bus.on("diveReady", d => {
      toast(`🤿 <b>Diver Returned!</b> Resurfaced from the ${d.spot.name}. Tap the Ice Hole or visit Home to collect!`);
      if (currentTab === "home") renderDiving();
      updateSceneIceHole();
    });
    bus.on("relicFound", d => {
      if (currentTab === "home") { renderDiving(); renderRelicShelf(); }
      updateSceneIceHole();
    });
    bus.on("letterClaimed", d => toast(`💌 You wrote back to <b>${d.l.sender}</b>. +${fmt(d.reward)} fish`));
    bus.on("letterBonus", d => toast(`📦 <b>Care package!</b> Production ×7 for ${d.secs}s.`));
    bus.on("seasonUnlock", d => toast(`${d.season.icon} <b>${d.season.name} gift!</b> New in your wardrobe: ${d.item.name}.`));
    bus.on("migrate", d => toast(d.auto
      ? `🗓️ <b>Planner Pem</b> led the colony to ${d.shore.icon} ${d.shore.name}. +🪶 ${fmt(d.gained)}`
      : `<b>Welcome to ${d.shore.icon} ${d.shore.name}!</b> The colony settles in with 🪶 ${fmt(d.feathers)} feathers.`));
  }

  // Patting: a tap or click pats once, rubbing back and forth (or up and down) pats as you go,
  // and holding still keeps patting after a moment (unless switched off in Settings).
  // Keyboard Space/Enter still arrive as clicks.
  const STROKE_PX = 40;        // finger/mouse travel per stroke pat
  const STROKE_GAP = 70;       // fastest stroke pats can come (ms), about 14 a second
  const HOLD_DELAY = 450;      // hold this long before patting starts repeating
  const HOLD_EVERY = 200;      // then pat this often (5 a second)
  function wirePatting(peng) {
    let active = null;         // { id, x, y, travel, lastPat, holdTimer }
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
      // The mitten tilts the way you're rubbing
      if (Math.abs(dx) > 2) {
        peng.classList.toggle("rub-r", dx > 0);
        peng.classList.toggle("rub-l", dx < 0);
      }
      if (active.travel < STROKE_PX) return;
      startHold();             // moving resets the hold, so a rub never doubles up with it
      const t = performance.now();
      if (t - active.lastPat < STROKE_GAP) return;
      active.travel = 0;
      active.lastPat = t;
      if (!peng.classList.contains("rub-l") && !peng.classList.contains("rub-r")) peng.classList.add("rub-r");   // up-and-down rubs tilt too
      pat({ x: e.clientX, y: e.clientY }, "rub");
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => peng.addEventListener(ev, end));
    // Pointer presses already patted on pointerdown; only keyboard clicks (detail 0) pat here
    peng.addEventListener("click", e => { if (e.detail === 0) pat(pointFrom(e, peng), "tap"); });
  }

  function init() {
    buildBuildingList();
    buildResearch();
    buildTree();
    PI.scene.init();
    wire();
    bindNapStars();

    const peng = $("bigPenguin");
    wirePatting(peng);
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
            popRelicReward(res, pointFrom(e, iceHoleEl));
            renderDiving();
            renderRelicShelf();
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
    PI.scene.rebuildScene(true);
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
    init, tick, slowTick, openModal, toast, afterNap, selectTab, bumpCounter, migrateFlow,
    cycleBuyAmount, refreshStructure, renderTab, closeSheet, hideTooltip, updateBadges, renderNextGoal,
    spawnGolden: force => PI.scene.spawnGolden(force),
    chatNow: () => PI.scene.startChat(),
    workNow: () => PI.scene.startWork(),
    propNow: () => PI.scene.propAct(),
    buildingRow: id => els[id] && els[id].root,
    get modalOpen() { return modals.length > 0; },
    get currentTab() { return currentTab; },
    // Helpers and activities exposed for scene and sub-panels
    buildingTooltip,
    attachTooltip,
    selectForSheet,
    pointFrom,
    isTouch,
    updateSceneIceHole,
    buildTree,
    refreshTree,
    drawTreeLines,
    renderKettle,
    renderDiving,
    renderRelicShelf,
    popRelicReward,
  };
})(window.PI = window.PI || {});
