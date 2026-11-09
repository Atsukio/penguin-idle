/* Penguin Idle — UI Memories, Achievements, Statistics, and History Graph.
 * Renders the 101 memories with real-time progress bars, completion dates,
 * seasonal event countdown, comprehensive statistics, and the SVG performance chart.
 */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data, fmt = PI.fmt, fmtTime = PI.fmtTime;
  const S = () => (E && E.state) || {};
  const M = () => (E && E.M) || {};
  const $ = id => document.getElementById(id);
  const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
  const setHTML = (el, v) => { if (el && el.dataset.html !== v) { el.dataset.html = v; el.innerHTML = v; return true; } return false; };

  // =====================================================================
  // Seasonal event notice (cached per day)
  // =====================================================================
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

  // =====================================================================
  // Memories (Achievements) list
  // =====================================================================
  function renderAchievements() {
    const noteEl = $("seasonNote");
    if (noteEl) {
      setText(noteEl, seasonNote());
      noteEl.classList.toggle("hidden", !seasonNote());
    }
    const card = (a, extra = "") => {
      const done = S().achievements.includes(a.id);
      let prog = "", almost = "";
      const when = done && S().achDates[a.id]
        ? `<div class="a-date">Collected<b>${new Date(S().achDates[a.id]).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</b></div>`
        : "";
      const p = !done && E.memoryProgress(a);
      if (p) {
        const pct = Math.floor(p.frac * 100);
        const show = v => (p.kind === "time" ? fmtTime(v) : fmt(Math.floor(v)));
        if (pct >= 90) almost = ' <span class="a-almost">Almost!</span>';
        prog = `<div class="a-prog ${pct >= 90 ? "hot" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progress">
          <div class="a-bar"><span style="width:${pct}%"></span></div><div class="a-num">${show(p.cur)} / ${show(p.goal)}</div></div>`;
      } else if (!done && a.hint) {
        prog = `<div class="a-hint">💡 ${a.hint}</div>`;
      }
      if (done && S().achNew.includes(a.id)) almost += ' <span class="a-almost">New</span>';
      return `<div class="ach ${done ? "done" : ""} ${extra}">
        <div class="a-icon" aria-hidden="true">${a.icon}${a.badge ? `<span class="a-badge">${a.badge}</span>` : ""}</div>
        <div><div class="name">${a.name}${done ? "" : ' <span class="visually-hidden">(locked)</span>'}${almost}</div><div class="desc">${a.desc}</div>${prog}</div>${when}</div>`;
    };

    const near = E.nearestMemories(3, 0.5);
    const nearEl = $("achNear");
    if (nearEl) {
      nearEl.classList.toggle("hidden", !near.length);
      setHTML(nearEl, near.length ? `<h3>Nearly there</h3><div class="ach-grid">${near.map(m => card(m.a, "near")).join("")}</div>` : "");
    }

    const frac = a => { const p = E.memoryProgress(a); return p ? p.frac : -1; };
    const dateOf = a => S().achDates[a.id] || 0;
    const hideDone = !!S().settings.hideDone;
    const all = D.ACHIEVEMENTS.filter(a => !hideDone || !S().achievements.includes(a.id));
    const locked = all.filter(a => !S().achievements.includes(a.id)).sort((x, y) => frac(y) - frac(x));
    const collected = all.filter(a => S().achievements.includes(a.id)).sort((x, y) => dateOf(y) - dateOf(x));
    const listEl = $("achievements");
    if (listEl) setHTML(listEl, [...locked, ...collected].map(a => card(a)).join(""));
  }

  // =====================================================================
  // Statistics and SVG History Graph
  // =====================================================================
  function renderStatsGraph() {
    const h = S().history;
    const box = $("statsGraph");
    if (!box) return;
    if (h.length < 2) { setHTML(box, '<p class="muted">The graph fills in as you play (one point a minute).</p>'); return; }
    const W = 600, H = 140, pad = 6;
    const vals = h.map(p => Math.log10(Math.max(1, p[1])));
    const lo = Math.min(...vals), hi = Math.max(...vals, lo + 1);
    const pts = vals.map((v, i) => `${(pad + (i / (vals.length - 1)) * (W - 2 * pad)).toFixed(1)},${(H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad)).toFixed(1)}`).join(" ");
    const span = (h[h.length - 1][0] - h[0][0]) / 1000;
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

  // =====================================================================
  // Nap stars
  // =====================================================================
  function renderNapStars() {
    const box = $("napStars");
    if (!box) return;
    const n = Math.min(D.NAP_STARS, Math.floor(S().stats.napSeconds / 3600));
    const colony = $("colony");
    if (colony) colony.classList.toggle("moonlit", n >= D.NAP_STARS);
    if (box.childElementCount === n) return;
    box.innerHTML = Array.from({ length: n }, (_, i) => {
      const hash = k => { const v = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
      const x = 4 + ((i * 0.618034 + 0.13) % 1) * 92, y = 8 + hash(i + 1) * 34;
      return `<span data-star="${i}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;animation-delay:${(i % 7) * 0.6}s">✦</span>`;
    }).join("");
  }

  function napStarNote(i) {
    return `✦ <b>Nap star ${i + 1}</b><br>${S().napStars[i] ? `Earned ${napStarText(i)}, ${i + 1} hour${i ? "s" : ""} into your naps.` : "Earned before the stars kept dates."}`;
  }

  function renderNapStarList() {
    const box = $("napStarList");
    if (!box) return;
    const n = Math.min(D.NAP_STARS, Math.floor(S().stats.napSeconds / 3600));
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
    const box = $("napStars");
    if (!box) return;
    box.addEventListener("click", e => {
      const s = e.target.closest("[data-star]");
      if (s) {
        e.stopPropagation();
        const toast = (PI.dialogs && PI.dialogs.toast) || (PI.ui && PI.ui.toast);
        if (toast) toast(napStarNote(Number(s.dataset.star)));
      }
    });
  }

  PI.memoriesUI = {
    seasonNote,
    renderAchievements,
    renderStatsGraph,
    renderStats,
    renderNapStars,
    renderNapStarList,
    napStarText,
    napStarNote,
    bindNapStars,
  };

  // Backward-compatibility delegation on PI.ui
  PI.ui = PI.ui || {};
  PI.ui.renderAchievements = renderAchievements;
  PI.ui.renderStats = renderStats;
  PI.ui.renderStatsGraph = renderStatsGraph;
  PI.ui.renderNapStars = renderNapStars;
  PI.ui.renderNapStarList = renderNapStarList;
  PI.ui.bindNapStars = bindNapStars;
})(window.PI = window.PI || {});
