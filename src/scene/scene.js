/* Penguin Idle — colony scene landscape, shore scenery, day/night cycles, and golden fish. */
(function (PI) {
  "use strict";

  const E = PI.engine, D = PI.data;
  const S = () => E.state;
  const M = () => E.M;
  const $ = id => document.getElementById(id);
  const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };

  const W = () => PI.sceneWaddlers || {};
  const Props = () => PI.sceneProps || {};

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
    PI.fx.Music.setMood({ night, shore: shoreId, season: season && season.id });
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
    if (Props().bindProp) $("props").querySelectorAll("[data-id]").forEach(Props().bindProp);
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
      p.style.setProperty("--step", `${(0.32 + size / 80).toFixed(2)}s`);
      if (Math.random() < 0.5) p.classList.add("flip");
      if (night && i % 3 === 0) p.classList.add("huddle");
      box.appendChild(p);
      if (!S().settings.reduceMotion && !p.classList.contains("huddle") && W().wander) {
        setTimeout(() => W().wander(p), 300 + Math.random() * 4000);
      }
    }
    if (W().applyNames) W().applyNames();
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
    if (W().buildFriends) W().buildFriends();
    if (W().scheduleChat) W().scheduleChat(6000 + Math.random() * 6000);
    if (Props().scheduleWork) Props().scheduleWork(2000 + Math.random() * 2000);
    if (Props().scheduleProps) Props().scheduleProps(1500);
  }

  PI.scene = {
    init,
    rebuildScene,
    sceneShore,
    applyNames: () => W().applyNames && W().applyNames(),
    buildFriends: () => W().buildFriends && W().buildFriends(),
    fillFriends: () => W().fillFriends && W().fillFriends(),
    updateBasket: () => Props().updateBasket && Props().updateBasket(),
    arrival: (...args) => Props().arrival && Props().arrival(...args),
    spawnGolden,
    startChat: () => W().startChat && W().startChat(),
    startWork: () => Props().startWork && Props().startWork(),
    propAct: () => Props().propAct && Props().propAct(),
    propTooltip: (...args) => (Props().propTooltip ? Props().propTooltip(...args) : ""),
  };
})(window.PI = window.PI || {});
