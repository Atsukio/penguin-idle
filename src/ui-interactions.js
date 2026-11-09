/* Penguin Idle — User Interface event bus wiring and patting interactions. */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data, fmt = PI.fmt;
  const S = () => (E && E.state) || {};
  const $ = id => document.getElementById(id);

  const pointFrom = (e, el) => {
    if (e && e.clientX) return { x: e.clientX, y: e.clientY };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const dialogs = () => PI.dialogs || {};
  const panels = () => PI.panels || {};
  const community = () => PI.community || {};
  const activities = () => PI.activities || {};
  const scene = () => PI.scene || {};
  const ui = () => PI.ui || {};

  const toast = (...args) => dialogs().toast && dialogs().toast(...args);
  const queueMemories = (...args) => dialogs().queueMemories && dialogs().queueMemories(...args);

  function wire() {
    const bus = PI.bus, P = panels(), Comm = community(), A = activities(), S_SC = scene();
    bus.on("structure", () => ui().refreshStructure && ui().refreshStructure());
    bus.on("buffs", () => P.refreshBuildings && P.refreshBuildings());
    bus.on("stateReplaced", () => {
      if (ui().setShownFish) ui().setShownFish(S().fish);
      if (S_SC.rebuildScene) S_SC.rebuildScene(true);
      if (ui().renderTab) ui().renderTab(true);
      if (S_SC.fillFriends) S_SC.fillFriends();
    });
    bus.on("names", () => {
      if (S_SC.applyNames) S_SC.applyNames();
      if (S_SC.fillFriends) S_SC.fillFriends();
    });
    bus.on("letters", () => { if (ui().currentTab === "home" && Comm.renderLetters) Comm.renderLetters(); if (ui().updateBadges) ui().updateBadges(); });
    bus.on("outfit", () => { if (ui().currentTab === "home" && Comm.renderWardrobe) Comm.renderWardrobe(); });
    bus.on("buyBuilding", d => S_SC.arrival && S_SC.arrival(d.id));
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
      ? "😴 <b>7 nap days in a row!</b> The Sleep Mask is in your wardrobe."
      : `😴 <b>Nap streak: ${ns.count} day${ns.count === 1 ? "" : "s"}</b>${ns.best < 7 ? ` · ${7 - ns.count} more for the Sleep Mask` : ""}`));
    bus.on("respec", () => toast("🪶 <b>Feathers refunded.</b> Plant your tree however you like."));
    bus.on("hireHelper", d => toast(`${d.h.icon} <b>${d.h.name}</b> has joined the colony!`));
    bus.on("passportStamp", d => {
      const shName = (d.shore && d.shore.name) || (D.SHORE_BY_ID[d.stamp.shoreId] && D.SHORE_BY_ID[d.stamp.shoreId].name) || "";
      toast(`🛂 <b>Passport Stamped!</b> ${d.stamp.icon} <b>${d.stamp.name}</b> (${shName}): ${d.stamp.rewardDesc}`);
      if (ui().currentTab === "heritage" && Comm.renderPassport) Comm.renderPassport();
    });
    bus.on("dishCooked", d => {
      toast(`${d.recipe.icon} <b>${d.recipe.name}</b> is simmering over the campfire! ${d.recipe.effectDesc}`);
      if (ui().currentTab === "home" && A.renderKettle) A.renderKettle();
      const sceneKettle = $("sceneKettle");
      if (sceneKettle) sceneKettle.classList.add("simmering");
    });
    bus.on("dishFinished", d => {
      if (d.recipe) toast(`🥣 The pot of <b>${d.recipe.name}</b> has been enjoyed by the colony.`);
      if (ui().currentTab === "home" && A.renderKettle) A.renderKettle();
      const sceneKettle = $("sceneKettle");
      if (sceneKettle) sceneKettle.classList.remove("simmering");
    });
    bus.on("diveStarted", d => {
      toast(`🤿 Diver plunged into the <b>${d.spot.name}</b>!`, 3500);
      if (ui().currentTab === "home" && A.renderDiving) A.renderDiving();
      if (A.updateSceneIceHole) A.updateSceneIceHole();
    });
    bus.on("diveReady", d => {
      toast(`🤿 <b>Diver Returned!</b> Resurfaced from the ${d.spot.name}. Tap the Ice Hole or visit Home to collect!`);
      if (ui().currentTab === "home" && A.renderDiving) A.renderDiving();
      if (A.updateSceneIceHole) A.updateSceneIceHole();
    });
    bus.on("relicFound", d => {
      if (ui().currentTab === "home") {
        if (A.renderDiving) A.renderDiving();
        if (A.renderRelicShelf) A.renderRelicShelf();
      }
      if (A.updateSceneIceHole) A.updateSceneIceHole();
    });
    bus.on("letterClaimed", d => toast(`💌 You wrote back to <b>${d.l.sender}</b>. +${fmt(d.reward)} fish`));
    bus.on("letterBonus", d => toast(`📦 <b>Care package!</b> Production ×7 for ${d.secs}s.`));
    bus.on("seasonUnlock", d => toast(`${d.season.icon} <b>${d.season.name} gift!</b> New in your wardrobe: ${d.item.name}.`));
    bus.on("migrate", d => toast(d.auto
      ? `🗓️ <b>Planner Pem</b> led the colony to ${d.shore.icon} ${d.shore.name}. +🪶 ${fmt(d.gained)}`
      : `<b>Welcome to ${d.shore.icon} ${d.shore.name}!</b> The colony settles in with 🪶 ${fmt(d.feathers)} feathers.`));
  }

  // Patting interaction wiring
  const STROKE_PX = 40;
  const STROKE_GAP = 70;
  const HOLD_DELAY = 450;
  const HOLD_EVERY = 200;
  function wirePatting(peng) {
    if (!peng) return;
    let active = null;
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
      if (Math.abs(dx) > 2) {
        peng.classList.toggle("rub-r", dx > 0);
        peng.classList.toggle("rub-l", dx < 0);
      }
      if (active.travel < STROKE_PX) return;
      startHold();
      const t = performance.now();
      if (t - active.lastPat < STROKE_GAP) return;
      active.travel = 0;
      active.lastPat = t;
      if (!peng.classList.contains("rub-l") && !peng.classList.contains("rub-r")) peng.classList.add("rub-r");
      pat({ x: e.clientX, y: e.clientY }, "rub");
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => peng.addEventListener(ev, end));
    peng.addEventListener("click", e => { if (e.detail === 0) pat(pointFrom(e, peng), "tap"); });
  }

  PI.uiInteractions = { wire, wirePatting };
})(window.PI = window.PI || {});
