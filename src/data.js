/* Penguin Idle — data tables and number formatting.
 * Pure data: no DOM, so this file loads in the browser and in Node (tools/simulate.js, tools/check-data.js).
 * IDs are save-file keys: rename display names freely, but never change an id.
 */
(function (PI) {
  "use strict";

  const fmtOptions = { scientific: false };

  function fmt(n) {
    if (typeof n !== "number" || Number.isNaN(n)) return "0";
    if (!isFinite(n)) return "∞";
    if (n < 0) return "-" + fmt(-n);
    if (n < 1000) {
      if (n === Math.floor(n)) return String(n);
      return n < 10 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.floor(n));
    }
    const exp = Math.floor(Math.log10(n));
    if (fmtOptions.scientific || exp >= SUFFIXES.length * 3) return `${(n / Math.pow(10, exp)).toFixed(2)}e${exp}`;
    const tier = Math.floor(exp / 3);
    const scaled = n / Math.pow(1000, tier);
    return `${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60, s = sec % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const SAVE_KEY = "penguinIdleSave_v1";   // storage key never changes; the schema version lives inside the save

  // ---------- What's new: shown in the game (Settings → What's new), newest first ----------
  // Written for players, not developers. Every release adds an entry at the top, and the service
  // worker's CACHE must be "penguin-idle-v<version>" (tools/check-data.js fails CI otherwise), so
  // installed copies always pick up the update.
  const BEDTIMES = ["off", "21-7", "22-7", "23-7", "0-8"];   // bedtime nap windows, local hours
  const NAP_STARS = 24;   // one sky star per napped hour, up to this many
  const NAP_BONUS = 0.05;   // napping fishes this much faster before Lullabies
  const CHANGELOG = [
    { version: "4.3", date: "2026-11-06", title: "Sweet dreams", notes: [
      "## Napping",
      "Napping fishes 5% faster, and the new Lullabies project in the Workshop makes it faster still.",
      "The nap screen shows your nap bonus, your nap streak and any boosts still running.",
      "Only the Wake up button wakes the colony, so a stray tap or key won't.",
      "Waking up shows a little summary of the nap, and notes that arrived while you slept follow just after it.",
      "Stats shows the extra fish your naps have earned, and the graph shades the minutes you napped.",
      "## Bedtime",
      "Pick a bedtime in Settings and the colony naps by itself overnight once you've left it for a minute.",
      "Fifteen minutes before bedtime the colony dims and the big penguin yawns.",
      "The Auto battery saver also rests the scenery at bedtime.",
      "## Rewards",
      "Golden fish wait while you nap: after a few minutes one is there to greet you, and after an hour it brings a Cocoa Rush.",
      "If you have hired Lookout Lumi, they keep watch while you nap and save up to 3 golden fish for when you wake.",
      "Every napped hour puts a lavender star in the sky. Tap one, or see the list in Stats. Fill the sky with 24 and it turns moonlit.",
      "Nap for 5 minutes a day, 7 days in a row, to win the Sleep Mask. Missing one day a week won't break your streak.",
      "New memories for learning every Lullaby and for a moonlit sky.",
    ] },
    { version: "4.2", date: "2026-11-06", title: "Nap time", notes: [
      "Tap 💤 (or press Z) to let the colony nap: a dark, nearly still screen that goes easy on your battery while the fishing carries on at full pace.",
      "The game can nap by itself when you leave it alone for a while (Settings → Nap by itself).",
      "A battery saver calms the weather and scenery. It switches on by itself when your battery runs low, or you can keep it on.",
      "Two new memories for napping, and a Nightcap for the big penguin.",
      "Residents come with cute names. Tap 🎲 by a name for another.",
      "All notifications now sit in the bottom-left corner, and a click puts them away.",
    ] },
    { version: "4.1", date: "2026-11-05", title: "News from the colony", notes: [
      "There's a What's new page in Settings, and a little note when the game updates.",
      "Rubbing the penguin makes a soft stroking sound, and the mitten tilts as you rub. There are two new memories for it.",
      "Don't want hold-to-pat? Switch it off in Settings.",
      "A hint under the penguin shows what you're saving up for next and roughly how long it'll take.",
      "Coming back after a while? Your colony friends tell you what they got up to.",
      "Move your colony to another device with a link or a QR code (Settings → Save).",
      "The weather eases off on its own if your device is struggling to keep up.",
    ] },
    { version: "4.0", date: "2026-11-05", title: "Belly rubs", notes: [
      "Rub the penguin side to side or up and down to pat it, or press and hold.",
      "Colony prices sit next to the big count on the right, and Workshop prices sit next to their level.",
    ] },
    { version: "3.4", date: "2026-11-05", title: "Friends by name", notes: [
      "Name up to six residents in the Home tab. They wear name tags and get cheered on by name.",
      "A 🎵 button in the top bar (or Shift+M) mutes or unmutes the music.",
      "The music follows the scene: each shore has its own flavour, nights are slower, and Midwinter brings sleigh bells.",
      "Hover a prop in the scene (or tap it on a phone) to see what it earns.",
      "Six new memories.",
    ] },
    { version: "3.3", date: "2026-11-05", title: "Lofi by the fire", notes: [
      "Calm lofi music, made live in your browser, with its own volume slider.",
      "Cozy cursors (a knitted glove and a red mitten for patting) and warm, rounded scrollbars.",
    ] },
    { version: "3.2", date: "2026-11-05", title: "A living colony", notes: [
      "Every shore has its own scenery and weather.",
      "Residents fish, visit the huts and carry the catch to the basket by the fire.",
      "Residents stop for little chats, and the big penguin has plenty to say.",
    ] },
    { version: "3.1", date: "2026-11-05", title: "Nothing missed", notes: [
      "Time with your computer asleep now earns offline rewards, and background tabs earn at full rate.",
      "With x10, x100 or Max selected, hovering a colony row shows what you'd have after buying.",
    ] },
    { version: "3.0", date: "2026-11-05", title: "Helpers and new shores", notes: [
      "Hire helpers with feathers to buy, research and catch golden fish for you.",
      "Each migration lands on a shore with its own twist.",
      "Daily penguin letters, a wardrobe for the big penguin and real-date seasonal events.",
      "Install the game as an app and play offline.",
    ] },
    { version: "2.0", date: "2026-11-04", title: "Heirlooms and the Workshop", notes: [
      "The Heirloom Tree: three branches of permanent upgrades, with free refunds.",
      "The Workshop: research projects bought with fish.",
      "Big Catches, synergy upgrades and new memories.",
    ] },
    { version: "1.0", date: "2026-11-04", title: "Hello, colony", notes: [
      "Pat the penguin, grow a fishing colony, catch golden fish and set off on the Great Migration.",
    ] },
  ];
  const GAME_VERSION = CHANGELOG[0].version;

  const COST_GROWTH = 1.15;
  const MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000];
  const FEATHER_BONUS = 0.02;      // per feather ever earned
  const ACH_BONUS = 0.01;          // per achievement
  const FEATHER_SCALE = 1e12;       // lifetime fish needed for the first feather
  const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc", "Vg"];
  const TEXT_SIZES = [1, 1.15, 1.3, 1.5];

  const BUILDINGS = [
    { id: "chick",   name: "Sleepy Chick",         plural: "Sleepy Chicks",         icon: "🐣", baseCost: 15,     baseFps: 0.1,    desc: "Naps a lot. Sometimes wakes up holding a fish." },
    { id: "fisher",  name: "Scarf-Wrapped Fisher", plural: "Scarf-Wrapped Fishers", icon: "🎣", baseCost: 100,    baseFps: 1,      desc: "Bundled up with a rod in one flipper and a thermos in the other." },
    { id: "drill",   name: "Ice Fishing Hut",      plural: "Ice Fishing Huts",      icon: "🛖", baseCost: 1100,   baseFps: 8,      desc: "A little hut over a hole in the ice, with a tiny wood stove." },
    { id: "igloo",   name: "Cocoa Igloo",          plural: "Cocoa Igloos",          icon: "☕", baseCost: 12000,  baseFps: 47,     desc: "Whole families fishing together between mugs of cocoa." },
    { id: "krill",   name: "Krill Garden",         plural: "Krill Gardens",         icon: "🦐", baseCost: 130000, baseFps: 260,    desc: "Lovingly tended rows of krill. The fish come for dinner." },
    { id: "trawler", name: "Lantern Boat",         plural: "Lantern Boats",         icon: "⛵", baseCost: 1.4e6,  baseFps: 1400,   desc: "Glowing paper lanterns draw the fish in on long winter nights." },
    { id: "orca",    name: "Friendly Orca Ferry",  plural: "Friendly Orca Ferries", icon: "🐋", baseCost: 2e7,    baseFps: 7800,   desc: "The orcas herd fish over in exchange for belly rubs." },
    { id: "aurora",  name: "Aurora Observatory",   plural: "Aurora Observatories",  icon: "🌌", baseCost: 3.3e8,  baseFps: 44000,  desc: "Fish drift up toward the pretty lights. Penguins drift off to sleep." },
    { id: "factory", name: "Net-Knitting Circle",  plural: "Net-Knitting Circles",  icon: "🧶", baseCost: 5.1e9,  baseFps: 260000, desc: "Grandmas knitting fishing nets by the fire. Very fast grandmas." },
    { id: "rocket",  name: "Hot-Air Balloon",      plural: "Hot-Air Balloons",      icon: "🎈", baseCost: 7.5e10, baseFps: 1.6e6,  desc: "Penguins can't fly, but balloons can, and they make excellent fishing perches." },
    { id: "portal",  name: "Snow Globe Sea",       plural: "Snow Globe Seas",       icon: "🔮", baseCost: 1e12,   baseFps: 1e7,    desc: "Shake it gently and fish tumble out." },
    { id: "time",    name: "Hibernation Clock",    plural: "Hibernation Clocks",    icon: "🕰️", baseCost: 1.4e13, baseFps: 6.5e7,  desc: "Catches fish from tomorrow's dreams." },
  ];
  const B_BY_ID = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));

  // Building upgrades: each doubles that building's output
  const TIER_REQS  = [1, 5, 25, 50, 100, 150, 200];
  const TIER_COSTS = [10, 50, 500, 5e4, 5e6, 5e8, 5e10];
  const TIER_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];

  // Seven themed upgrades per colony member: [name, icon, flavour]. Index = tier; the save ID stays `${building}_${tier}`.
  const BUILDING_UPGRADES = {
    chick: [
      ["Tiny Beds", "🛏️", "Every chick deserves a proper bed."],
      ["Lullabies", "🎵", "Well-rested chicks fish twice as well."],
      ["Night Lights", "🕯️", "No more being scared of the dark ice."],
      ["Bedtime Stories", "📖", "Tales of the Great Fish of the South."],
      ["Warm Milk", "🥛", "A nightcap before a nap."],
      ["Power Naps", "💤", "Sleep faster, fish harder."],
      ["Star Blankets", "🌠", "Woven from the night sky itself."],
    ],
    fisher: [
      ["Double Scarves", "🧣", "Two scarves are better than one."],
      ["Sharper Hooks", "🪝", "Fewer fish wriggle free."],
      ["Folding Stools", "🪑", "Fishing is better sitting down."],
      ["Fishing Almanac", "📘", "Knows where the fish are biting."],
      ["Fluffy Earmuffs", "🎧", "Blocks out the wind, and the orcas' gossip."],
      ["Patience Tea", "🍵", "Steady flippers, steady catch."],
      ["Moonlit Casting", "🌙", "The fish come up to look at the moon."],
    ],
    drill: [
      ["Wood Stoves", "🪵", "Toasty huts keep the holes from freezing."],
      ["Spiral Augers", "🪛", "Drills holes in half the time."],
      ["Patchwork Curtains", "🧵", "Keeps the draught out and the warmth in."],
      ["Ice Picks", "⛏️", "For the really stubborn ice."],
      ["Fondue Nights", "🫕", "Melted cheese draws a crowd."],
      ["Lantern Hooks", "🏮", "A warm glow through the ice below."],
      ["Cozy Chimneys", "💨", "Smoke signals that say 'fish here'."],
    ],
    igloo: [
      ["Marshmallows", "🍡", "Floating on top, as is tradition."],
      ["Whipped Cream", "🍦", "A cloud of happiness on every mug."],
      ["Peppermint Sticks", "🍬", "Stir, sip, smile."],
      ["Fish-Cake Swirls", "🍥", "An acquired taste. Penguins acquired it."],
      ["Chocolate Shavings", "🍫", "Extra chocolate for extra effort."],
      ["Snow Cookies", "🍪", "Baked fresh every morning."],
      ["Golden Mugs", "🏆", "For the colony's most dedicated sippers."],
    ],
    krill: [
      ["Fresh Seawater", "💧", "Only the finest brine."],
      ["Seedlings", "🌱", "Tiny krill, big futures."],
      ["Kelp Trellises", "🌿", "Gives the krill something to climb."],
      ["Plankton Compost", "🪱", "Rich soil makes happy krill."],
      ["Seashell Planters", "🐚", "Pretty and practical."],
      ["Prize Ribbons", "🎀", "Best in show at the krill fair."],
      ["Bioluminescence", "💡", "The garden glows all night long."],
    ],
    trawler: [
      ["Wind Chimes", "🎐", "A soothing tinkle that fish find irresistible."],
      ["Brass Bells", "🔔", "Ring once for fish, twice for cocoa."],
      ["Sturdy Oars", "🛶", "For when the wind is sleeping."],
      ["Sea Charts", "🗺️", "X marks the fish."],
      ["Ship's Cat", "🐈", "Nobody knows how it got here."],
      ["Brass Compasses", "🧭", "Always points toward dinner."],
      ["Lighthouse Pals", "🗼", "Lighthouses wave the boats home."],
    ],
    orca: [
      ["Belly Rubs", "🤲", "The orcas insist on these."],
      ["Shrimp Treats", "🍤", "A little snack for the ride."],
      ["Friendship Beads", "📿", "Matching bracelets for every orca."],
      ["Whale Songs", "🎶", "They sing the fish over."],
      ["Pod Picnics", "🧺", "Lunch together builds trust."],
      ["Splash Parties", "💦", "Fun for everyone except the fish."],
      ["Ocean Wisdom", "🔱", "The elders know every current."],
    ],
    aurora: [
      ["Telescopes", "🔭", "Spot fish schools from far away."],
      ["Star Charts", "🌟", "The constellations look a lot like fish."],
      ["Comet Spotting", "☄️", "Make a wish: more fish."],
      ["Planetarium Dome", "🪐", "Rainy-day stargazing."],
      ["Night Owl Shifts", "🦉", "Someone's always watching the sky."],
      ["Northern Choir", "🎼", "Singing along with the lights."],
      ["Solar Wind", "🌬️", "Brighter lights, bigger catches."],
    ],
    factory: [
      ["Knitting Needles", "🪡", "Clickety-clack goes the colony."],
      ["Squishy Sofas", "🛋️", "Comfy grandmas knit faster."],
      ["Pattern Books", "📚", "New net designs every week."],
      ["Sheep Pen-Pals", "🐑", "They send wool in the post."],
      ["Spinning Wheels", "🎡", "Yarn on demand."],
      ["Tea & Gossip", "🫖", "The best nets are knitted while chatting."],
      ["Silver Thimbles", "🥈", "Heirlooms passed down for generations."],
    ],
    rocket: [
      ["Sandbags", "🎒", "Ballast, and a place to keep snacks."],
      ["Kite Tethers", "🪁", "Keeps the balloons from wandering off."],
      ["Bunting Flags", "🎏", "Festive and aerodynamic."],
      ["Weather Vanes", "🌤️", "Always know which way the fish are."],
      ["Cloud Maps", "☁️", "Navigate by the shape of clouds."],
      ["Paper Planes", "✈️", "For sending fish orders downstairs."],
      ["Rainbow Balloons", "🌈", "The prettiest fleet in the sky."],
    ],
    portal: [
      ["Glitter Snow", "🌨️", "Prettier swirls, more fish."],
      ["Music Box Bases", "🎹", "Plays a tune while you shake."],
      ["Tiny Villages", "🏘️", "Little penguins in little igloos."],
      ["Crystal Glass", "💎", "Crystal-clear views into the sea."],
      ["Snowmen", "⛄", "Every globe needs one."],
      ["Wishing Wands", "🪄", "One wish each. They all wish for fish."],
      ["Whole Winters", "🏔️", "An entire season, inside a globe."],
    ],
    time: [
      ["Snooze Buttons", "⏰", "Five more minutes, five more fish."],
      ["Pocket Watches", "⌚", "Time management for dreamers."],
      ["Hourglasses", "⌛", "Sand that runs backwards on weekends."],
      ["Calendar Pages", "📅", "Skip straight to fishing season."],
      ["Dream Journals", "📓", "Write down tomorrow's catches."],
      ["Wheel of Seasons", "🍂", "Turn it to autumn for the best fishing."],
      ["Forever Naps", "🛌", "The longest, most productive sleep."],
    ],
  };

  const UPGRADES = [];
  BUILDINGS.forEach(b => {
    TIER_REQS.forEach((req, i) => {
      const [name, icon, flavour] = BUILDING_UPGRADES[b.id][i];
      UPGRADES.push({
        id: `${b.id}_${i}`, icon, name, tier: i, kind: "building", building: b.id,
        desc: `${flavour} ${b.plural} are twice as efficient.`,
        cost: b.baseCost * TIER_COSTS[i],
        unlocked: s => s.buildings[b.id] >= req,
        apply: m => { m.building[b.id] *= 2; },
      });
    });
  });

  const PAT_DOUBLE = "Patting the penguin is twice as effective.";
  const PAT_FPS = "Each pat also catches 1% of your fish per second.";
  const CLICK_UPS = [
    { req: 1,   cost: 100,  icon: "🧤", name: "Mitten Warmers",    desc: `Warm flippers, gentle pats. ${PAT_DOUBLE}` },
    { req: 1,   cost: 500,  icon: "🤸", name: "Flipper Stretches", desc: `Limber up before patting. ${PAT_DOUBLE}` },
    { req: 10,  cost: 1e4,  icon: "🛷", name: "Belly Slide",       desc: `Arrive faster, pat sooner. ${PAT_DOUBLE}` },
    { req: 25,  cost: 1e5,  icon: "🐠", name: "Fish Sense",        desc: `You can feel where the fish are. ${PAT_FPS}` },
    { req: 50,  cost: 1e7,  icon: "🤿", name: "Deep Dive",         desc: `Every pat sends a penguin diving. ${PAT_FPS}` },
    { req: 100, cost: 1e9,  icon: "📜", name: "Grandma's Recipe",  desc: `The secret to a perfect pat. ${PAT_FPS}` },
    { req: 150, cost: 1e11, icon: "🌊", name: "Tidal Wiggle",      desc: `Pats ripple out across the sea. ${PAT_FPS}` },
    { req: 200, cost: 1e13, icon: "⚡", name: "Lightning Pats",     desc: `Too fast to see. ${PAT_FPS}` },
  ];
  CLICK_UPS.forEach((u, i) => {
    UPGRADES.push({
      id: `click_${i}`, icon: u.icon, kind: "click", name: u.name, desc: u.desc, cost: u.cost,
      unlocked: s => s.buildings.chick >= u.req || (i < 3 && s.stats.clicks >= 20 * (i + 1)),
      apply: i < 3 ? m => { m.click *= 2; } : m => { m.clickFps += 0.01; },
    });
  });

  const GLOBAL_UPS = [
    { at: 5e4,  cost: 9.9e4,  icon: "🪔", name: "Fish Oil Lanterns",  pct: 5,  flavour: "Light for the long polar night." },
    { at: 5e5,  cost: 9.9e5,  icon: "🧦", name: "Woolly Socks",       pct: 5,  flavour: "Warm feet, happy penguins." },
    { at: 5e6,  cost: 9.9e6,  icon: "🕳️", name: "Warm Burrows",       pct: 10, flavour: "A snug spot out of the wind." },
    { at: 5e7,  cost: 9.9e7,  icon: "🎤", name: "Colony Sing-Along",  pct: 10, flavour: "Everyone joins in, even the shy ones." },
    { at: 5e8,  cost: 9.9e8,  icon: "♨️", name: "Huddle Heaters",     pct: 15, flavour: "The huddle has never been cosier." },
    { at: 5e9,  cost: 9.9e9,  icon: "📦", name: "Cocoa Deliveries",   pct: 15, flavour: "Fresh cocoa at every doorstep." },
    { at: 5e10, cost: 9.9e10, icon: "📕", name: "Penguin Book Club",  pct: 20, flavour: "This month: Moby Fish." },
    { at: 5e11, cost: 9.9e11, icon: "🔥", name: "Fireside Stories",   pct: 20, flavour: "The elders tell of migrations past." },
    { at: 5e12, cost: 9.9e12, icon: "💌", name: "Ocean Pen-Pals",     pct: 25, flavour: "Letters from colonies far away." },
    { at: 5e13, cost: 9.9e13, icon: "🌍", name: "Planet-Wide Huddle", pct: 25, flavour: "Everyone, everywhere, keeping warm." },
  ];
  GLOBAL_UPS.forEach((u, i) => {
    UPGRADES.push({
      id: `global_${i}`, icon: u.icon, kind: "global", name: u.name, desc: `${u.flavour} All fish production +${u.pct}%.`, cost: u.cost,
      unlocked: s => s.runFish >= u.at,
      apply: m => { m.global *= 1 + u.pct / 100; },
    });
  });

  [["Shiny Lure", "✨", 7.7e5], ["Golden Hook", "🥇", 7.7e8], ["Sunbeam Net", "🌞", 7.7e11]].forEach(([name, icon, cost], i) => {
    UPGRADES.push({
      id: `gold_${i}`, icon, kind: "gold", name, cost,
      desc: "Golden fish appear 15% more often.",
      unlocked: s => s.stats.goldenClicks >= [1, 7, 27][i],
      apply: m => { m.goldenFreq *= 1.15; },
    });
  });

  // Synergies: two colony members that help each other (big boost one way, small boost back)
  const SYNERGIES = [
    ["chick",   "igloo",   "Cocoa Bedtime",         "🧸", "A warm mug before every nap."],
    ["fisher",  "drill",   "Hut Fishing Lessons",   "🎓", "The old hands teach the new."],
    ["igloo",   "factory", "Knitting by the Cocoa", "🧥", "Knitting is better with a warm drink."],
    ["krill",   "trawler", "Krill Lanterns",        "🔦", "Glowing krill light the boats' way."],
    ["trawler", "orca",    "Orca Tugboats",         "⚓", "Orcas tow the boats to the best spots."],
    ["aurora",  "rocket",  "Balloon Stargazing",    "🛰️", "The best view of the lights is from above."],
    ["factory", "fisher",  "Hand-Knit Nets",        "🕸️", "Fishers love a fresh net."],
    ["portal",  "time",    "Frozen Moments",        "🧊", "A globe that holds a whole afternoon."],
    ["orca",    "krill",   "Krill Buffet",          "🍽️", "Orcas work harder after a good meal."],
    ["rocket",  "chick",   "First Flight",          "🐦", "Chicks finally get to fly, sort of."],
    ["time",    "aurora",  "Eternal Aurora",        "🎆", "The lights never have to end."],
    ["drill",   "portal",  "Ice Hole Network",      "🌐", "Every hole leads to every sea."],
  ];
  SYNERGIES.forEach(([a, b, name, icon, flavour], i) => {
    const A = B_BY_ID[a], B = B_BY_ID[b];
    UPGRADES.push({
      id: `syn_${i}`, icon, kind: "synergy", name, pair: [a, b],
      desc: `${flavour} ${A.plural} +2% for each ${B.name} owned, and ${B.plural} +0.5% for each ${A.name} owned (counting up to 100 each).`,
      cost: Math.max(A.baseCost, B.baseCost) * 1000,
      unlocked: s => s.buildings[a] >= 15 && s.buildings[b] >= 15,
      apply: (m, s) => {
        // Capped at 100 partners: uncapped, 24 of these multipliers made production grow like (colony size)^24
        m.building[a] *= 1 + 0.02 * Math.min(100, s.buildings[b]) * m.synergy;
        m.building[b] *= 1 + 0.005 * Math.min(100, s.buildings[a]) * m.synergy;
      },
    });
  });

  // Scrapbook: grows stronger with every memory (achievement) collected
  [[10, 1e6,  "Photo Album",      "📷", 0.005], [20, 1e9,  "Framed Portraits", "🖼️", 0.01], [30, 1e12, "Colony Diary",   "📒", 0.015],
   [40, 1e15, "Home Movies",      "🎞️", 0.02],  [50, 1e18, "Love Letters",     "💝", 0.025], [60, 1e21, "Family Archive", "🗃️", 0.03]]
    .forEach(([need, cost, name, icon, per], i) => UPGRADES.push({
      id: `scrap_${i}`, icon, kind: "scrapbook", name, cost,
      desc: `Looking back warms the heart. All production +${+(per * 100).toFixed(1)}% for every memory collected.`,
      unlocked: s => s.achievements.length >= need,
      apply: (m, s) => { m.global *= 1 + per * s.achievements.length; },
    }));

  const UP_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

  // ---------- Workshop: levelled research bought with fish; packed away on migration ----------
  const RESEARCH = [
    { id: "mittens",    icon: "🥊", name: "Padded Mittens",    max: 20, cost: 300,   growth: 1.55, unlockAt: 100,
      text: L => `Pats +${25 * L}%`, apply: (m, L) => { m.click *= 1 + 0.25 * L; } },
    { id: "insulation", icon: "🧱", name: "Igloo Insulation",  max: 25, cost: 500,   growth: 1.6,  unlockAt: 200,
      text: L => `All production +${4 * L}%`, apply: (m, L) => { m.global *= 1 + 0.04 * L; } },
    { id: "lucky",      icon: "🎲", name: "Lucky Pats",        max: 20, cost: 2000,  growth: 1.7,  unlockAt: 1000,
      text: L => `${+(0.5 * L).toFixed(1)}% chance a pat is a Big Catch`, apply: (m, L) => { m.critChance += 0.005 * L; } },
    { id: "bignets",    icon: "🥅", name: "Big Catch Nets",    max: 10, cost: 5e4,   growth: 2,    unlockAt: 2e4,
      text: L => `Big Catches give ×${10 + L}`, apply: (m, L) => { m.critMult += L; } },
    { id: "bait",       icon: "💠", name: "Sparkly Bait",      max: 10, cost: 1e5,   growth: 2.2,  unlockAt: 5e4,
      text: L => `Golden fish ${5 * L}% more often`, apply: (m, L) => { m.goldenFreq *= 1 + 0.05 * L; } },
    { id: "currents",   icon: "🐢", name: "Slow Currents",     max: 10, cost: 1e5,   growth: 2.2,  unlockAt: 5e4,
      text: L => `Golden fish effects last ${5 * L}% longer`, apply: (m, L) => { m.goldenDur *= 1 + 0.05 * L; } },
    { id: "buckets",    icon: "🪣", name: "Bigger Buckets",    max: 10, cost: 2.5e5, growth: 2.2,  unlockAt: 1e5,
      text: L => `Lucky Catches +${10 * L}%`, apply: (m, L) => { m.luckyMult *= 1 + 0.1 * L; } },
    { id: "nightshift", icon: "🌃", name: "Night Shift Rota",  max: 10, cost: 5e5,   growth: 2,    unlockAt: 2e5,
      text: L => `Offline pace +${5 * L}% and ${2 * L} more hours`, apply: (m, L) => { m.offlineEff += 0.05 * L; m.offlineCapH += 2 * L; } },
    { id: "lullaby",    icon: "🌛", name: "Lullabies",         max: 8,  cost: 2e5,   growth: 2,    unlockAt: 1e5,
      text: L => `Napping fishes ${Math.round((NAP_BONUS + 0.05 * L) * 100)}% faster`, apply: (m, L) => { m.napMult += 0.05 * L; } },
    { id: "bulk",       icon: "📋", name: "Bulk Orders",       max: 15, cost: 1e6,   growth: 2,    unlockAt: 5e5,
      text: L => `Colony members ${Math.round((1 - Math.pow(0.98, L)) * 100)}% cheaper`, apply: (m, L) => { m.costMult *= Math.pow(0.98, L); } },
    { id: "teamwork",   icon: "🔗", name: "Colony Teamwork",   max: 10, cost: 1e7,   growth: 2.5,  unlockAt: 5e6,
      text: L => `Synergy upgrades ${10 * L}% stronger`, apply: (m, L) => { m.synergy *= 1 + 0.1 * L; } },
    { id: "medals",     icon: "🎖️", name: "Milestone Medals",  max: 5,  cost: 1e8,   growth: 4,    unlockAt: 5e7,
      text: L => `Milestones give ×${(2 + 0.05 * L).toFixed(2)} instead of ×2`, apply: (m, L) => { m.milestoneMult += 0.05 * L; } },
    { id: "scissors",   icon: "✂️", name: "Scrapbooking",      max: 10, cost: 1e9,   growth: 3,    unlockAt: 5e8,
      text: L => `Each memory gives +${(1 + 0.2 * L).toFixed(1)}% instead of +1%`, apply: (m, L) => { m.achBonus += 0.002 * L; } },
  ];
  const R_BY_ID = Object.fromEntries(RESEARCH.map(r => [r.id, r]));

  // ---------- Heirloom Tree: permanent skill tree bought with feathers ----------
  // x/y place each node on a 7×6 grid. `requires` = all of these; `requiresAny` = at least one.
  // Level-1 costs of the original heirlooms are unchanged so older saves add up the same.
  const lvl = L => Math.max(1, L);   // descriptions are always shown for at least level 1
  const TREE = [
    { id: "spirit", icon: "🐧", name: "Colony Spirit", branch: "root", x: 3, y: 0, max: 1, cost: 0, growth: 1,
      text: () => "All production +10%. The heart of every colony, and always yours.", apply: m => { m.global *= 1.1; } },

    // Hearth: production and economy
    { id: "headstart", icon: "🏡", name: "Warm Welcome", branch: "hearth", x: 1, y: 1, max: 1, cost: 1, growth: 1, requires: ["spirit"],
      text: () => "Start every migration with 5 Sleepy Chicks and 2 Scarf-Wrapped Fishers.", apply: m => { m.start.chick += 5; m.start.fisher += 2; } },
    { id: "nest", icon: "🥚", name: "Nest Egg", branch: "hearth", x: 0, y: 2, max: 5, cost: 25, growth: 2, requires: ["headstart"],
      text: L => `Start every migration with ${fmt(Math.pow(10, 3 + lvl(L)))} fish.`, apply: (m, L) => { m.startFish = Math.pow(10, 3 + L); } },
    { id: "cheaper", icon: "🏷️", name: "Hand-Me-Downs", branch: "hearth", x: 1, y: 2, max: 5, cost: 100, growth: 2, requires: ["headstart"],
      text: L => `Colony members ${Math.round((1 - 0.9 * Math.pow(0.95, lvl(L) - 1)) * 100)}% cheaper.`, apply: (m, L) => { m.costMult *= 0.9 * Math.pow(0.95, L - 1); } },
    { id: "hearth", icon: "🏕️", name: "Hearth Keeper", branch: "hearth", x: 2, y: 2, max: 10, cost: 15, growth: 1.6, requires: ["headstart"],
      text: L => `All production +${10 * lvl(L)}%.`, apply: (m, L) => { m.global *= 1 + 0.1 * L; } },
    { id: "memory", icon: "🍲", name: "Family Recipes", branch: "hearth", x: 0, y: 3, max: 3, cost: 2000, growth: 4, requires: ["nest"],
      text: L => `Keep tier I–${TIER_NUMERALS[lvl(L) + 1]} colony upgrades when you migrate.`, apply: (m, L) => { m.keepTiers = L + 2; } },
    { id: "family", icon: "🍼", name: "Big Family", branch: "hearth", x: 1, y: 3, max: 5, cost: 1000, growth: 2.5, requires: ["cheaper"],
      text: L => `Start every migration with ${5 * lvl(L)} more of each of the first four colony members.`,
      apply: (m, L) => { ["chick", "fisher", "drill", "igloo"].forEach(id => { m.start[id] += 5 * L; }); } },
    { id: "numbers", icon: "💪", name: "Strength in Numbers", branch: "hearth", x: 2, y: 3, max: 3, cost: 5000, growth: 4, requires: ["hearth"],
      text: L => `All production +${lvl(L)}% for every 25 colony members you own (up to 1,000).`,
      apply: (m, L, s) => { m.global *= 1 + 0.01 * L * Math.min(40, Math.floor(totalColony(s) / 25)); } },
    { id: "emperor", icon: "👑", name: "Emperor's Blessing", branch: "hearth", x: 1, y: 4, max: 5, cost: 100000, growth: 3, requires: ["family", "numbers"],
      text: L => `Each feather boosts production by ${2 + 0.5 * lvl(L)}% instead of 2%.`, apply: (m, L) => { m.featherPer = 0.02 + 0.005 * L; } },
    { id: "eternal", icon: "💖", name: "Eternal Hearth", branch: "hearth", x: 1, y: 5, max: 1, cost: 5000000, growth: 1, requires: ["emperor"], capstone: true,
      text: () => "All production ×3.", apply: m => { m.global *= 3; } },

    // Flipper: active patting
    { id: "flippers", icon: "👵", name: "Grandma's Mittens", branch: "flipper", x: 3, y: 1, max: 3, cost: 3, growth: 3, requires: ["spirit"],
      text: L => `Pats ×${Math.pow(3, lvl(L))}.`, apply: (m, L) => { m.click *= Math.pow(3, L); } },
    { id: "autoclick", icon: "🐥", name: "Chick Helpers", branch: "flipper", x: 3, y: 2, max: 5, cost: 100, growth: 2, requires: ["flippers"],
      text: L => `Chicks pat the penguin for you, ${5 * lvl(L)} times a second.`, apply: (m, L) => { m.autoRate += 5 * L; } },
    { id: "luckyflip", icon: "🎯", name: "Lucky Flippers", branch: "flipper", x: 3, y: 3, max: 5, cost: 2000, growth: 2.5, requires: ["autoclick"],
      text: L => `+${2 * lvl(L)}% chance for any pat to be a Big Catch.`, apply: (m, L) => { m.critChance += 0.02 * L; } },
    { id: "embrace", icon: "🧡", name: "Warm Embrace", branch: "flipper", x: 3, y: 4, max: 5, cost: 50000, growth: 3, requires: ["luckyflip"],
      text: L => `Each pat also catches ${+(0.5 * lvl(L)).toFixed(1)}% more of your fish per second.`, apply: (m, L) => { m.clickFps += 0.005 * L; } },
    { id: "legend", icon: "🏅", name: "Flipper Legend", branch: "flipper", x: 3, y: 5, max: 1, cost: 5000000, growth: 1, requires: ["embrace"], capstone: true,
      text: () => "Pats ×10 and Big Catches ×2.", apply: m => { m.click *= 10; m.critMult *= 2; } },

    // Wanderer: golden fish and time away
    { id: "offline1", icon: "💭", name: "Sweet Dreams", branch: "wanderer", x: 5, y: 1, max: 1, cost: 10, growth: 1, requires: ["spirit"],
      text: () => "While you're away, the colony fishes at 50% pace instead of 25%.", apply: m => { m.offlineEff += 0.25; } },
    { id: "golden", icon: "🔆", name: "Golden Instinct", branch: "wanderer", x: 4, y: 2, max: 3, cost: 75, growth: 3, requires: ["offline1"],
      text: L => `Golden fish appear ${1 + 0.5 * lvl(L)}× as often.`, apply: (m, L) => { m.goldenFreq *= 1 + 0.5 * L; } },
    { id: "offline2", icon: "🐻", name: "Deep Hibernation", branch: "wanderer", x: 5, y: 2, max: 1, cost: 250, growth: 1, requires: ["offline1"],
      text: () => "While you're away, fish at 100% pace for up to 72 hours.", apply: m => { m.offlineEff += 0.5; m.offlineCapH += 48; } },
    { id: "frenzy", icon: "🥤", name: "Bottomless Cocoa", branch: "wanderer", x: 6, y: 2, max: 1, cost: 500, growth: 1, requires: ["offline1"],
      text: () => "Golden fish effects last twice as long.", apply: m => { m.goldenDur *= 2; } },
    { id: "treasure", icon: "🗝️", name: "Treasure Keys", branch: "wanderer", x: 4, y: 3, max: 5, cost: 1500, growth: 2.5, requires: ["golden"],
      text: L => `Lucky Catches +${25 * lvl(L)}%.`, apply: (m, L) => { m.luckyMult *= 1 + 0.25 * L; } },
    { id: "dreams", icon: "🌜", name: "Dream Fishing", branch: "wanderer", x: 5, y: 3, max: 2, cost: 20000, growth: 4, requires: ["offline2"],
      text: L => `While you're away, fish at ${100 + 25 * lvl(L)}% pace.`, apply: (m, L) => { m.offlineEff += 0.25 * L; } },
    { id: "rush", icon: "⏩", name: "Rush Hour", branch: "wanderer", x: 6, y: 3, max: 4, cost: 5000, growth: 3, requires: ["frenzy"],
      text: L => `Cocoa Rush gives ×${7 + lvl(L)} instead of ×7.`, apply: (m, L) => { m.rushMult += L; } },
    { id: "finder", icon: "🔍", name: "Feather Finder", branch: "wanderer", x: 5, y: 4, max: 5, cost: 100000, growth: 3, requiresAny: ["treasure", "dreams", "rush"],
      text: L => `Migrations earn ${10 * lvl(L)}% more feathers.`, apply: (m, L) => { m.featherGain *= 1 + 0.1 * L; } },
    { id: "wanderer", icon: "🎇", name: "Aurora Wanderer", branch: "wanderer", x: 5, y: 5, max: 1, cost: 10000000, growth: 1, requires: ["finder"], capstone: true,
      text: () => "Golden fish can bring an Aurora Blessing: production ×50 for 30 seconds.", apply: m => { m.aurora = true; } },
  ];
  const H_BY_ID = Object.fromEntries(TREE.map(n => [n.id, n]));
  const BRANCH_NAMES = { root: "Root", hearth: "🏕️ Hearth", flipper: "🧤 Flipper", wanderer: "🌙 Wanderer" };
  const totalColony = s => Object.values(s.buildings).reduce((a, b) => a + b, 0);

  const ACHIEVEMENTS = [];
  const ach = (id, name, desc, check, icon, badge = "") => ACHIEVEMENTS.push({ id, name, desc, check, icon, badge });
  [[1, "First Catch", "🎏"], [100, "Snack Time", "🍣"], [1e4, "Full Pantry", "🥫"], [1e6, "Millionfish", "💰"], [1e9, "Billion Bellies", "🏦"],
   [1e12, "Trillion Tails", "🐳"], [1e15, "Ocean of Plenty", "🌋"], [1e18, "Fish Singularity", "🌌"]].forEach(([n, name, icon]) =>
    ach(`fish_${n}`, name, `Catch ${fmt(n)} fish in total.`, s => s.lifetimeFish >= n, icon));
  [[1, "Hatching", "🥚"], [10, "Huddling", "🫂"], [100, "Waddling", "🐾"], [1e3, "Thriving", "🌻"], [1e5, "Bustling", "🎪"], [1e7, "Unstoppable", "🚂"], [1e9, "Fish Blizzard", "🌀"]].forEach(([n, name, icon]) =>
    ach(`fps_${n}`, name, `Reach ${fmt(n)} fish per second.`, (s, E) => E.fishPerSecond(false) >= n, icon));
  [[1, "Gentle Pat", "👋"], [100, "Head Scratches", "🤗"], [1000, "Best Friends", "💞"], [10000, "Inseparable", "♾️"]].forEach(([n, name, icon]) =>
    ach(`click_${n}`, name, `Pat the penguin ${fmt(n)} time${n > 1 ? "s" : ""}.`, s => s.stats.clicks >= n, icon));
  BUILDINGS.forEach(b => {
    [[1, ""], [50, "A Village of "], [100, "A Kingdom of "]].forEach(([n, pre]) =>
      ach(`b_${b.id}_${n}`, n === 1 ? `First ${b.name}` : `${pre}${b.plural}`, `Own ${n} ${n > 1 ? b.plural : b.name}.`,
        s => s.buildings[b.id] >= n, b.icon, String(n)));
  });
  [[1, "Shiny!", "💫"], [7, "Lucky Penguin", "🍀"], [27, "Gold Rush", "🏺"], [77, "Sunbeam Flipper", "🌅"]].forEach(([n, name, icon]) =>
    ach(`gold_${n}`, name, `Catch ${n} golden fish.`, s => s.stats.goldenClicks >= n, icon));
  [[1, "The Long Walk", "👣"], [5, "Seasoned Traveller", "🧳"], [25, "Eternal March", "🗻"]].forEach(([n, name, icon]) =>
    ach(`mig_${n}`, name, `Migrate ${n} time${n > 1 ? "s" : ""}.`, s => s.migrations >= n, icon));
  ach("idle", "Penguin Nap", "Come back after more than an hour away.", s => s.stats.longestAway >= 3600, "😴");
  ach("allb", "The Whole Family", "Own at least one of every colony member.", s => BUILDINGS.every(b => s.buildings[b.id] > 0), "👪");
  ach("res_1", "Tinkerer", "Research something in the Workshop.", s => Object.keys(s.research).length > 0, "🔧");
  ach("res_max", "Master Craftsman", "Max out a Workshop project.", s => RESEARCH.some(r => (s.research[r.id] || 0) >= r.max), "🛠️");
  ach("syn_1", "Better Together", "Buy a synergy upgrade.", s => s.upgrades.some(id => id.startsWith("syn_")), "🎎");
  ach("syn_all", "One Big Happy Colony", "Buy every synergy upgrade.", s => SYNERGIES.every((_, i) => s.upgrades.includes(`syn_${i}`)), "🏯");
  ach("crit_1", "Big Catch!", "Land a Big Catch.", s => s.stats.bigCatches >= 1, "🐡");
  ach("crit_100", "Trophy Wall", "Land 100 Big Catches.", s => s.stats.bigCatches >= 100, "🏆");
  ach("tree_cap", "Branching Out", "Learn a capstone heirloom.", s => TREE.some(n => n.capstone && (s.heritage[n.id] || 0) > 0), "🌳");
  ach("tree_all", "Family Tree", "Learn every heirloom at least once.", s => TREE.every(n => n.id === "spirit" || (s.heritage[n.id] || 0) > 0), "🌲");

  // ---------- Helpers: permanent automation bought with feathers (switch each on or off) ----------
  const HELPERS = [
    { id: "shopkeeper", icon: "🛒", name: "Shopkeeper Pip",  cost: 15,  every: 1,
      desc: "Buys upgrades for you as soon as you can afford them, cheapest first." },
    { id: "foreman",    icon: "👷", name: "Foreman Waddles", cost: 40,  every: 1,
      desc: "Buys colony members for you: the best value you can afford, saving up when a better one is nearly in reach." },
    { id: "tinker",     icon: "🔨", name: "Tinker Bo",       cost: 200,  every: 2,
      desc: "Levels up Workshop research for you, cheapest first." },
    { id: "lookout",    icon: "📯", name: "Lookout Lumi",    cost: 500, every: 1,
      desc: "Catches golden fish for you a few seconds after they appear." },
    { id: "planner",    icon: "🗓️", name: "Planner Pem",     cost: 2000, every: 5,
      desc: "Sets off on the Great Migration once it would at least double your feathers, heading for the shore you've picked." },
  ];
  const HELPER_BY_ID = Object.fromEntries(HELPERS.map(h => [h.id, h]));

  // ---------- Shores: where each migration lands. Each gives the run a twist. ----------
  // unlockAt = migrations completed. mods are folded into the modifier object while you live there.
  const SHORES = [
    { id: "home",         icon: "🏔️", name: "Home Ice",        unlockAt: 0, desc: "Familiar ice. No surprises.", mods: {} },
    { id: "krillbay",     icon: "🏖️", name: "Krill Bay",       unlockAt: 1, desc: "Krill Gardens ×5, but Lantern Boats ×0.5.", mods: { building: { krill: 5, trawler: 0.5 } } },
    { id: "sunnycove",    icon: "☀️", name: "Sunny Cove",      unlockAt: 1, desc: "Golden fish appear 3× as often, but production ×0.75.", mods: { goldenFreq: 3, global: 0.75 } },
    { id: "blizzard",     icon: "🌨️", name: "Blizzard Pass",   unlockAt: 2, desc: "No golden fish at all, but you earn 50% more feathers when you leave.", mods: { noGolden: true, featherGain: 1.5 } },
    { id: "aurorafields", icon: "🌠", name: "Aurora Fields",   unlockAt: 3, desc: "Aurora Observatories and Hot-Air Balloons ×4, but pats ×0.5.", mods: { building: { aurora: 4, rocket: 4 }, click: 0.5 } },
    { id: "quiethollow",  icon: "🌲", name: "Quiet Hollow",    unlockAt: 4, desc: "Time away counts double, but pats ×0.25.", mods: { offline: 2, click: 0.25 } },
    { id: "harbour",      icon: "🏙️", name: "Busy Harbour",    unlockAt: 5, desc: "Colony members 25% cheaper, but upgrades cost twice as much.", mods: { costMult: 0.75, upgradeCost: 2 } },
    { id: "rookery",      icon: "👴", name: "Elders' Rookery", unlockAt: 6, desc: "Workshop research costs half as much, but production ×0.8.", mods: { researchCost: 0.5, global: 0.8 } },
  ];
  const SHORE_BY_ID = Object.fromEntries(SHORES.map(s => [s.id, s]));

  // ---------- Seasonal events, by real date (Antarctic seasons: midwinter is in June) ----------
  const SEASONS = [
    { id: "sunlit",       icon: "🌞", name: "Sunlit Festival",        from: [12, 15], to: [1, 5],
      desc: "Midsummer in Antarctica: the sun never sets. Golden fish appear twice as often.", mods: { goldenFreq: 2 }, cosmetic: ["hat", "sunhat"] },
    { id: "awareness",    icon: "🎗️", name: "Penguin Awareness Week", from: [1, 16],  to: [1, 22],
      desc: "Everyone's thinking about penguins. Pats ×2.", mods: { click: 2 }, cosmetic: ["item", "rosette"] },
    { id: "worldpenguin", icon: "🎉", name: "World Penguin Day",      from: [4, 20],  to: [4, 28],
      desc: "A colony-wide party! All production +25%.", mods: { global: 1.25 }, cosmetic: ["scarf", "party"] },
    { id: "midwinter",    icon: "🕯️", name: "Midwinter Feast",        from: [6, 14],  to: [6, 28],
      desc: "The longest night, celebrated with a feast. Lucky Catches +50% and golden fish effects last twice as long.", mods: { luckyMult: 1.5, goldenDur: 2 }, cosmetic: ["hat", "snowflake"] },
  ];
  const SEASON_BY_ID = Object.fromEntries(SEASONS.map(s => [s.id, s]));

  // ---------- Wardrobe: cosmetics for the big penguin. Unlocks are derived from progress. ----------
  const memories = n => ({ need: s => s.achievements.length >= n, unlockText: `Collect ${n} memories` });
  const seasonal = id => ({ need: s => s.seasonalUnlocks.includes(id), unlockText: `Catch a golden fish during ${SEASON_BY_ID[id].name}` });
  const COSMETICS = {
    hat: [
      { id: "coral",     name: "Coral Beanie",     beanie: ["#e8735a", "#f6d7b0", "#c95a44"], need: () => true, unlockText: "Always yours" },
      { id: "mint",      name: "Mint Beanie",      beanie: ["#6cc4a1", "#e6f7ef", "#4ea283"], ...memories(5) },
      { id: "lavender",  name: "Lavender Beanie",  beanie: ["#a58bd6", "#efe7ff", "#8a6fc0"], ...memories(15) },
      { id: "sky",       name: "Sky Beanie",       beanie: ["#6fa8dc", "#e3f0fb", "#4f8cc4"], ...memories(25) },
      { id: "golden",    name: "Golden Beanie",    beanie: ["#f2c14e", "#fff2c6", "#d6a32e"], need: s => TREE.some(n => n.capstone && (s.heritage[n.id] || 0) > 0), unlockText: "Learn a capstone heirloom" },
      { id: "snowflake", name: "Snowflake Toque",  beanie: ["#dfe9f5", "#8fb3e0", "#b9cde6"], snow: true, ...seasonal("midwinter") },
      { id: "tophat",    name: "Top Hat",          emoji: "🎩", need: s => s.migrations >= 1, unlockText: "Migrate once" },
      { id: "scholar",   name: "Scholar's Cap",    emoji: "🎓", need: s => s.achievements.includes("res_max"), unlockText: "Max out a Workshop project" },
      { id: "crown",     name: "Little Crown",     emoji: "👑", need: s => (s.heritage.emperor || 0) > 0, unlockText: "Learn Emperor's Blessing" },
      { id: "sunhat",    name: "Sun Hat",          emoji: "👒", ...seasonal("sunlit") },
      { id: "sleepmask", name: "Sleep Mask",       mask: ["#b9a6e8", "#6f58a8", "#efe7ff"], need: s => s.napStreak.best >= 7, unlockText: "Nap on 7 days in a row" },
      { id: "nightcap",  name: "Nightcap",         beanie: ["#3b4a8a", "#f6e7b0", "#2c3970"], need: s => s.achievements.includes("nap_hour"), unlockText: "Nap for an hour" },
    ],
    scarf: [
      { id: "coral",    name: "Coral Scarf",       colors: ["#e8735a", "#f6d7b0"], need: () => true, unlockText: "Always yours" },
      { id: "mint",     name: "Mint Scarf",        colors: ["#6cc4a1", "#e6f7ef"], ...memories(10) },
      { id: "lavender", name: "Lavender Scarf",    colors: ["#a58bd6", "#efe7ff"], ...memories(20) },
      { id: "sky",      name: "Sky Scarf",         colors: ["#6fa8dc", "#e3f0fb"], ...memories(30) },
      { id: "rainbow",  name: "Rainbow Scarf",     colors: ["url(#rainbowGrad)", "#ffffff"], ...memories(40) },
      { id: "golden",   name: "Golden Scarf",      colors: ["#f2c14e", "#fff2c6"], ...memories(60) },
      { id: "party",    name: "Penguin Day Scarf", colors: ["#3d6fb6", "#ffffff"], ...seasonal("worldpenguin") },
    ],
    item: [
      { id: "none",    name: "Nothing",       emoji: "",   need: () => true, unlockText: "Always yours" },
      { id: "mug",     name: "Cocoa Mug",     emoji: "☕", need: () => true, unlockText: "Always yours" },
      { id: "rod",     name: "Fishing Rod",   emoji: "🎣", need: s => s.buildings.fisher >= 50 || s.achievements.includes("b_fisher_50"), unlockText: "Own 50 Scarf-Wrapped Fishers" },
      { id: "lantern", name: "Paper Lantern", emoji: "🏮", need: s => s.achievements.includes("b_trawler_1"), unlockText: "Own a Lantern Boat" },
      { id: "balloon", name: "Balloon",       emoji: "🎈", need: s => s.achievements.includes("b_rocket_1"), unlockText: "Own a Hot-Air Balloon" },
      { id: "book",    name: "Storybook",     emoji: "📖", need: s => s.stats.lettersClaimed >= 10, unlockText: "Answer 10 penguin letters" },
      { id: "rosette", name: "Rosette",       emoji: "🏵️", ...seasonal("awareness") },
    ],
  };
  const COSMETIC_SLOTS = { hat: "Hat", scarf: "Scarf", item: "Holding" };

  // ---------- Penguin letters: gentle daily goals. Targets are picked per day from a seeded RNG. ----------
  const LETTER_SENDERS = [
    ["Grandma Pebble", "👵"], ["Captain Flipper", "🧑‍✈️"], ["Little Sprout", "🐣"], ["Old Man Iceberg", "🧓"],
    ["Auntie Krill", "🦐"], ["Professor Waddle", "🧐"], ["Cousin Puddle", "🐧"],
  ];
  // Cute names for residents the player hasn't named (and for the 🎲 button). Keep them short: tags are small.
  const CUTE_NAMES = [
    "Mochi", "Pebble", "Biscuit", "Dumpling", "Noodle", "Waffles", "Button", "Pudding", "Sprinkle", "Tofu",
    "Bean", "Muffin", "Pickle", "Snowpea", "Nugget", "Cocoa", "Marshmallow", "Pip", "Bubbles", "Crumpet",
    "Sushi", "Truffle", "Jellybean", "Popcorn", "Flurry", "Puffin", "Tater", "Squeak", "Dot", "Bonbon",
    "Wiggles", "Toffee", "Pancake", "Sesame", "Clover", "Peanut", "Frosty", "Bramble", "Taffy", "Mittens",
    "Gumdrop", "Kiwi", "Cupcake", "Scampi", "Domino", "Poppy", "Flapjack", "Snowball", "Hazel", "Churro",
  ];
  const LETTER_TYPES = [
    { id: "pats",     stat: "clicks",          range: [100, 300], text: n => `Could you give the big penguin ${fmt(n)} pats? They've been a bit lonely.` },
    { id: "build",    stat: "buildingsBought", range: [10, 30],   text: n => `We need more flippers! Please welcome ${fmt(n)} new colony members.` },
    { id: "upgrades", stat: "upgradesBought",  range: [2, 5],     text: n => `The colony would love ${n} new upgrades. Treat yourself!` },
    { id: "golden",   stat: "goldenClicks",    range: [1, 3],     text: n => `I saw a golden fish yesterday! Could you catch ${n} for me?` },
    { id: "research", stat: "researchBought",  range: [3, 8],     text: n => `The Workshop is so quiet. Could you research ${n} levels?`, available: s => s.runFish >= 200 },
    { id: "bigcatch", stat: "bigCatches",      range: [3, 10],    text: n => `Tell me about your Big Catches! I'd love to hear of ${n}.`,
      available: s => (s.research.lucky || 0) > 0 || (s.heritage.luckyflip || 0) > 0 },
    { id: "fish",     stat: "lifetimeFish",    range: [20, 40],   fishMinutes: true, text: n => `Could the colony catch ${fmt(n)} fish? We're planning a feast.` },
  ];

  // ---------- More memories for the newer systems ----------
  ach("helpers_all", "Many Flippers", "Hire every helper.", s => HELPERS.every(h => s.helpers[h.id]), "🙌");
  ach("shores_3", "Explorer", "Visit 3 different shores.", s => s.shoresVisited.length >= 3, "🧭");
  ach("shores_all", "Globetrotter", "Visit every shore.", s => SHORES.every(sh => s.shoresVisited.includes(sh.id)), "🌏");
  ach("letters_1", "Pen Pal", "Answer a penguin letter.", s => s.stats.lettersClaimed >= 1, "✉️");
  ach("letters_30", "Faithful Friend", "Answer 30 penguin letters.", s => s.stats.lettersClaimed >= 30, "📬");
  ach("outfit", "Dressed Up", "Change the big penguin's outfit.", s => s.stats.outfitChanges >= 1, "🪞");
  ach("season_1", "Festive Spirit", "Catch a golden fish during a seasonal event.", s => s.stats.seasonalCatches >= 1, "🎊");
  ach("deliver_100", "Basket Brigade", "Watch the colony carry 100 catches to the basket.", s => s.stats.deliveries >= 100, "🧺");
  ach("deliver_1000", "Overflowing Basket", "Watch the colony carry 1,000 catches to the basket.", s => s.stats.deliveries >= 1000, "🪣");
  ach("prop_look", "Curious Flipper", "See how a colony member makes its fish (hover or tap it in the scene).", s => s.stats.propLooks >= 1, "🔎");
  ach("name_1", "Friends by Name", "Give a resident a name.", s => (s.names || []).some(Boolean), "📛");
  ach("name_all", "Everyone Has a Name", "Name six residents.", s => (s.names || []).filter(Boolean).length >= 6, "🏷️");
  ach("music_hour", "Lofi Listener", "Listen to the colony's music for an hour.", s => s.stats.musicSeconds >= 3600, "🎧");
  ach("rub_100", "Belly Rubs", "Pat the penguin 100 times by rubbing it.", s => s.stats.rubPats >= 100, "🫳");
  ach("nap_hour", "Power Nap", "Let the colony nap for an hour in total (💤 in the top bar).", s => s.stats.napSeconds >= 3600, "🌙");
  ach("lullaby_max", "Sweet Dreams", "Learn every Lullaby in the Workshop.", s => (s.research.lullaby || 0) >= 8, "🪷");
  ach("moonlit", "Moonlit Sky", "Nap for 24 hours in total and fill the sky with nap stars.", s => s.stats.napSeconds >= 24 * 3600, "🎑");
  ach("nap_day", "Hibernation Champion", "Let the colony nap for 8 hours in total.", s => s.stats.napSeconds >= 8 * 3600, "🛌");
  ach("rub_5000", "Belly Rub Expert", "Pat the penguin 5,000 times by rubbing it.", s => s.stats.rubPats >= 5000, "💆");

  PI.fmt = fmt;
  PI.fmtTime = fmtTime;
  PI.fmtOptions = fmtOptions;
  PI.data = {
    SAVE_KEY, SAVE_VERSION: 4, NAP_BONUS, BEDTIMES, NAP_STARS, CHANGELOG, GAME_VERSION, COST_GROWTH, MILESTONES, FEATHER_BONUS, ACH_BONUS, FEATHER_SCALE, SUFFIXES, TEXT_SIZES,
    BUILDINGS, B_BY_ID, TIER_REQS, TIER_COSTS, TIER_NUMERALS, BUILDING_UPGRADES,
    UPGRADES, UP_BY_ID, SYNERGIES, RESEARCH, R_BY_ID, TREE, H_BY_ID, BRANCH_NAMES, totalColony,
    ACHIEVEMENTS, HELPERS, HELPER_BY_ID, SHORES, SHORE_BY_ID, SEASONS, SEASON_BY_ID,
    COSMETICS, COSMETIC_SLOTS, LETTER_SENDERS, LETTER_TYPES, CUTE_NAMES,
  };
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
