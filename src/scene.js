/* Penguin Idle — colony scene and penguin actors.
 * Visual simulation: grows as you build, follows the clock and the seasons,
 * handles resident walking/chattering, fish deliveries, and golden fish.
 */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data, fmt = PI.fmt;
  const S = () => E.state;
  const M = () => E.M;
  const $ = id => document.getElementById(id);
  const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };

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
      `<label class="friend"><span aria-hidden="true">🐧</span><input type="text" maxlength="16" data-slot="${i}" aria-label="Resident ${i + 1}'s name" autocomplete="off" spellcheck="false"><button type="button" class="friend-roll" data-roll="${i}" title="Pick a cute name" aria-label="Pick a cute name for resident ${i + 1}">🎲</button></label>`).join("");
    box.querySelectorAll("input").forEach(inp => {
      const commit = () => { if (E.setName(Number(inp.dataset.slot), inp.value)) E.save(); fillFriends(); };
      inp.addEventListener("change", commit);
      inp.addEventListener("keydown", e => { if (e.key === "Enter") { commit(); inp.blur(); } });
    });
    box.querySelectorAll("[data-roll]").forEach(btn => btn.addEventListener("click", () => {
      const i = Number(btn.dataset.roll);
      if (E.setName(i, E.suggestName(i))) E.save();
      fillFriends();
      PI.fx.Sound.play("pop");
    }));
    fillFriends();
  }

  // An unnamed slot shows its cute default as the placeholder: clearing a name gives the default back
  function fillFriends() {
    $("friendNames").querySelectorAll("input").forEach(inp => {
      inp.placeholder = S().defaultNames[inp.dataset.slot] || "Name a resident";
      if (document.activeElement !== inp) inp.value = S().names[inp.dataset.slot] || "";
    });
  }

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
    if (document.hidden || PI.napping || colony.querySelector(".chat-bubble")) return false;
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

  // =====================================================================
  // Golden fish
  // =====================================================================
  function spawnGolden(force = null) {
    if (M().noGolden) return;
    const variant = force === "rush" ? "golden" : (force || E.rollGoldenVariant());
    const el = document.createElement("button");
    el.className = `golden-fish variant-${variant}`;
    const VAR_INFO = {
      golden:    { icon: "🐟", label: "Golden fish! Catch it" },
      rainbow:   { icon: "🐠", label: "Rainbow fish! Catch it for Rainbow Frenzy" },
      glacier:   { icon: "🐟", label: "Glacier fish! Catch it for Glacier Freeze" },
      feathered: { icon: "🪶", label: "Feathered fish! Catch it for Moult Bounty" },
    };
    const info = VAR_INFO[variant] || VAR_INFO.golden;
    el.textContent = info.icon;
    el.setAttribute("aria-label", info.label);
    const dur = Math.min(30, 12 * M().goldenDur);
    el.style.animationDuration = `${dur}s, .7s`;
    const left = 5 + Math.random() * 80, top = 15 + Math.random() * 65;
    el.style.left = `${left}vw`;
    el.style.top = `${top}vh`;
    let caught = false;
    const catchIt = (pos, auto) => {
      if (caught) return;
      caught = true;
      el.remove();
      E.goldenEffect(pos, auto, force, false, variant);
    };
    el.addEventListener("click", e => catchIt(PI.ui.pointFrom(e, el), false));
    $("goldenLayer").appendChild(el);
    setTimeout(() => el.remove(), dur * 1000);
    if (E.helperOn("lookout")) setTimeout(() => { if (document.contains(el)) catchIt(PI.ui.pointFrom(null, el), true); }, 3000);
    PI.bus.emit("goldenSpawn", { x: (left / 100) * innerWidth, y: (top / 100) * innerHeight, variant });
  }

  function init() {
    buildLights();
    buildFriends();
    scheduleChat(6000 + Math.random() * 6000);
    scheduleWork(2000 + Math.random() * 2000);
    scheduleProps(1500);
  }

  PI.scene = {
    init,
    rebuildScene,
    applyNames,
    buildFriends,
    fillFriends,
    updateBasket,
    arrival,
    spawnGolden,
    startChat,
    startWork,
    propAct,
  };
})(window.PI = window.PI || {});
