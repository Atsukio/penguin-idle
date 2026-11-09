/* Penguin Idle: migration, shores, passport stamps, helpers, letters and wardrobe.
 * Moved verbatim from panels.js; helpers from other files are reached through one-line forwarders. */
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

  // =====================================================================
  // Migration: shores, helpers and passport
  // =====================================================================
  const migrateIsGood = () => E.pendingFeathers() >= Math.max(1, S().feathersEarned);

  function tickMigration() {
    const pend = E.pendingFeathers();
    setText($("pendingFeathers"), fmt(pend));
    setText($("nextFeather"), fmt(E.nextFeatherAt()));
    setText($("migrateLifetimeFish"), fmt(S().lifetimeFish));
    const btn = $("migrateBtn");
    if (btn) btn.disabled = pend < 1;
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
    const shoreMem = $("shoreMemories");
    if (shoreMem) {
      setText(shoreMem, ["shores_3", "shores_all"].map(id => D.ACHIEVEMENTS.find(a => a.id === id)).map(a => {
        if (S().achievements.includes(a.id)) return `${a.icon} ${a.name} ✓`;
        const p = E.memoryProgress(a);
        return `${a.icon} ${a.name} ${p.cur}/${p.goal}`;
      }).join(" · "));
    }
    const shoresBox = $("shores");
    if (shoresBox && setHTML(shoresBox, html)) {
      shoresBox.querySelectorAll(".shore:not(.locked)").forEach(el => el.addEventListener("click", () => E.setNextShore(el.dataset.id)));
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
    const box = $("helpers");
    if (!box) return;
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

    if (setHTML(box, html)) {
      box.querySelectorAll("[data-hire]").forEach(b => b.addEventListener("click", e => E.hireHelper(b.dataset.hire, pointFrom(e, b))));
      box.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => {
        E.toggleHelper(b.dataset.toggle);
        const nb = box.querySelector(`[data-toggle="${b.dataset.toggle}"]`);
        if (nb) nb.focus({ preventScroll: true });
      }));
      box.querySelectorAll("[data-foreman-strat]").forEach(b => b.addEventListener("click", () => {
        E.setForemanStrategy(b.dataset.foremanStrat);
        const nb = box.querySelector(`[data-foreman-strat="${b.dataset.foremanStrat}"]`);
        if (nb) nb.focus({ preventScroll: true });
      }));
      box.querySelectorAll("[data-shopkeeper-strat]").forEach(b => b.addEventListener("click", () => {
        E.setShopkeeperStrategy(b.dataset.shopkeeperStrat);
        const nb = box.querySelector(`[data-shopkeeper-strat="${b.dataset.shopkeeperStrat}"]`);
        if (nb) nb.focus({ preventScroll: true });
      }));
      box.querySelectorAll("[data-diver-strat]").forEach(b => b.addEventListener("click", () => {
        E.setDiverStrategy(b.dataset.diverStrat);
        const nb = box.querySelector(`[data-diver-strat="${b.dataset.diverStrat}"]`);
        if (nb) nb.focus({ preventScroll: true });
      }));
    }
  }

  // =====================================================================
  // Home: penguin letters and the wardrobe
  // =====================================================================
  function renderLetters() {
    const box = $("letters");
    if (!box) return;
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
    if (setHTML(box, html)) {
      box.querySelectorAll("[data-claim]").forEach(b => b.addEventListener("click", e => E.claimLetter(Number(b.dataset.claim), pointFrom(e, b))));
    }
    const today = E.todaysLetters();
    const allDone = today.length && today.every(l => l.claimed);
    const late = L.list.some(l => l.late) ? " Late letters from yesterday stay open until midnight." : "";
    const bonus = L.bonus ? '<p class="muted">📦 Today\'s care package has been opened. New letters arrive tomorrow.</p>'
      : allDone ? '<button class="btn primary" id="bonusBtn">📦 Open the care package (production ×7 for a while)</button>'
      : `<p class="muted">Answer all three letters today for a care package. New letters arrive each day, with no pressure to keep a streak.${late}</p>`;
    const bonusBox = $("letterBonus");
    if (bonusBox && setHTML(bonusBox, bonus) && $("bonusBtn")) {
      $("bonusBtn").addEventListener("click", e => E.claimLetterBonus(pointFrom(e, $("bonusBtn"))));
    }
  }

  function renderWardrobe() {
    const box = $("wardrobe");
    if (!box) return;
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
    if (setHTML(box, html)) {
      box.querySelectorAll(".ward:not(.locked)").forEach(b => b.addEventListener("click", () => {
        E.setOutfit(b.dataset.slot, b.dataset.id);
        const nb = box.querySelector(`[data-slot="${b.dataset.slot}"][data-id="${b.dataset.id}"]`);
        if (nb) nb.focus({ preventScroll: true });
      }));
    }
  }

  PI.uiCommunity = { migrateIsGood, tickMigration, migrateFlow, renderShores, renderPassport, renderHelpers, renderLetters, renderWardrobe };
})(window.PI = window.PI || {});
