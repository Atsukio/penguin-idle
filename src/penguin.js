/* Penguin Idle — the big penguin: drawing, outfits and personality.
 * Behaviours: blinks, eyes follow the pointer, happy squint and springy pom-pom/scarf on pats,
 * hearts when patted quickly, idle sips/waves/looks, dozes off when left alone, notices golden fish.
 */
(function (PI) {
  "use strict";

  const E = PI.engine;
  const S = () => E.state;
  const BODY = "#2b2a3d";
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------- Drawing ----------
  function hatMarkup() {
    const hat = E.cosmeticItem("hat", S().cosmetics.hat);
    if (hat.emoji) return `<text class="p-hat-emoji" x="100" y="40" text-anchor="middle" font-size="62">${hat.emoji}</text>`;
    const [main, band, rib] = hat.beanie;
    const flakes = hat.snow ? `<text x="80" y="44" font-size="11" fill="#fff">❄</text><text x="110" y="34" font-size="9" fill="#fff">❄</text>` : "";
    return `
      <path d="M52 58 Q100 -6 148 58 Z" fill="${main}"/>
      <path d="M70 40 L76 58 M88 30 L90 58 M112 30 L110 58 M130 40 L124 58" stroke="${rib}" stroke-width="3" stroke-linecap="round"/>
      ${flakes}
      <rect x="46" y="52" width="108" height="15" rx="7.5" fill="${band}"/>
      <g class="p-pom"><circle cx="100" cy="20" r="12" fill="${hat.id === "golden" ? "#fff2c6" : "#fdf6ec"}"/></g>`;
  }

  function scarfMarkup() {
    const [main, stripe] = E.cosmeticItem("scarf", S().cosmetics.scarf).colors;
    return `
      <rect x="42" y="116" width="116" height="18" rx="9" fill="${main}"/>
      <rect x="42" y="122" width="116" height="4" fill="${stripe}" opacity=".85"/>
      <g class="p-tail">
        <rect x="116" y="126" width="20" height="46" rx="6" fill="${main}" transform="rotate(-8 126 126)"/>
        <rect x="117" y="146" width="20" height="4" fill="${stripe}" opacity=".85" transform="rotate(-8 126 126)"/>
        <path d="M120 172 l0 7 M125 172 l0 7 M130 171 l0 7 M135 170 l0 7" stroke="${main === "url(#rainbowGrad)" ? "#a58bd6" : main}" stroke-width="2.5" stroke-linecap="round" transform="rotate(-8 126 126)"/>
      </g>`;
  }

  function itemMarkup() {
    const item = E.cosmeticItem("item", S().cosmetics.item);
    if (!item.emoji) return "";
    const steam = item.id === "mug" ? `<g class="p-steam"><path d="M160 128 q-4 -6 0 -12 q4 -6 0 -12" /><path d="M168 130 q-4 -6 0 -12 q4 -6 0 -12" /></g>` : "";
    return `${steam}<text class="p-item-emoji" x="164" y="160" text-anchor="middle" font-size="30">${item.emoji}</text>`;
  }

  function render() {
    const svg = document.getElementById("penguinSvg");
    svg.innerHTML = `
      <defs>
        <linearGradient id="rainbowGrad" x1="0" x2="1">
          <stop offset="0" stop-color="#ff9a8b"/><stop offset=".25" stop-color="#ffd27a"/><stop offset=".5" stop-color="#a6e3bd"/>
          <stop offset=".75" stop-color="#a9c8ff"/><stop offset="1" stop-color="#d9b3ff"/>
        </linearGradient>
      </defs>
      <ellipse class="p-shadow" cx="100" cy="212" rx="60" ry="8" fill="rgba(0,0,0,.2)"/>
      <g class="p-all">
        <g class="p-wing p-wing-l"><ellipse cx="38" cy="128" rx="14" ry="44" fill="${BODY}" transform="rotate(18 38 128)"/></g>
        <g class="p-wing p-wing-r"><ellipse cx="162" cy="128" rx="14" ry="44" fill="${BODY}" transform="rotate(-18 162 128)"/></g>
        <ellipse cx="100" cy="120" rx="70" ry="88" fill="${BODY}"/>
        <ellipse cx="100" cy="135" rx="50" ry="70" fill="#fdf6ec"/>
        <g class="p-eyes">
          <circle class="p-white" cx="78" cy="84" r="11" fill="#fff"/><circle class="p-white" cx="122" cy="84" r="11" fill="#fff"/>
          <g class="p-pupils">
            <g class="p-pupil"><circle cx="80" cy="86" r="6" fill="#1a1a24"/><circle cx="82" cy="83" r="2" fill="#fff"/></g>
            <g class="p-pupil"><circle cx="120" cy="86" r="6" fill="#1a1a24"/><circle cx="122" cy="83" r="2" fill="#fff"/></g>
          </g>
          <ellipse class="p-lid p-lid-l" cx="78" cy="84" rx="12.5" ry="12.5" fill="${BODY}"/>
          <ellipse class="p-lid p-lid-r" cx="122" cy="84" rx="12.5" ry="12.5" fill="${BODY}"/>
          <path class="p-happy" d="M69 88 Q78 76 87 88 M113 88 Q122 76 131 88" fill="none" stroke="#1a1a24" stroke-width="3.5" stroke-linecap="round"/>
        </g>
        <path d="M89 99 L111 99 L100 113 Z" fill="#f4a62a"/>
        <ellipse class="p-cheek" cx="64" cy="104" rx="9" ry="5" fill="#ff9fb1"/>
        <ellipse class="p-cheek" cx="136" cy="104" rx="9" ry="5" fill="#ff9fb1"/>
        <g class="p-scarf">${scarfMarkup()}</g>
        <g class="p-hat">${hatMarkup()}</g>
        <g class="p-item">${itemMarkup()}</g>
        <ellipse cx="78" cy="205" rx="18" ry="7" fill="#f4a62a"/>
        <ellipse cx="122" cy="205" rx="18" ry="7" fill="#f4a62a"/>
        <g class="p-zzz" aria-hidden="true"><text x="150" y="44">z</text><text x="162" y="30">z</text><text x="174" y="16">Z</text></g>
        <text class="p-startle" x="160" y="36" text-anchor="middle">!</text>
      </g>`;
    lookAt(null);
  }

  // ---------- Personality ----------
  const P = {
    lastPat: Date.now(), patTimes: [], sleeping: false, busyUntil: 0,
    nextBlink: Date.now() + 2500, nextIdle: Date.now() + 9000, lookUntil: 0,
  };
  const btn = () => document.getElementById("bigPenguin");
  const flash = (cls, ms) => {
    const el = btn();
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    clearTimeout(flash[cls]);
    flash[cls] = setTimeout(() => el.classList.remove(cls), ms);
  };

  function lookAt(point) {
    const pupils = document.querySelectorAll("#penguinSvg .p-pupil");
    if (!pupils.length) return;
    let dx = 0, dy = 0;
    if (point && !P.sleeping) {
      const r = document.getElementById("penguinSvg").getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.38;
      const vx = point.x - cx, vy = point.y - cy, len = Math.hypot(vx, vy) || 1;
      const k = Math.min(1, len / 200);
      dx = (vx / len) * 3.2 * k;
      dy = (vy / len) * 2.6 * k;
    }
    pupils.forEach(p => { p.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`; });
  }

  function headPoint() {
    const r = document.getElementById("penguinSvg").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.15 };
  }

  function wake() {
    P.sleeping = false;
    btn().classList.remove("sleeping");
    flash("startle", 700);
    P.nextIdle = Date.now() + 8000;
  }

  function onPat() {
    const now = Date.now();
    P.lastPat = now;
    if (P.sleeping) { wake(); return; }
    flash("happy", 380);
    flash("spring", 900);
    P.patTimes.push(now);
    while (P.patTimes.length && now - P.patTimes[0] > 2000) P.patTimes.shift();
    if (P.patTimes.length >= 8) {   // patted quickly: excited, with the odd heart
      flash("excited", 1600);
      if (Math.random() < 0.25) { const h = headPoint(); PI.fx.burst(h.x, h.y, 2, ["💕", "💗"]); }
    }
  }

  const IDLE_ACTIONS = [
    { cls: "act-look", ms: 1800 },
    { cls: "act-wave", ms: 1400 },
    { cls: "act-wiggle", ms: 1200 },
    { cls: "act-sip", ms: 2200, needs: () => S().cosmetics.item === "mug" },
  ];

  function tick() {
    const now = Date.now();
    if (document.hidden) return;
    if (!P.sleeping && now >= P.nextBlink) {
      flash("blink", 170);
      P.nextBlink = now + (Math.random() < 0.2 ? 260 : rand(2200, 6000));   // sometimes a double blink
    }
    if (!P.sleeping && now - P.lastPat > 60000) {   // left alone for a minute: doze off
      P.sleeping = true;
      btn().classList.add("sleeping");
      lookAt(null);
      PI.fx.Sound.play("yawn");
    }
    if (!P.sleeping && now - P.lastPat > 4000 && now >= P.nextIdle && now >= P.busyUntil) {
      const options = IDLE_ACTIONS.filter(a => !a.needs || a.needs());
      const a = options[Math.floor(Math.random() * options.length)];
      flash(a.cls, a.ms);
      P.busyUntil = now + a.ms;
      P.nextIdle = now + rand(8000, 16000);
    }
  }

  function init() {
    render();
    let pending = null;
    document.addEventListener("pointermove", e => {
      if (pending || Date.now() < P.lookUntil) return;
      pending = requestAnimationFrame(() => { pending = null; lookAt({ x: e.clientX, y: e.clientY }); });
    }, { passive: true });
    PI.bus.on("click", onPat);
    PI.bus.on("outfit", render);
    PI.bus.on("stateReplaced", render);
    PI.bus.on("goldenSpawn", d => {   // look at the golden fish, a little surprised
      if (P.sleeping || !d) return;
      P.lookUntil = Date.now() + 2500;
      lookAt(d);
      flash("surprised", 1200);
    });
    setInterval(tick, 250);
  }

  PI.penguin = { init, render, onPat, get sleeping() { return P.sleeping; } };
})(window.PI = window.PI || {});
