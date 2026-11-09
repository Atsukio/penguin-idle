/* Penguin Idle: colony props: hover details, fish deliveries to the basket and props at work.
 * Moved verbatim from scene.js; helpers from other files are reached through one-line forwarders. */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data, fmt = PI.fmt;
  const S = () => E.state;
  const M = () => E.M;
  const $ = id => document.getElementById(id);
  const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };

  const walkTo = (...args) => PI.sceneWaddlers.walkTo(...args);

  // ---------- Props: hover (or tap, on phones) a colony member's prop to see what it earns ----------
  function propShare(id) {
    const all = D.BUILDINGS.reduce((t, b) => t + fpsOf(b.id), 0);
    const pct = (fpsOf(id) / (all || 1)) * 100;
    return pct > 0 && pct < 1 ? "under 1%" : `${Math.round(pct)}%`;
  }
  const propTooltip = id => `${PI.ui.buildingTooltip(D.B_BY_ID[id])}<div class="t-sub">That's <b>${propShare(id)}</b> of the colony's catch.</div>`;
  function bindProp(el) {
    const id = el.dataset.id;
    PI.ui.attachTooltip(el, () => propTooltip(id));
    el.addEventListener("mouseenter", () => { if (!PI.ui.isTouch()) lookedAtProp(); });
    el.addEventListener("click", () => { if (PI.ui.isTouch()) { lookedAtProp(); PI.ui.selectForSheet("prop", id); } });
  }
  function lookedAtProp() { S().stats.propLooks++; }

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
    if (document.hidden || PI.napping || S().settings.reduceMotion) return false;
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
    if (PI.ui && PI.ui.updateSceneIceHole) PI.ui.updateSceneIceHole();
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
    if (document.hidden || PI.napping || S().settings.reduceMotion) return;
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

  PI.sceneProps = { propTooltip, bindProp, startWork, scheduleWork, updateBasket, propAct, scheduleProps, arrival };
})(window.PI = window.PI || {});
