/* Penguin Idle — Main Dialogs: Saves, What's New, Device Move & Welcome Home. */
(function (PI) {
  "use strict";

  const E = () => PI.engine, ui = () => PI.ui, fmt = PI.fmt;
  const S = () => PI.engine.state;
  const $ = id => document.getElementById(id);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- Save controls ----------
  function bindSaves() {
    $("saveBtn").addEventListener("click", () => {
      if (E().savingBlocked) { ui().toast("⚠️ Saving is paused because the stored save is from a newer version. Refresh the page."); return; }
      E().save(); ui().toast("💾 Saved. Your colony is tucked in.");
    });
    $("exportBtn").addEventListener("click", () => {
      const ta = $("saveText");
      ta.classList.remove("hidden");
      ta.value = E().encodeSave();
      ta.select();
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => ui().toast("📋 Save copied to clipboard."), () => {});
    });
    $("downloadBtn").addEventListener("click", () => {
      const blob = new Blob([E().encodeSave()], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `penguin-idle-${E().dayKey()}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $("importBtn").addEventListener("click", () => {
      const ta = $("saveText");
      if (ta.classList.contains("hidden") || !ta.value.trim()) {
        ta.classList.remove("hidden");
        ta.value = "";
        ta.placeholder = "Paste your save here, then press Import save again.";
        ta.focus();
        return;
      }
      try {
        E().replaceState(E().decodeSave(ta.value));
        if (PI.main && PI.main.applySettings) PI.main.applySettings();
        ta.value = "";
        ta.classList.add("hidden");
        ui().toast("✅ Save imported. Welcome back!");
      } catch (e) {
        ui().toast(`❌ ${e.message || "That save couldn't be read."}`);
      }
    });
    $("resetBtn").addEventListener("click", () => ui().openModal({
      title: "Start over completely?",
      body: "<p>This wipes <b>everything</b>, including feathers, heirlooms, helpers and memories. It can't be undone.</p>",
      danger: true,
      actions: [
        { label: "Keep my colony", cancel: true },
        { label: "Wipe everything", danger: true, onClick: () => { const keep = S().settings; const s = E().freshState(); s.settings = keep; E().replaceState(s); E().ensureLetters(); } },
      ],
    }));
  }

  // ---------- What's new ----------
  const fmtDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  function isNew(c, seen) {
    const list = PI.data.CHANGELOG, at = list.findIndex(x => x.version === seen), i = list.indexOf(c);
    return at < 0 ? i === 0 && seen !== PI.data.GAME_VERSION : i < at;
  }
  function newsNotes(notes) {
    const groups = [];
    notes.forEach(n => {
      if (n.startsWith("## ")) groups.push({ head: n.slice(3), items: [] });
      else (groups[groups.length - 1] || groups[groups.push({ head: "", items: [] }) - 1]).items.push(n);
    });
    return groups.map(g => `${g.head ? `<h4 class="news-head">${esc(g.head)}</h4>` : ""}<ul>${g.items.map(n => `<li>${esc(n)}</li>`).join("")}</ul>`).join("");
  }
  function openWhatsNew() {
    const seen = S().seenVersion;
    const entry = (c, open) => `<details class="news"${open ? " open" : ""}>
        <summary><b>${esc(c.version)}</b> · ${esc(c.title)} <small class="muted">${fmtDate(c.date)}</small>${isNew(c, seen) ? ' <span class="pill">New</span>' : ""}</summary>
        ${newsNotes(c.notes)}</details>`;
    ui().openModal({
      title: "What's new",
      body: `<div class="news-list">${PI.data.CHANGELOG.map((c, i) => entry(c, i === 0 || isNew(c, seen))).join("")}</div>`,
      actions: [{ label: "Lovely!", primary: true, cancel: true }],
    });
    S().seenVersion = PI.data.GAME_VERSION;
    ui().updateBadges();
    E().save();
  }
  function announceNews() {
    if (S().seenVersion === PI.data.GAME_VERSION) return;
    const c = PI.data.CHANGELOG[0];
    setTimeout(() => {
      ui().toast(`✨ <b>The colony has news!</b> Version ${esc(c.version)}: ${esc(c.title)}. <button class="btn small" id="newsToastBtn">See what's new</button>`);
      const b = $("newsToastBtn");
      if (b) b.addEventListener("click", openWhatsNew);
      setTimeout(() => PI.penguin.say(`Psst! ${c.title}! Have a peek at What's new in Settings.`), 2500);
    }, 1500);
  }

  // ---------- Move to another device: QR & compressed transfer link ----------
  const b64url = bytes => { let s = ""; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const fromB64url = str => Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  async function packMove(json) {
    const raw = new TextEncoder().encode(json);
    if (typeof CompressionStream === "undefined") return "j" + b64url(raw);
    return "z" + b64url(await pipe(raw, new CompressionStream("deflate-raw")));
  }
  async function unpackMove(code) {
    const bytes = fromB64url(code.slice(1));
    const raw = code[0] === "z" ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
    return new TextDecoder().decode(raw);
  }
  const pageUrl = () => location.href.split("#")[0];

  async function openMove() {
    let link;
    try { link = `${pageUrl()}#move=${await packMove(E().transferJSON())}`; }
    catch (e) { ui().toast("❌ Couldn't make a link on this browser. Try Export save instead."); return; }
    const qr = PI.qr.svg(link);
    ui().openModal({
      title: "Move to another device",
      body: `${qr ? `<div class="move-qr" role="img" aria-label="QR code for the link">${qr}</div>
             <p>Scan this with your other device's camera, or send yourself the link.</p>`
             : "<p>Send yourself this link and open it on your other device. (Your colony has grown too big for a QR code.)</p>"}
             <label class="visually-hidden" for="moveLink">Link</label>
             <input id="moveLink" class="move-link" type="text" readonly value="${esc(link)}">
             <p class="muted">The link carries a <b>copy</b> of your colony as it is right now. This browser keeps its own, and opening the link asks before replacing anything.
             Anyone with the link can load the copy, so only send it to yourself.</p>`,
      actions: [
        ...(navigator.share ? [{ label: "Share…", onClick: () => navigator.share({ title: "My Penguin Idle colony", url: link }).catch(() => {}) }] : []),
        { label: "Copy link", onClick: () => {
          if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => ui().toast("📋 Link copied."), () => ui().toast("Select the link and copy it."));
        } },
        { label: "Done", primary: true, cancel: true },
      ],
      onOpen: wrap => { const i = wrap.querySelector("#moveLink"); i.addEventListener("focus", () => i.select()); },
    });
  }

  async function checkMoveLink() {
    const m = location.hash.match(/^#move=([jz][A-Za-z0-9_-]+)$/);
    if (!m) return;
    history.replaceState(null, "", pageUrl());
    let incoming;
    try { incoming = E().fromTransferJSON(await unpackMove(m[1])); }
    catch (e) {
      ui().openModal({ title: "That link didn't work", body: `<p>${esc(e && e.kind ? e.message : "The colony in this link couldn't be read. It may have been cut short when it was copied.")}</p>`, actions: [{ label: "Okay", primary: true, cancel: true }] });
      return;
    }
    const sum = s => `🐟 ${fmt(s.fish)} fish · 🪶 ${fmt(s.feathersEarned)} feathers · ${s.achievements.length} memories · ${fmt(s.migrations)} migration${s.migrations === 1 ? "" : "s"}`;
    ui().openModal({
      title: "Bring this colony here?",
      danger: true,
      body: `<p><b>From the link:</b><br>${sum(incoming)}</p><p><b>In this browser now:</b><br>${sum(S())}</p>
             <p class="muted">Bringing it here replaces the colony in this browser.</p>`,
      actions: [
        { label: "Keep the one here", cancel: true },
        { label: "Bring it here", primary: true, onClick: () => {
          incoming.settings = S().settings;
          E().replaceState(incoming);
          if (PI.main && PI.main.applySettings) PI.main.applySettings();
          ui().toast("🐧 Your colony has arrived. Welcome back!");
        } },
      ],
    });
  }

  // ---------- Welcome home & away news ----------
  const AWAY_LINES = {
    short: ["kept the fire crackling.", "tidied the fish basket (twice).", "practised waddling in a straight line.", "made everyone a fresh mug of cocoa."],
    night: ["counted the stars until the fish started biting.", "told ghost stories by the fire.", "stayed up to watch the aurora.", "fell asleep holding a fishing rod, and still caught something."],
    long: ["built a snow penguin in your honour.", "knitted a scarf long enough for three.", "taught the chicks a new song.", "kept your favourite spot by the fire warm."],
  };
  const shuffled = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  function awayNews(offline) {
    const own = shuffled(E().playerNames());
    const friends = [...own, ...shuffled(E().residentNames().filter(n => !own.includes(n)))].slice(0, 2);
    const h = new Date().getHours();
    const kind = offline.away >= 8 * 3600 ? "long" : h >= 21 || h < 6 ? "night" : "short";
    const lines = shuffled(AWAY_LINES[kind]);
    const affordable = E().availableUpgrades().filter(u => E().upgradeCost(u) <= S().fish).length;
    return `<ul class="away-news">${friends.map((n, i) => `<li><b>${esc(n)}</b> ${lines[i]}</li>`).join("")}</ul>
      ${affordable ? `<p>That's enough for <b>${affordable} upgrade${affordable > 1 ? "s" : ""}</b> waiting in the Colony tab.</p>` : ""}`;
  }

  let welcomeModal = null;
  function welcomeHome(offline) {
    if (welcomeModal && document.contains(welcomeModal.wrap)) welcomeModal.cancel();
    welcomeModal = ui().openModal({
      title: "Welcome home!",
      body: `<p>You were away for <b>${PI.fmtTime(offline.away)}</b>. The colony kept the fire going and fished at ${Math.round(offline.eff * 100)}% pace,
             catching <b>🐟 ${fmt(offline.earned)}</b>.</p>
             ${awayNews(offline)}
             ${offline.away > offline.cap ? `<p class="muted">Time away counts for up to ${offline.cap / 3600} hours.</p>` : ""}
             <p class="muted">${offline.firstWeek
               ? "Away for under a week fishes at 50% pace before upgrades. Away a week or more drops it to 25%. Coming back resets it."
               : "Away a week or more, so the pace was 25% before upgrades. Coming back resets it to 50%."}</p>`,
      actions: [{ label: "Cozy!", primary: true, cancel: true,
        onClick: () => setTimeout(() => PI.penguin.say(["Welcome back! We missed you!", "You're home! We saved you some fish.", "There you are! The fire's still warm."][Math.floor(Math.random() * 3)], true), 300) }],
    });
  }

  PI.mainDialogs = {
    bindSaves,
    openWhatsNew,
    announceNews,
    packMove,
    unpackMove,
    openMove,
    checkMoveLink,
    welcomeHome,
  };
})(window.PI = window.PI || {});
