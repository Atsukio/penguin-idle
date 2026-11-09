/* Penguin Idle — Community UI: Migration shores, Helpers & automation, Passport stamps, Mailbox letters, and Wardrobe. */
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
  const openModal = opts => { const d = dialogs(); if (d.openModal) return d.openModal(opts); };

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
        return p ? `${a.icon} ${a.name} (${p.current}/${p.target})` : `${a.icon} ${a.name}`;
      }).join(" · "));
    }
    const box = $("shores");
    if (!box) return;
    if (setHTML(box, html)) {
      box.querySelectorAll(".shore:not(.locked)").forEach(btn => btn.addEventListener("click", () => {
        E.setNextShore(btn.dataset.id);
        renderShores();
      }));
    }
  }

  function renderPassport() {
    const box = $("passportUI");
    if (!box) return;
    const completedStamps = S().shoreStamps || [];
    const totalShores = D.SHORES.length;
    const count = completedStamps.length;

    let totalBonusHtml = "";
    if (count > 0) {
      const globalPct = Math.round(count * 1.5);
      totalBonusHtml = `<div class="passport-summary">
        <b>🛂 Antarctic Passport:</b> ${count} / ${totalShores} expedition challenge stamps complete
        <span class="p-bonus-pill">Global Production +${globalPct}%</span>
      </div>`;
    }

    const cardsHtml = D.PASSPORT_STAMPS.map(stamp => {
      const shore = D.SHORE_BY_ID[stamp.shoreId];
      const done = completedStamps.includes(stamp.shoreId);
      const isCurrentShore = S().shore === stamp.shoreId;
      const prog = E.passportProgress ? E.passportProgress(stamp.shoreId) : null;
      const progStr = done ? "Completed!" : prog ? `${fmt(prog.current)} / ${fmt(prog.target)}` : "";
      const pct = done ? 100 : prog ? Math.min(100, Math.floor(prog.frac * 100)) : 0;
      const stampDate = (S().shoreStampDates && S().shoreStampDates[stamp.shoreId])
        ? `<div class="stamp-date">Stamped: ${new Date(S().shoreStampDates[stamp.shoreId]).toLocaleDateString()}</div>` : "";

      return `
        <div class="passport-card${done ? " stamped" : ""}${isCurrentShore ? " current" : ""}">
          <div class="p-card-head">
            <div class="p-card-icon" aria-hidden="true">${done ? stamp.icon : "🔒"}</div>
            <div class="p-card-meta">
              <div class="p-card-title">${stamp.name} <small class="muted">(${shore ? shore.name : ""})</small></div>
              <div class="p-card-desc">${stamp.desc}</div>
            </div>
            ${done ? '<div class="stamp-badge" aria-label="Stamped">COMPLETED</div>' : ""}
          </div>
          <div class="p-card-bar" aria-hidden="true"><div style="width:${pct}%"></div></div>
          <div class="p-card-foot">
            <span class="p-reward-desc"><b>Reward:</b> ${stamp.rewardDesc}</span>
            <span class="p-prog-str">${progStr}</span>
          </div>
          ${stampDate}
        </div>`;
    }).join("");

    setHTML(box, `${totalBonusHtml}<div class="passport-grid">${cardsHtml}</div>`);
  }

  function renderHelpers() {
    const list = $("helpers");
    if (!list) return;
    const spend = E.spendableFeathers();
    const curForemanStrat = E.foremanStrategy ? E.foremanStrategy() : (S().foremanStrategy || "impact");
    const curShopkeeperStrat = E.shopkeeperStrategy ? E.shopkeeperStrategy() : (S().shopkeeperStrategy || "impact");

    list.innerHTML = "";
    D.HELPERS.forEach(h => {
      const hired = h.id in S().helpers, on = E.helperOn(h.id);
      const canHire = spend >= h.cost;
      const el = document.createElement("div");
      el.className = `helper${hired ? " hired" : ""}`;

      let stratHtml = "";
      if (hired && h.id === "foreman") {
        stratHtml = `
          <div class="strat-row" role="radiogroup" aria-label="Barnaby's building target">
            <span class="strat-label">Target:</span>
            ${D.FOREMAN_STRATEGIES.map(st => `
              <button class="strat-pill${curForemanStrat === st.id ? " active" : ""}" data-foreman-strat="${st.id}" aria-pressed="${curForemanStrat === st.id}" title="${st.desc}">
                <span>${st.icon}</span> ${st.label}
              </button>
            `).join("")}
          </div>`;
      } else if (hired && h.id === "shopkeeper") {
        stratHtml = `
          <div class="strat-row" role="radiogroup" aria-label="Pip's shopping focus">
            <span class="strat-label">Focus:</span>
            ${D.SHOPKEEPER_STRATEGIES.map(st => `
              <button class="strat-pill${curShopkeeperStrat === st.id ? " active" : ""}" data-shopkeeper-strat="${st.id}" aria-pressed="${curShopkeeperStrat === st.id}" title="${st.desc}">
                <span>${st.icon}</span> ${st.label}
              </button>
            `).join("")}
          </div>`;
      }

      el.innerHTML = `
        <div class="h-main">
          <div class="icon" aria-hidden="true">${h.icon}</div>
          <div><div class="name">${h.name}</div><div class="desc">${h.desc}</div></div>
          <div>${hired ? `<button class="btn small toggle${on ? " on" : ""}" aria-pressed="${on}">${on ? "ON" : "OFF"}</button>`
            : `<button class="btn small primary hire" ${canHire ? "" : "disabled"}>Hire · 🪶 ${fmt(h.cost)}</button>`}</div>
        </div>
        ${stratHtml}`;

      if (hired) {
        el.querySelector(".toggle").addEventListener("click", () => { E.toggleHelper(h.id); renderHelpers(); });
        el.querySelectorAll("[data-foreman-strat]").forEach(btn => btn.addEventListener("click", () => { E.setForemanStrategy(btn.dataset.foremanStrat); renderHelpers(); }));
        el.querySelectorAll("[data-shopkeeper-strat]").forEach(btn => btn.addEventListener("click", () => { E.setShopkeeperStrategy(btn.dataset.shopkeeperStrat); renderHelpers(); }));
      } else {
        const hb = el.querySelector(".hire");
        hb.addEventListener("click", e => E.hireHelper(h.id, pointFrom(e, hb)));
      }
      list.appendChild(el);
    });
  }

  function renderLetters() {
    E.ensureLetters();
    const box = $("letters");
    if (!box) return;
    const L = S().letters;
    const lt = id => D.LETTER_TYPES.find(t => t.id === id);
    const html = L.list.map((l, i) => {
      const prog = E.letterProgress(l);
      const done = prog >= l.target;
      return `<div class="letter${l.claimed ? " claimed" : ""}${l.late ? " late" : ""}">
        <div class="l-head"><span class="l-from">From <b>${l.sender}</b>${l.late ? ' <span class="pill late">Yesterday</span>' : ""}</span>
          <span class="l-status">${l.claimed ? "✔ Answered" : done ? "Ready to reply" : "In progress"}</span></div>
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

  PI.community = {
    migrateIsGood,
    tickMigration,
    migrateFlow,
    renderShores,
    renderPassport,
    renderHelpers,
    renderLetters,
    renderWardrobe,
  };
})(window.PI = window.PI || {});
