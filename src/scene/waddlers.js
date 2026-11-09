/* Penguin Idle: resident waddlers: names, walking and chatter.
 * Moved verbatim from scene.js; helpers from other files are reached through one-line forwarders. */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data, fmt = PI.fmt;
  const S = () => E.state;
  const M = () => E.M;
  const $ = id => document.getElementById(id);
  const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };

  const sceneShore = (...args) => PI.scene.sceneShore(...args);

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

  PI.sceneWaddlers = { applyNames, buildFriends, fillFriends, walkTo, wander, startChat, scheduleChat };
})(window.PI = window.PI || {});
