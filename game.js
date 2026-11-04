/* Penguin Idle — a cozy penguin idle game.
 * No build step and no dependencies: open index.html or host the folder on GitHub Pages.
 *
 * Structure
 *   1. Constants & data tables   (IDs are save-file keys: rename display names freely, never IDs)
 *   2. State & maths
 *   3. Actions                   (change state, then emit an event on the bus)
 *   4. Feedback (game feel)      (sound, particles, screen shake, scaled by importance tier)
 *   5. Save / load / migration
 *   6. UI                        (structure re-renders on events; a light ticker updates live numbers)
 *   7. Wiring
 */
(() => {
  "use strict";

  // =====================================================================
  // 1. Constants & data
  // =====================================================================

  const SAVE_KEY = "penguinIdleSave_v1";   // storage key never changes; the schema version lives inside the save
  const SAVE_VERSION = 3;
  const COST_GROWTH = 1.15;
  const MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000];
  const FEATHER_BONUS = 0.02;      // per feather ever earned
  const ACH_BONUS = 0.01;          // per achievement
  const FEATHER_SCALE = 1e9;       // lifetime fish needed for the first feather
  const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc", "Vg"];
  const TEXT_SIZES = [1, 1.15, 1.3, 1.5];
  const prefersReducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  let S = null;   // game state, declared before anything that formats numbers

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
      desc: "Golden fish appear 15% more often and stay a little longer.",
      unlocked: s => s.stats.goldenClicks >= [1, 7, 27][i],
      apply: m => { m.goldenFreq *= 1.15; m.goldenDur *= 1.1; },
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
      desc: `${flavour} ${A.plural} +5% for each ${B.name} owned, and ${B.plural} +1% for each ${A.name} owned.`,
      cost: Math.max(A.baseCost, B.baseCost) * 1000,
      unlocked: s => s.buildings[a] >= 15 && s.buildings[b] >= 15,
      apply: (m, s) => {
        m.building[a] *= 1 + 0.05 * s.buildings[b] * m.synergy;
        m.building[b] *= 1 + 0.01 * s.buildings[a] * m.synergy;
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
      text: L => `${L}% chance a pat is a Big Catch`, apply: (m, L) => { m.critChance += 0.01 * L; } },
    { id: "bignets",    icon: "🥅", name: "Big Catch Nets",    max: 10, cost: 5e4,   growth: 2,    unlockAt: 2e4,
      text: L => `Big Catches give ×${10 + 2 * L}`, apply: (m, L) => { m.critMult += 2 * L; } },
    { id: "bait",       icon: "💠", name: "Sparkly Bait",      max: 10, cost: 1e5,   growth: 2.2,  unlockAt: 5e4,
      text: L => `Golden fish ${5 * L}% more often`, apply: (m, L) => { m.goldenFreq *= 1 + 0.05 * L; } },
    { id: "currents",   icon: "🐢", name: "Slow Currents",     max: 10, cost: 1e5,   growth: 2.2,  unlockAt: 5e4,
      text: L => `Golden fish effects last ${8 * L}% longer`, apply: (m, L) => { m.goldenDur *= 1 + 0.08 * L; } },
    { id: "buckets",    icon: "🪣", name: "Bigger Buckets",    max: 10, cost: 2.5e5, growth: 2.2,  unlockAt: 1e5,
      text: L => `Lucky Catches +${15 * L}%`, apply: (m, L) => { m.luckyMult *= 1 + 0.15 * L; } },
    { id: "nightshift", icon: "🌃", name: "Night Shift Rota",  max: 10, cost: 5e5,   growth: 2,    unlockAt: 2e5,
      text: L => `Offline pace +${5 * L}% and ${2 * L} more hours`, apply: (m, L) => { m.offlineEff += 0.05 * L; m.offlineCapH += 2 * L; } },
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
    { id: "nest", icon: "🥚", name: "Nest Egg", branch: "hearth", x: 0, y: 2, max: 5, cost: 5, growth: 2, requires: ["headstart"],
      text: L => `Start every migration with ${fmt(Math.pow(10, 3 + lvl(L)))} fish.`, apply: (m, L) => { m.startFish = Math.pow(10, 3 + L); } },
    { id: "cheaper", icon: "🏷️", name: "Hand-Me-Downs", branch: "hearth", x: 1, y: 2, max: 5, cost: 30, growth: 1.8, requires: ["headstart"],
      text: L => `Colony members ${Math.round((1 - 0.9 * Math.pow(0.95, lvl(L) - 1)) * 100)}% cheaper.`, apply: (m, L) => { m.costMult *= 0.9 * Math.pow(0.95, L - 1); } },
    { id: "hearth", icon: "🏕️", name: "Hearth Keeper", branch: "hearth", x: 2, y: 2, max: 10, cost: 3, growth: 1.5, requires: ["headstart"],
      text: L => `All production +${10 * lvl(L)}%.`, apply: (m, L) => { m.global *= 1 + 0.1 * L; } },
    { id: "memory", icon: "🍲", name: "Family Recipes", branch: "hearth", x: 0, y: 3, max: 3, cost: 75, growth: 2, requires: ["nest"],
      text: L => `Keep tier I–${TIER_NUMERALS[lvl(L) + 1]} colony upgrades when you migrate.`, apply: (m, L) => { m.keepTiers = L + 2; } },
    { id: "family", icon: "🍼", name: "Big Family", branch: "hearth", x: 1, y: 3, max: 5, cost: 20, growth: 1.8, requires: ["cheaper"],
      text: L => `Start every migration with ${5 * lvl(L)} more of each of the first four colony members.`,
      apply: (m, L) => { ["chick", "fisher", "drill", "igloo"].forEach(id => { m.start[id] += 5 * L; }); } },
    { id: "numbers", icon: "💪", name: "Strength in Numbers", branch: "hearth", x: 2, y: 3, max: 3, cost: 60, growth: 2, requires: ["hearth"],
      text: L => `All production +${lvl(L)}% for every 25 colony members you own.`,
      apply: (m, L, s) => { m.global *= 1 + 0.01 * L * Math.floor(totalColony(s) / 25); } },
    { id: "emperor", icon: "👑", name: "Emperor's Blessing", branch: "hearth", x: 1, y: 4, max: 5, cost: 250, growth: 2, requires: ["family", "numbers"],
      text: L => `Each feather boosts production by ${2 + lvl(L)}% instead of 2%.`, apply: (m, L) => { m.featherPer = 0.02 + 0.01 * L; } },
    { id: "eternal", icon: "💖", name: "Eternal Hearth", branch: "hearth", x: 1, y: 5, max: 1, cost: 1000, growth: 1, requires: ["emperor"], capstone: true,
      text: () => "All production ×3.", apply: m => { m.global *= 3; } },

    // Flipper: active patting
    { id: "flippers", icon: "👵", name: "Grandma's Mittens", branch: "flipper", x: 3, y: 1, max: 3, cost: 3, growth: 3, requires: ["spirit"],
      text: L => `Pats ×${Math.pow(3, lvl(L))}.`, apply: (m, L) => { m.click *= Math.pow(3, L); } },
    { id: "autoclick", icon: "🐥", name: "Chick Helpers", branch: "flipper", x: 3, y: 2, max: 5, cost: 20, growth: 1.8, requires: ["flippers"],
      text: L => `Chicks pat the penguin for you, ${5 * lvl(L)} times a second.`, apply: (m, L) => { m.autoRate += 5 * L; } },
    { id: "luckyflip", icon: "🎯", name: "Lucky Flippers", branch: "flipper", x: 3, y: 3, max: 5, cost: 40, growth: 1.8, requires: ["autoclick"],
      text: L => `+${3 * lvl(L)}% chance for any pat to be a Big Catch.`, apply: (m, L) => { m.critChance += 0.03 * L; } },
    { id: "embrace", icon: "🧡", name: "Warm Embrace", branch: "flipper", x: 3, y: 4, max: 5, cost: 100, growth: 2, requires: ["luckyflip"],
      text: L => `Each pat also catches ${3 * lvl(L)}% of your fish per second.`, apply: (m, L) => { m.clickFps += 0.03 * L; } },
    { id: "legend", icon: "🏅", name: "Flipper Legend", branch: "flipper", x: 3, y: 5, max: 1, cost: 1000, growth: 1, requires: ["embrace"], capstone: true,
      text: () => "Pats ×10 and Big Catches ×5.", apply: m => { m.click *= 10; m.critMult *= 5; } },

    // Wanderer: golden fish and time away
    { id: "offline1", icon: "💭", name: "Sweet Dreams", branch: "wanderer", x: 5, y: 1, max: 1, cost: 10, growth: 1, requires: ["spirit"],
      text: () => "While you're away, the colony fishes at 50% pace instead of 25%.", apply: m => { m.offlineEff += 0.25; } },
    { id: "golden", icon: "🔆", name: "Golden Instinct", branch: "wanderer", x: 4, y: 2, max: 3, cost: 15, growth: 2.5, requires: ["offline1"],
      text: L => `Golden fish appear ${1 + lvl(L)}× as often.`, apply: (m, L) => { m.goldenFreq *= 1 + L; } },
    { id: "offline2", icon: "🐻", name: "Deep Hibernation", branch: "wanderer", x: 5, y: 2, max: 1, cost: 50, growth: 1, requires: ["offline1"],
      text: () => "While you're away, fish at 100% pace for up to 72 hours.", apply: m => { m.offlineEff += 0.5; m.offlineCapH += 48; } },
    { id: "frenzy", icon: "🥤", name: "Bottomless Cocoa", branch: "wanderer", x: 6, y: 2, max: 1, cost: 120, growth: 1, requires: ["offline1"],
      text: () => "Golden fish effects last twice as long.", apply: m => { m.goldenDur *= 2; } },
    { id: "treasure", icon: "🗝️", name: "Treasure Keys", branch: "wanderer", x: 4, y: 3, max: 5, cost: 40, growth: 1.8, requires: ["golden"],
      text: L => `Lucky Catches +${50 * lvl(L)}%.`, apply: (m, L) => { m.luckyMult *= 1 + 0.5 * L; } },
    { id: "dreams", icon: "🌜", name: "Dream Fishing", branch: "wanderer", x: 5, y: 3, max: 2, cost: 150, growth: 2, requires: ["offline2"],
      text: L => `While you're away, fish at ${100 + 25 * lvl(L)}% pace.`, apply: (m, L) => { m.offlineEff += 0.25 * L; } },
    { id: "rush", icon: "⏩", name: "Rush Hour", branch: "wanderer", x: 6, y: 3, max: 4, cost: 60, growth: 2, requires: ["frenzy"],
      text: L => `Cocoa Rush gives ×${7 + 2 * lvl(L)} instead of ×7.`, apply: (m, L) => { m.rushMult += 2 * L; } },
    { id: "finder", icon: "🔍", name: "Feather Finder", branch: "wanderer", x: 5, y: 4, max: 5, cost: 200, growth: 2, requiresAny: ["treasure", "dreams", "rush"],
      text: L => `Migrations earn ${10 * lvl(L)}% more feathers.`, apply: (m, L) => { m.featherGain *= 1 + 0.1 * L; } },
    { id: "wanderer", icon: "🎇", name: "Aurora Wanderer", branch: "wanderer", x: 5, y: 5, max: 1, cost: 1500, growth: 1, requires: ["finder"], capstone: true,
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
    ach(`fps_${n}`, name, `Reach ${fmt(n)} fish per second.`, () => fishPerSecond(false) >= n, icon));
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

  // =====================================================================
  // 2. State & maths
  // =====================================================================

  function defaultSettings() {
    return {
      particles: true, scientific: false,
      sound: true, volume: 0.5, ambience: false,
      shake: 0.6, reduceMotion: prefersReducedMotion, textSize: 1,
    };
  }

  function freshState() {
    return {
      fish: 0,
      runFish: 0,
      lifetimeFish: 0,
      buildings: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])),
      upgrades: [],
      achievements: [],
      feathersEarned: 0,
      feathersSpent: 0,
      heritage: {},        // heirloom id -> level
      research: {},        // workshop id -> level (reset on migration)
      migrations: 0,
      buffs: [],
      stats: { clicks: 0, clickFish: 0, goldenClicks: 0, bigCatches: 0, longestAway: 0, startedAt: Date.now(), runStartedAt: Date.now() },
      settings: defaultSettings(),
      lastTick: Date.now(),
    };
  }

  S = freshState();
  let M = null;
  let buyAmount = 1;

  const has = id => S.upgrades.includes(id);
  const milestonesReached = n => MILESTONES.filter(x => n >= x).length;

  // Heirloom Tree helpers
  const nodeLevel = id => (id === "spirit" ? 1 : S.heritage[id] || 0);
  const nodeCost = (n, L) => Math.round(n.cost * Math.pow(n.growth, L));   // cost of going from level L to L+1
  const spendableFeathers = () => Math.max(0, S.feathersEarned - S.feathersSpent);
  const nodeReqsMet = n => (!n.requires || n.requires.every(r => nodeLevel(r) > 0)) &&
                           (!n.requiresAny || n.requiresAny.some(r => nodeLevel(r) > 0));
  function feathersSpentOn(heritage) {
    let total = 0;
    TREE.forEach(n => { for (let l = 0; l < (heritage[n.id] || 0); l++) total += nodeCost(n, l); });
    return total;
  }

  // Workshop helpers
  const researchLevel = id => S.research[id] || 0;
  const researchCost = (r, L) => r.cost * Math.pow(r.growth, L);
  const researchUnlocked = r => S.runFish >= r.unlockAt || researchLevel(r.id) > 0;

  // Every bonus in the game is folded into one modifier object, M, whenever something changes
  function recompute() {
    const m = {
      building: Object.fromEntries(BUILDINGS.map(b => [b.id, 1])),
      click: 1, clickFps: 0, global: 1, goldenFreq: 1, goldenDur: 1,
      luckyMult: 1, rushMult: 7, critChance: 0, critMult: 10, costMult: 1,
      offlineEff: 0.25, offlineCapH: 24, autoRate: 0, achBonus: ACH_BONUS, featherPer: FEATHER_BONUS,
      milestoneMult: 2, synergy: 1, featherGain: 1, keepTiers: 0, startFish: 0, aurora: false,
      start: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])),
    };
    TREE.forEach(n => { const L = nodeLevel(n.id); if (L > 0) n.apply(m, L, S); });
    RESEARCH.forEach(r => { const L = researchLevel(r.id); if (L > 0) r.apply(m, L, S); });
    S.upgrades.forEach(id => UP_BY_ID[id] && UP_BY_ID[id].apply(m, S));   // after research: synergies read m.synergy
    BUILDINGS.forEach(b => { m.building[b.id] *= Math.pow(m.milestoneMult, milestonesReached(S.buildings[b.id])); });
    m.critChance = Math.min(0.5, m.critChance);
    m.offlineEff = Math.min(1.5, m.offlineEff);
    m.feather = 1 + S.feathersEarned * m.featherPer;
    m.ach = 1 + S.achievements.length * m.achBonus;
    M = m;
  }

  function buffMult(type) {
    const now = Date.now();
    return S.buffs.filter(b => b.type === type && b.until > now).reduce((a, b) => a * b.mult, 1);
  }
  const buildingFps = id => B_BY_ID[id].baseFps * M.building[id] * M.global * M.feather * M.ach;

  function fishPerSecond(withBuffs = true) {
    let total = 0;
    BUILDINGS.forEach(b => { total += S.buildings[b.id] * buildingFps(b.id); });
    return withBuffs ? total * buffMult("prod") : total;
  }

  const clickPower = () => (M.click + fishPerSecond() * M.clickFps) * M.feather * buffMult("click");

  const costMult = () => M.costMult;
  function costOf(b, owned, n) {
    const first = b.baseCost * Math.pow(COST_GROWTH, owned) * costMult();
    return first * (Math.pow(COST_GROWTH, n) - 1) / (COST_GROWTH - 1);
  }
  function maxAffordable(b) {
    const first = b.baseCost * Math.pow(COST_GROWTH, S.buildings[b.id]) * costMult();
    return Math.max(0, Math.floor(Math.log(S.fish * (COST_GROWTH - 1) / first + 1) / Math.log(COST_GROWTH)));
  }
  const buyCount = b => (buyAmount === "max" ? Math.max(1, maxAffordable(b)) : buyAmount);

  const featherTotalFor = lifetime => Math.floor(Math.sqrt(lifetime / FEATHER_SCALE) * M.featherGain);
  const pendingFeathers = () => Math.max(0, featherTotalFor(S.lifetimeFish) - S.feathersEarned);

  // ---------- Tiny event bus: gameplay emits, UI and feedback listen ----------
  const bus = {
    handlers: {},
    on(evt, fn) { (this.handlers[evt] = this.handlers[evt] || []).push(fn); },
    emit(evt, data) { (this.handlers[evt] || []).forEach(fn => fn(data)); },
  };

  // =====================================================================
  // 3. Actions
  // =====================================================================

  function gain(n) { S.fish += n; S.runFish += n; S.lifetimeFish += n; }

  function clickPenguin(pos, auto = false) {
    let p = clickPower();
    const crit = Math.random() < M.critChance;   // Big Catch
    if (crit) { p *= M.critMult; S.stats.bigCatches++; }
    gain(p);
    if (auto) return;
    S.stats.clicks++;
    S.stats.clickFish += p;
    bus.emit("click", { amount: p, x: pos.x, y: pos.y, crit });
  }

  function buyBuilding(id, origin) {
    const b = B_BY_ID[id];
    const n = buyCount(b);
    const cost = costOf(b, S.buildings[id], n);
    if (S.fish < cost) return;
    const before = milestonesReached(S.buildings[id]);
    S.fish -= cost;
    S.buildings[id] += n;
    const gained = milestonesReached(S.buildings[id]) - before;
    recompute();
    bus.emit("structure");
    bus.emit("buyBuilding", { id, origin });
    if (gained > 0) bus.emit("milestone", { b, mult: Math.pow(M.milestoneMult, gained), origin });
  }

  function buyUpgrade(id, origin) {
    const u = UP_BY_ID[id];
    if (!u || has(id) || S.fish < u.cost) return;
    S.fish -= u.cost;
    S.upgrades.push(id);
    recompute();
    bus.emit("structure");
    bus.emit("buyUpgrade", { u, origin });
  }

  function buyResearch(id, origin) {
    const r = R_BY_ID[id], L = researchLevel(id);
    if (!r || L >= r.max || !researchUnlocked(r)) return;
    const cost = researchCost(r, L);
    if (S.fish < cost) return;
    S.fish -= cost;
    S.research[id] = L + 1;
    recompute();
    bus.emit("structure");
    bus.emit("buyResearch", { r, level: L + 1, origin });
  }

  function learnNode(id, origin) {
    const n = H_BY_ID[id], L = nodeLevel(id);
    if (!n || id === "spirit" || L >= n.max || !nodeReqsMet(n)) return;
    const cost = nodeCost(n, L);
    if (spendableFeathers() < cost) return;
    S.feathersSpent += cost;
    S.heritage[id] = L + 1;
    recompute();
    bus.emit("structure");
    bus.emit("learnNode", { n, level: L + 1, origin });
  }

  function respec() {
    if (S.feathersSpent <= 0) return;
    openModal({
      title: "Refund your heirlooms?",
      body: `<p>Every feather spent in the Heirloom Tree (🪶 ${fmt(S.feathersSpent)}) comes back to you, so you can choose a different path.</p>
             <p class="muted">Your production bonus from feathers stays the same. It's free, and you can do it any time.</p>`,
      actions: [
        { label: "Keep my tree", cancel: true },
        { label: "Refund feathers", primary: true, onClick: () => {
          S.heritage = {};
          S.feathersSpent = 0;
          recompute();
          bus.emit("structure");
          bus.emit("respec");
          save();
        } },
      ],
    });
  }

  function migrate() {
    const gainF = pendingFeathers();
    if (gainF < 1) return;
    openModal({
      title: "Set off on the Great Migration?",
      body: `<p>The colony will pack up and waddle to fresh ice, earning <b>🪶 ${fmt(gainF)}</b> Emperor Feathers
             (+${fmt(gainF * M.featherPer * 100)}% production, forever), plus feathers to spend in the Heirloom Tree.</p>
             <p>Your fish, colony, upgrades and Workshop research stay behind.</p>`,
      actions: [
        { label: "Not yet", cancel: true },
        { label: "Let's go!", primary: true, onClick: () => {
          S.feathersEarned += gainF;
          S.migrations++;
          const keep = S.upgrades.filter(id => {
            const [b, t] = id.split("_");
            return B_BY_ID[b] && Number(t) < M.keepTiers;
          });
          S.fish = M.startFish;
          S.runFish = 0;
          S.buildings = { ...M.start };
          S.upgrades = keep;
          S.research = {};
          S.buffs = [];
          S.stats.runStartedAt = Date.now();
          recompute();
          bus.emit("structure");
          bus.emit("migrate", { feathers: S.feathersEarned });
          save();
        } },
      ],
    });
  }

  // ---------- Golden fish ----------
  let nextGolden = Date.now() + randBetween(60, 150) * 1000;
  const scheduleGolden = () => { nextGolden = Date.now() + randBetween(90, 240) * 1000 / M.goldenFreq; };

  function spawnGolden() {
    const el = document.createElement("button");
    el.className = "golden-fish";
    el.textContent = "🐟";
    el.setAttribute("aria-label", "Golden fish! Catch it");
    const dur = Math.min(30, 12 * M.goldenDur);   // how long the fish stays on screen
    el.style.animationDuration = `${dur}s, .7s`;
    el.style.left = `${randBetween(5, 85)}vw`;
    el.style.top = `${randBetween(15, 80)}vh`;
    el.addEventListener("click", e => { el.remove(); goldenEffect(pointFrom(e, el)); });
    $("goldenLayer").appendChild(el);
    setTimeout(() => el.remove(), dur * 1000);
    bus.emit("goldenSpawn");
    scheduleGolden();
  }

  function goldenEffect(pos) {
    S.stats.goldenClicks++;
    const d = M.goldenDur;   // effect-duration multiplier
    const secs = base => Math.round(base * d);
    const roll = Math.random();
    let msg;
    if (M.aurora && roll < 0.08) {
      S.buffs.push({ type: "prod", name: "Aurora Blessing", mult: 50, until: Date.now() + secs(30) * 1000 });
      msg = `<b>Aurora Blessing!</b> The sky lights up: production ×50 for ${secs(30)}s`;
    } else if (roll < 0.45) {
      const amount = (Math.min(S.fish * 0.15, fishPerSecond(false) * 900) + 13) * M.luckyMult;
      gain(amount);
      msg = `<b>Lucky Catch!</b> +${fmt(amount)} fish`;
    } else if (roll < 0.85) {
      S.buffs.push({ type: "prod", name: "Cocoa Rush", mult: M.rushMult, until: Date.now() + secs(77) * 1000 });
      msg = `<b>Cocoa Rush!</b> Everyone's warmed up: production ×${M.rushMult} for ${secs(77)}s`;
    } else {
      S.buffs.push({ type: "click", name: "Flipper Flurry", mult: 777, until: Date.now() + secs(13) * 1000 });
      msg = `<b>Flipper Flurry!</b> Pats are ×777 for ${secs(13)}s`;
    }
    bus.emit("golden", { msg, ...pos });
    bus.emit("buffs");
  }

  function checkAchievements() {
    const fresh = ACHIEVEMENTS.filter(a => !S.achievements.includes(a.id) && a.check(S));
    if (!fresh.length) return;
    fresh.forEach(a => S.achievements.push(a.id));
    recompute();
    bus.emit("structure");
    fresh.forEach(a => bus.emit("achievement", a));
  }

  // =====================================================================
  // 4. Feedback (game feel)
  //    Every event maps to a tier so juice stays proportional:
  //      small  — pats, colony purchases          (sound, number pop, a few bits)
  //      medium — upgrades, milestones, heirlooms (chime, sparkle burst, a light shake)
  //      large  — golden fish, migration          (fanfare, big burst, glow ring, stronger shake)
  //    Juice is always brief and returns to rest. No white flashes (photosensitivity).
  // =====================================================================

  const TIERS = {
    small:  { bits: 2,  trauma: 0,    ring: false },
    medium: { bits: 8,  trauma: 0.22, ring: false },
    large:  { bits: 22, trauma: 0.5,  ring: true },
  };
  const motionOK = () => !S.settings.reduceMotion;

  const Shake = {
    trauma: 0, t: 0, running: false, last: 0,
    add(amount) {
      if (!motionOK() || S.settings.shake <= 0 || amount <= 0) return;
      this.trauma = Math.min(1, this.trauma + amount);   // hits add; they don't reset
      if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(ts => this.step(ts)); }
    },
    step(ts) {
      const dt = Math.min(0.05, (ts - this.last) / 1000);
      this.last = ts;
      this.trauma = Math.max(0, this.trauma - 1.4 * dt);  // linear decay, so it always ends
      const layout = $("layout");
      if (this.trauma <= 0 || !motionOK()) { layout.style.transform = ""; this.running = false; this.trauma = 0; return; }
      this.t += dt * 30;
      const s = this.trauma * this.trauma * S.settings.shake;   // quadratic: soft at low trauma
      // Layered sines, not random jitter, so it reads as a sway rather than a buzz. Moves the visual only.
      const ox = 7 * s * (0.6 * Math.sin(this.t * 1.7) + 0.4 * Math.sin(this.t * 3.1));
      const oy = 5 * s * (0.6 * Math.sin(this.t * 2.3 + 1) + 0.4 * Math.sin(this.t * 4.3));
      const rot = 0.4 * s * Math.sin(this.t * 1.1);
      layout.style.transform = `translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px) rotate(${rot.toFixed(3)}deg)`;
      requestAnimationFrame(t2 => this.step(t2));
    },
  };

  // Pooled particle elements: reused instead of created and thrown away on every pat
  const particlePool = [];
  function spawnParticle(cls, text, x, y, vars, life) {
    const el = particlePool.pop() || document.createElement("div");
    el.className = `particle ${cls}`;
    el.textContent = text;
    el.style.setProperty("--x", `${x}px`);
    el.style.setProperty("--y", `${y}px`);
    Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
    $("fxLayer").appendChild(el);
    setTimeout(() => { el.remove(); if (particlePool.length < 80) particlePool.push(el); }, life);
  }

  function numberPop(text, x, y, extra = "") {
    if (!S.settings.particles) return;
    spawnParticle(`num ${extra}`, text, x - 12, y - 24, { "--dx": `${randBetween(-30, 30)}px` }, 1000);
  }

  function burst(x, y, count, chars) {
    if (!S.settings.particles || !motionOK() || !count) return;
    for (let i = 0; i < count; i++) {
      const a = randBetween(0, Math.PI * 2), d = randBetween(40, 110);
      spawnParticle("bit", chars[i % chars.length], x - 8, y - 8, {
        "--dx": `${Math.cos(a) * d}px`, "--dy": `${Math.sin(a) * d - 20}px`, "--rot": `${randBetween(-180, 180)}deg`,
      }, 800);
    }
  }

  function glowRing(x, y) {
    if (!motionOK()) return;
    const el = document.createElement("div");
    el.className = "glow-ring";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    $("fxLayer").appendChild(el);
    setTimeout(() => el.remove(), 750);
  }

  function feedback(tier, pos, { sound, chars = ["✨", "❄️", "💛"] } = {}) {
    const t = TIERS[tier];
    if (sound) Sound.play(sound);
    if (pos) {
      burst(pos.x, pos.y, t.bits, chars);
      if (t.ring) glowRing(pos.x, pos.y);
    }
    Shake.add(t.trauma);
  }

  // ---------- Soft synthesized sounds (Web Audio, no files) ----------
  const Sound = {
    ctx: null, master: null, amb: null, noise: null, lastPop: 0,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      }
      this.master.gain.value = S.settings.volume;
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    },
    tone(freq, when, dur, type = "sine", vol = 0.12) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g).connect(this.master);
      o.start(when);
      o.stop(when + dur + 0.05);
    },
    play(name) {
      if (!S.settings.sound || S.settings.volume <= 0) return;
      const c = this.ensure();
      if (!c) return;
      const t = c.currentTime + 0.01;
      const P = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51]; // pentatonic-ish, always consonant
      switch (name) {
        case "pop": {
          const now = performance.now();
          if (now - this.lastPop < 70) return;   // fast clicking shouldn't become a drone
          this.lastPop = now;
          this.tone(P[Math.floor(Math.random() * 5)], t, 0.14, "sine", 0.1);
          break;
        }
        case "buy":     this.tone(659.25, t, 0.12, "triangle", 0.08); this.tone(987.77, t + 0.06, 0.2, "triangle", 0.07); break;
        case "chime":   [P[0], P[2], P[4]].forEach((f, i) => this.tone(f, t + i * 0.07, 0.4, "triangle", 0.08)); break;
        case "memory":  [P[5], P[7], P[6]].forEach((f, i) => this.tone(f, t + i * 0.11, 0.6, "sine", 0.07)); break;
        case "sparkle": [P[4], P[6], P[7]].forEach((f, i) => this.tone(f, t + i * 0.05, 0.3, "sine", 0.05)); break;
        case "fanfare": [P[0], P[2], P[3], P[5], P[7]].forEach((f, i) => this.tone(f, t + i * 0.08, 0.7, "sine", 0.09)); this.tone(261.63, t, 1.2, "triangle", 0.05); break;
        case "migrate": [261.63, 329.63, 392, 523.25].forEach((f, i) => this.tone(f, t + i * 0.16, 1.8, "sine", 0.07)); break;
        case "tick":    this.tone(880, t, 0.08, "sine", 0.05); break;
      }
    },
    setVolume() { if (this.master) this.master.gain.value = S.settings.volume; },
    noiseBuffer(seconds, brown) {
      const c = this.ctx, len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      return buf;
    },
    crackle(when) {
      const c = this.ctx;
      if (!this.noise) this.noise = this.noiseBuffer(0.05, false);
      const src = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noise;
      hp.type = "highpass"; hp.frequency.value = 1500 + Math.random() * 2000;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.06, when + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
      src.connect(hp).connect(g).connect(this.master);
      src.start(when);
      src.stop(when + 0.06);
    },
    setAmbience(on) {
      if (on && !this.amb) {
        const c = this.ensure();
        if (!c) return;
        const src = c.createBufferSource();
        src.buffer = this.noiseBuffer(4, true);
        src.loop = true;
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 450;
        const g = c.createGain(); g.gain.value = 0.22;
        const lfo = c.createOscillator(), lfoG = c.createGain();   // slow swell, like wind outside
        lfo.frequency.value = 0.07; lfoG.gain.value = 0.1;
        lfo.connect(lfoG).connect(g.gain);
        src.connect(lp).connect(g).connect(this.master);
        src.start(); lfo.start();
        const timer = setInterval(() => {
          if (document.hidden || c.state !== "running") return;
          const n = Math.random() < 0.5 ? 1 : 2 + Math.floor(Math.random() * 3);
          for (let k = 0; k < n; k++) this.crackle(c.currentTime + Math.random() * 0.35);
        }, 420);
        this.amb = { src, lfo, g, timer };
      } else if (!on && this.amb) {
        this.amb.src.stop(); this.amb.lfo.stop(); this.amb.g.disconnect(); clearInterval(this.amb.timer);
        this.amb = null;
      }
    },
  };

  // Feedback wiring: one place that decides which tier each event gets
  bus.on("click", d => {
    if (d.crit) {   // Big Catch: a step up from a normal pat, still short of a golden fish
      Sound.play("sparkle");
      numberPop(`Big Catch! +${fmt(d.amount)}`, d.x, d.y, "crit");
      burst(d.x, d.y, 5, ["🐟", "🐡", "✨"]);
    } else {
      Sound.play("pop");
      numberPop(`+${fmt(d.amount)}`, d.x, d.y);
      if (Math.random() < 0.35) burst(d.x, d.y, 1, ["🐟"]);
    }
    const peng = $("bigPenguin");
    peng.classList.remove("pop"); void peng.offsetWidth; peng.classList.add("pop");
  });
  bus.on("buyBuilding", d => {
    Sound.play("buy");
    const row = els[d.id] && els[d.id].root;
    if (row) { row.classList.remove("pop"); void row.offsetWidth; row.classList.add("pop"); }
  });
  bus.on("milestone", d => {
    feedback("medium", d.origin, { sound: "chime", chars: [d.b.icon, "✨", "💛"] });
    toast(`<b>Milestone!</b> ${d.b.plural} now catch ${d.mult === 2 ? "twice" : `${+d.mult.toFixed(2)}×`} as many fish.`);
  });
  bus.on("buyUpgrade", d => feedback("medium", d.origin, { sound: "sparkle", chars: [d.u.icon, "✨"] }));
  bus.on("buyResearch", d => {
    Sound.play("buy");
    burst(d.origin.x, d.origin.y, 3, [d.r.icon, "✨"]);
    const row = $("research").querySelector(`[data-id="${d.r.id}"]`);
    if (row) { row.classList.remove("pop"); void row.offsetWidth; row.classList.add("pop"); }
  });
  bus.on("learnNode", d => {
    feedback(d.n.capstone ? "large" : "medium", d.origin, { sound: d.n.capstone ? "fanfare" : "chime", chars: [d.n.icon, "🪶", "✨"] });
    const node = $("tree").querySelector(`[data-id="${d.n.id}"]`);
    if (node) { node.classList.remove("pop"); void node.offsetWidth; node.classList.add("pop"); }
  });
  bus.on("respec", () => { Sound.play("chime"); toast("🪶 <b>Feathers refunded.</b> Plant your tree however you like."); });
  bus.on("golden", d => { feedback("large", d, { sound: "fanfare", chars: ["🐟", "✨", "💛", "⭐"] }); toast(d.msg); });
  bus.on("achievement", a => { Sound.play("memory"); toast(`${a.icon} <b>${a.name}</b><br>${a.desc}`); });
  bus.on("migrate", d => {
    feedback("large", { x: innerWidth / 2, y: innerHeight / 2 }, { sound: "migrate", chars: ["🐧", "❄️", "🪶"] });
    toast(`<b>Welcome to your new home!</b> The colony settles in with 🪶 ${fmt(d.feathers)} feathers.`);
  });

  // =====================================================================
  // 5. Save / load / migration
  // =====================================================================

  // Each entry upgrades a save from version N to N+1. Never delete one: old saves walk the whole chain.
  const MIGRATIONS = {
    0: d => d,  // saves made before versioning already have the v1 shape
    1: d => {   // v2: added sound, ambience, shake, reduce-motion and text-size settings
      d.settings = Object.assign(defaultSettings(), d.settings || {});
      return d;
    },
    2: d => {   // v3: heirlooms became a levelled skill tree (list of ids -> {id: level}); added the Workshop
      const h = d.heritage;
      d.heritage = Array.isArray(h) ? Object.fromEntries(h.map(id => [id, 1])) : (h && typeof h === "object" ? h : {});
      d.research = d.research && typeof d.research === "object" ? d.research : {};
      return d;
    },
  };

  class SaveError extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }
  }

  let savingBlocked = false;   // set when the stored save is from a newer game version, so we never clobber it

  function save() {
    if (savingBlocked) return;
    try {
      S.lastTick = Date.now();
      const prev = localStorage.getItem(SAVE_KEY);
      if (prev) localStorage.setItem(SAVE_KEY + "_bak", prev);   // keep the last good save
      localStorage.setItem(SAVE_KEY, encodeSave());
    } catch (e) { /* storage unavailable (private mode, quota) */ }
  }

  function hash(str) {   // FNV-1a: detects truncated or edited save text (not anti-cheat)
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }

  function encodeSave() {
    const { buffs, ...data } = S;   // buffs are short-lived; don't persist them
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify({ ...data, version: SAVE_VERSION }))));
    return `${b64}.${hash(b64)}`;
  }

  function decodeSave(str) {
    str = String(str || "").trim();
    if (!str) throw new SaveError("empty", "There's no save text.");
    let b64 = str;
    const dot = str.lastIndexOf(".");
    if (dot > 0) {   // v1 saves have no checksum, so it's optional
      b64 = str.slice(0, dot);
      if (hash(b64) !== str.slice(dot + 1)) throw new SaveError("corrupt", "This save text is incomplete or has been changed.");
    }
    let data;
    try { data = JSON.parse(decodeURIComponent(escape(atob(b64)))); }
    catch (e) { throw new SaveError("corrupt", "This save text couldn't be read."); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new SaveError("corrupt", "This save text couldn't be read.");
    return validate(migrateSave(data));
  }

  function migrateSave(d) {
    let v = Number.isInteger(d.version) ? d.version : 0;
    if (v > SAVE_VERSION) {
      throw new SaveError("newer", `This save is from a newer version of Penguin Idle (save v${v}, this page v${SAVE_VERSION}). Refresh the page to get the latest version.`);
    }
    while (v < SAVE_VERSION) { d = MIGRATIONS[v](d); v++; d.version = v; }
    return d;
  }

  const num = v => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0);
  const idList = (v, table) => [...new Set(Array.isArray(v) ? v : [])].filter(id => table[id]);

  // Rebuild a clean state from plain data, checking every field rather than trusting the file
  function validate(data) {
    const s = freshState();
    ["fish", "runFish", "lifetimeFish", "feathersEarned", "feathersSpent", "migrations"].forEach(k => { s[k] = num(data[k]); });
    BUILDINGS.forEach(b => { s.buildings[b.id] = Math.floor(num(data.buildings && data.buildings[b.id])); });
    s.upgrades = idList(data.upgrades, UP_BY_ID);
    const levels = (v, list) => {   // {id: level} limited to known ids and each one's max level
      const out = {}, src = v && typeof v === "object" && !Array.isArray(v) ? v : {};
      list.forEach(x => { const L = Math.min(x.max, Math.floor(num(src[x.id]))); if (L > 0 && x.id !== "spirit") out[x.id] = L; });
      return out;
    };
    s.heritage = levels(data.heritage, TREE);
    s.research = levels(data.research, RESEARCH);
    s.feathersSpent = feathersSpentOn(s.heritage);   // derived from what's owned, not trusted from the file
    const achIds = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, true]));
    s.achievements = idList(data.achievements, achIds);
    const st = data.stats || {};
    Object.keys(s.stats).forEach(k => { if (num(st[k]) > 0) s.stats[k] = num(st[k]); });
    const ds = defaultSettings(), inSet = data.settings || {};
    Object.keys(ds).forEach(k => { if (typeof inSet[k] === typeof ds[k]) s.settings[k] = inSet[k]; });
    s.settings.volume = Math.min(1, Math.max(0, s.settings.volume));
    s.settings.shake = Math.min(1, Math.max(0, s.settings.shake));
    if (!TEXT_SIZES.includes(s.settings.textSize)) s.settings.textSize = 1;
    s.lastTick = num(data.lastTick) || Date.now();
    return s;
  }

  // Returns a message to show the player if anything went wrong (fail loudly, never silently)
  function load() {
    let raw = null, bak = null;
    try { raw = localStorage.getItem(SAVE_KEY); bak = localStorage.getItem(SAVE_KEY + "_bak"); } catch (e) { /* ignore */ }
    if (!raw && !bak) return null;
    try {
      S = decodeSave(raw);
      return null;
    } catch (e) {
      if (e.kind === "newer") {
        savingBlocked = true;
        return { title: "This save is from a newer version", body: `<p>${e.message}</p><p class="muted">Nothing will be saved until you refresh, so your progress is safe.</p>` };
      }
      try {
        S = decodeSave(bak);
        return { title: "We restored your backup", body: "<p>Your latest save couldn't be read, so we loaded the backup from a few moments earlier.</p>" };
      } catch (e2) {
        try { localStorage.setItem(SAVE_KEY + "_corrupt", raw || bak); } catch (e3) { /* ignore */ }
        S = freshState();
        return { title: "Your save couldn't be loaded", body: `<p>Sorry! Your save and its backup were both unreadable, so you're starting a fresh colony.</p>
          <p class="muted">A copy of the damaged save was kept in this browser's storage under <code>${SAVE_KEY}_corrupt</code>.</p>` };
      }
    }
  }

  function applyOffline() {
    const away = (Date.now() - S.lastTick) / 1000;
    if (away < 60) return null;
    S.stats.longestAway = Math.max(S.stats.longestAway, away);
    const cap = M.offlineCapH * 3600;
    const eff = M.offlineEff;
    const earned = fishPerSecond(false) * Math.min(away, cap) * eff;
    S.lastTick = Date.now();
    if (earned <= 0) return null;
    gain(earned);
    return {
      title: "Welcome home!",
      body: `<p>You were away for <b>${fmtTime(away)}</b>. The colony kept the fire going and fished at ${Math.round(eff * 100)}% pace,
             catching <b>🐟 ${fmt(earned)}</b>.</p>
             ${away > cap ? `<p class="muted">Time away counts for up to ${cap / 3600} hours.</p>` : ""}`,
    };
  }

  // =====================================================================
  // 6. UI
  // =====================================================================

  const $ = id => document.getElementById(id);
  const els = {};
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  const pointFrom = (e, el) => {
    if (e && e.clientX) return { x: e.clientX, y: e.clientY };   // pointer click
    const r = el.getBoundingClientRect();                         // keyboard activation: use the element's centre
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // ---------- Modal stack: top modal owns focus; everything behind is inert ----------
  const modals = [];
  function openModal({ title, body, actions, dismissable = true, danger = false }) {
    const entry = { prevFocus: document.activeElement, dismissable };
    const wrap = document.createElement("div");
    wrap.className = "modal";
    const id = `modal-${Math.random().toString(36).slice(2, 8)}`;
    wrap.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <h2 id="${id}"></h2><div class="modal-body"></div><div class="row end"></div></div>`;
    wrap.querySelector("h2").textContent = title;
    wrap.querySelector(".modal-body").innerHTML = body;
    const row = wrap.querySelector(".row");
    let focusTarget = null;
    actions.forEach(a => {
      const b = document.createElement("button");
      b.className = `btn${a.primary ? " primary" : ""}${a.danger ? " danger" : ""}`;
      b.textContent = a.label;
      b.addEventListener("click", () => { closeModal(entry); a.onClick && a.onClick(); });
      row.appendChild(b);
      // Destructive dialogs focus the safe choice; others focus the main action
      if ((danger && a.cancel) || (!danger && a.primary) || !focusTarget) focusTarget = b;
    });
    entry.wrap = wrap;
    entry.cancel = () => { closeModal(entry); const c = actions.find(a => a.cancel); c && c.onClick && c.onClick(); };
    wrap.addEventListener("click", e => { if (e.target === wrap && entry.dismissable) entry.cancel(); });
    modals.push(entry);
    $("modalRoot").appendChild(wrap);
    syncInert();
    focusTarget && focusTarget.focus();
    hideTooltip();
  }

  function closeModal(entry) {
    const i = modals.indexOf(entry);
    if (i < 0) return;
    modals.splice(i, 1);
    entry.wrap.remove();
    syncInert();
    const top = modals[modals.length - 1];
    const back = top ? top.wrap.querySelector(".btn") : entry.prevFocus;
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  }

  function syncInert() {
    const any = modals.length > 0;
    ["topbar", "layout", "goldenLayer"].forEach(id => { $(id).inert = any; });
    modals.forEach((m, i) => { m.wrap.inert = i !== modals.length - 1; });
  }

  document.addEventListener("keydown", e => {
    const top = modals[modals.length - 1];
    if (!top) return;
    if (e.key === "Escape" && top.dismissable) { e.preventDefault(); top.cancel(); return; }
    if (e.key === "Tab") {   // trap focus inside the dialog
      const f = [...top.wrap.querySelectorAll("button, [href], input, select, textarea")].filter(x => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ---------- Toasts ----------
  function toast(html) {
    const box = $("toasts");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = html;
    box.appendChild(el);
    const dismiss = () => { el.classList.add("out"); setTimeout(() => el.remove(), 350); };
    setTimeout(dismiss, 4500);
    while (box.children.length > 4) box.firstChild.remove();
  }

  // ---------- Tooltips (mouse hover and keyboard focus) ----------
  let tooltipFn = null;
  function attachTooltip(el, fn) {
    el.addEventListener("mouseenter", e => showTooltip(fn, e.clientX, e.clientY));
    el.addEventListener("mouseleave", hideTooltip);
    el.addEventListener("focus", () => {
      if (!el.matches(":focus-visible")) return;
      const r = el.getBoundingClientRect();
      showTooltip(fn, r.right, r.top);
    });
    el.addEventListener("blur", hideTooltip);
  }
  function showTooltip(fn, x, y) {
    if (window.matchMedia("(hover: none)").matches && !document.activeElement.matches(":focus-visible")) return;
    tooltipFn = fn;
    const t = $("tooltip");
    t.innerHTML = fn();
    t.classList.remove("hidden");
    positionTooltip(x, y);
  }
  function positionTooltip(cx, cy) {
    const t = $("tooltip"), r = t.getBoundingClientRect();
    let x = cx + 16, y = cy + 16;
    if (x + r.width > innerWidth - 8) x = cx - r.width - 16;
    if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    t.style.left = `${Math.max(8, x)}px`;
    t.style.top = `${Math.max(8, y)}px`;
  }
  function hideTooltip() { tooltipFn = null; $("tooltip").classList.add("hidden"); }
  document.addEventListener("mousemove", e => { if (tooltipFn) { $("tooltip").innerHTML = tooltipFn(); positionTooltip(e.clientX, e.clientY); } });

  // ---------- Colony list ----------
  function buildBuildingList() {
    const list = $("buildings");
    list.innerHTML = "";
    BUILDINGS.forEach(b => {
      const el = document.createElement("button");
      el.className = "building";
      el.innerHTML = `
        <div class="icon" aria-hidden="true">${b.icon}</div>
        <div>
          <div class="name">${b.name}</div>
          <div class="desc"><span class="b-cost cost"></span> · <span class="b-fps"></span></div>
          <div class="milestone-bar" aria-hidden="true"><div></div></div>
        </div>
        <div class="owned" aria-hidden="true">0</div>`;
      el.addEventListener("click", e => buyBuilding(b.id, pointFrom(e, el)));
      attachTooltip(el, () => buildingTooltip(b));
      list.appendChild(el);
      els[b.id] = {
        root: el, cost: el.querySelector(".b-cost"), fps: el.querySelector(".b-fps"),
        owned: el.querySelector(".owned"), bar: el.querySelector(".milestone-bar > div"),
      };
    });
  }

  function buildingTooltip(b) {
    const n = S.buildings[b.id];
    const next = MILESTONES.find(x => x > n);
    const each = buildingFps(b.id) * buffMult("prod");
    return `<div class="t-name">${b.icon} ${b.name}</div><div>${b.desc}</div><hr>
      <div>Each catches <b>${fmt(each)}</b>/s</div>
      <div>${fmt(n)} owned catch <b>${fmt(each * n)}</b>/s</div>
      ${next ? `<div class="t-cost">At ${next} owned: output ×2</div>` : ""}`;
  }

  // Event-driven: owned counts, rates and milestone bars change only on purchases, buffs and resets
  function refreshBuildings() {
    BUILDINGS.forEach(b => {
      const e = els[b.id], owned = S.buildings[b.id];
      setText(e.owned, String(owned));
      setText(e.fps, `${fmt(buildingFps(b.id) * buffMult("prod"))}/s each`);
      const prev = [0, ...MILESTONES].filter(x => x <= owned).pop();
      const next = MILESTONES.find(x => x > owned);
      e.bar.style.width = next ? `${((owned - prev) / (next - prev)) * 100}%` : "100%";
    });
  }

  // Ticker: costs and affordability depend on the fish count, which changes continuously
  function tickBuildings() {
    let revealNext = true;
    BUILDINGS.forEach((b, i) => {
      const e = els[b.id], owned = S.buildings[b.id];
      const visible = owned > 0 || i === 0 || S.buildings[BUILDINGS[i - 1].id] > 0 || S.runFish >= b.baseCost * 0.5;
      e.root.classList.toggle("hidden", !visible && !revealNext);
      e.root.classList.toggle("locked", !visible);
      e.root.disabled = !visible;
      if (!visible) revealNext = false;
      const n = buyCount(b);
      const cost = costOf(b, owned, n);
      setText(e.cost, `${n > 1 ? `${n}× ` : ""}🐟 ${fmt(cost)}`);
      const can = S.fish >= cost;
      e.root.classList.toggle("affordable", can);
      e.root.setAttribute("aria-label", visible
        ? `Buy ${n} ${n > 1 ? b.plural : b.name} for ${fmt(cost)} fish${can ? "" : " (not enough fish)"}. You own ${owned}.`
        : "Undiscovered colony member");
    });
  }

  // ---------- Upgrades ----------
  function upgradeSubtitle(u) {
    if (u.kind === "building") return `${B_BY_ID[u.building].icon} ${B_BY_ID[u.building].name} · Tier ${TIER_NUMERALS[u.tier]}`;
    if (u.kind === "synergy") return u.pair.map(id => `${B_BY_ID[id].icon} ${B_BY_ID[id].name}`).join(" + ") + " synergy";
    if (u.kind === "scrapbook") return `Scrapbook upgrade · ${S.achievements.length} memories collected`;
    return { click: "Patting upgrade", global: "Whole-colony upgrade", gold: "Golden fish upgrade" }[u.kind] || "";
  }

  let lastUpgradeKey = "";
  function tickUpgrades() {
    const ups = UPGRADES.filter(u => !has(u.id) && u.unlocked(S)).sort((a, b) => a.cost - b.cost);
    const key = ups.map(u => u.id).join(",");
    const grid = $("upgrades");
    if (key !== lastUpgradeKey) {
      const hadFocus = grid.contains(document.activeElement);
      lastUpgradeKey = key;
      grid.innerHTML = "";
      ups.forEach(u => {
        const el = document.createElement("button");
        el.className = `upgrade kind-${u.kind}`;
        el.dataset.id = u.id;
        el.innerHTML = `<span class="u-icon" aria-hidden="true">${u.icon}</span>` +
          (u.kind === "building" ? `<span class="u-badge tier-${u.tier}" aria-hidden="true">${TIER_NUMERALS[u.tier]}</span>` : "");
        el.setAttribute("aria-label", `${u.name}${upgradeSubtitle(u) ? `, ${upgradeSubtitle(u)}` : ""}: ${u.desc} Costs ${fmt(u.cost)} fish.`);
        el.addEventListener("click", e => buyUpgrade(u.id, pointFrom(e, el)));
        attachTooltip(el, () => `<div class="t-name">${u.icon} ${u.name}</div>
          <div class="t-sub">${upgradeSubtitle(u)}</div><div>${u.desc}</div><div class="t-cost">🐟 ${fmt(u.cost)}</div>`);
        grid.appendChild(el);
      });
      $("noUpgrades").classList.toggle("hidden", ups.length > 0);
      if (hadFocus) (grid.firstElementChild || $("buildings").querySelector(".building:not(.hidden)")).focus({ preventScroll: true });
    }
    grid.querySelectorAll(".upgrade").forEach(el => el.classList.toggle("affordable", S.fish >= UP_BY_ID[el.dataset.id].cost));
  }

  // ---------- Workshop ----------
  function buildResearch() {
    const list = $("research");
    list.innerHTML = "";
    RESEARCH.forEach(r => {
      const el = document.createElement("button");
      el.className = "research";
      el.dataset.id = r.id;
      el.innerHTML = `
        <div class="icon" aria-hidden="true">${r.icon}</div>
        <div>
          <div class="name">${r.name} <span class="r-level"></span></div>
          <div class="desc r-effect"></div>
          <div class="r-bar" aria-hidden="true"><div></div></div>
        </div>
        <div class="cost r-cost"></div>`;
      el.addEventListener("click", e => buyResearch(r.id, pointFrom(e, el)));
      list.appendChild(el);
    });
  }

  function tickResearch() {
    $("research").querySelectorAll(".research").forEach(el => {
      const r = R_BY_ID[el.dataset.id], L = researchLevel(r.id);
      const unlocked = researchUnlocked(r), maxed = L >= r.max;
      const cost = researchCost(r, L), can = unlocked && !maxed && S.fish >= cost;
      el.classList.toggle("locked", !unlocked);
      el.classList.toggle("maxed", maxed);
      el.classList.toggle("affordable", can);
      el.disabled = !unlocked || maxed;
      setText(el.querySelector(".r-level"), unlocked ? `Lv ${L}/${r.max}` : "");
      const effect = !unlocked ? `Unlocks after catching ${fmt(r.unlockAt)} fish this migration`
        : maxed ? r.text(L) : L ? `${r.text(L)} → ${r.text(L + 1)}` : `First level: ${r.text(1)}`;
      setText(el.querySelector(".r-effect"), effect);
      setText(el.querySelector(".r-cost"), !unlocked ? "🔒" : maxed ? "✔ Maxed" : `🐟 ${fmt(cost)}`);
      el.querySelector(".r-bar > div").style.width = `${(L / r.max) * 100}%`;
      el.setAttribute("aria-label", unlocked
        ? `${r.name}, level ${L} of ${r.max}. ${effect}.${maxed ? "" : ` Costs ${fmt(cost)} fish${can ? "" : " (not enough fish)"}.`}`
        : `${r.name}: ${effect}.`);
    });
  }

  // ---------- Migration & Heirloom Tree ----------
  function tickMigration() {
    const pend = pendingFeathers();
    setText($("pendingFeathers"), fmt(pend));
    const nextTotal = featherTotalFor(S.lifetimeFish) + 1;
    setText($("nextFeather"), fmt(Math.pow(nextTotal / M.featherGain, 2) * FEATHER_SCALE));
    $("migrateBtn").disabled = pend < 1;
  }

  let selectedNode = "spirit";
  function buildTree() {
    const tree = $("tree");
    tree.innerHTML = "";
    TREE.forEach(n => {
      const el = document.createElement("button");
      el.className = "node";
      el.dataset.id = n.id;
      el.style.gridColumn = String(n.x + 1);
      el.style.gridRow = String(n.y + 1);
      el.innerHTML = `<span class="n-icon" aria-hidden="true">${n.icon}</span><span class="n-level" aria-hidden="true"></span>`;
      el.addEventListener("click", () => { selectedNode = n.id; refreshTree(); });
      el.addEventListener("dblclick", e => learnNode(n.id, pointFrom(e, el)));
      tree.appendChild(el);
    });
    if (window.ResizeObserver) new ResizeObserver(() => drawTreeLines()).observe($("treeWrap"));
  }

  function nodeState(n) {
    const L = nodeLevel(n.id);
    if (L >= n.max) return "maxed";
    if (!nodeReqsMet(n)) return "locked";
    return spendableFeathers() >= nodeCost(n, L) ? "available" : "waiting";
  }

  function refreshTree() {
    $("tree").querySelectorAll(".node").forEach(el => {
      const n = H_BY_ID[el.dataset.id], L = nodeLevel(n.id), st = nodeState(n);
      el.className = `node branch-${n.branch} state-${st}${L > 0 ? " learned" : ""}${n.capstone ? " capstone" : ""}${n.id === selectedNode ? " selected" : ""}`;
      setText(el.querySelector(".n-level"), n.max > 1 ? `${L}/${n.max}` : L ? "✔" : "");
      el.setAttribute("aria-label", `${n.name}${n.capstone ? " (capstone)" : ""}, ${n.max > 1 ? `level ${L} of ${n.max}` : L ? "learned" : "not learned"}${st === "locked" ? ", locked" : st === "available" ? ", can learn" : ""}`);
      el.setAttribute("aria-current", n.id === selectedNode ? "true" : "false");
    });
    setText($("featherSpendable"), fmt(spendableFeathers()));
    $("respecBtn").disabled = S.feathersSpent <= 0;
    renderInspector();
    drawTreeLines();
  }

  function renderInspector() {
    const n = H_BY_ID[selectedNode], L = nodeLevel(n.id), maxed = L >= n.max;
    const cost = maxed ? 0 : nodeCost(n, L);
    const names = ids => ids.map(id => `${H_BY_ID[id].icon} ${H_BY_ID[id].name}`);
    const req = nodeReqsMet(n) ? "" : n.requiresAny ? `Needs any one of: ${names(n.requiresAny).join(", ")}` : `Needs: ${names(n.requires).join(" and ")}`;
    const canLearn = n.id !== "spirit" && !maxed && !req && spendableFeathers() >= cost;
    const label = n.id === "spirit" ? "Always yours" : maxed ? "✔ Fully learned" : `${L ? "Level up" : "Learn"} · 🪶 ${fmt(cost)}`;
    const html = `
      <div class="i-icon" aria-hidden="true">${n.icon}</div>
      <div class="i-body">
        <div class="name">${n.name}${n.capstone ? ' <span class="cap">Capstone</span>' : ""}</div>
        <div class="i-sub">${BRANCH_NAMES[n.branch]} · ${n.max > 1 ? `Level ${L}/${n.max}` : L ? "Learned" : "Not learned"}</div>
        ${L > 0 ? `<div><b>Now:</b> ${n.text(L)}</div>` : ""}
        ${!maxed ? `<div><b>${L ? "Next" : "Gives"}:</b> ${n.text(L + 1)}</div>` : ""}
        ${req ? `<div class="i-req">🔒 ${req}</div>` : ""}
      </div>
      <button class="btn primary" id="learnBtn"${canLearn ? "" : " disabled"}>${label}</button>`;
    const box = $("treeInspector");
    if (box.dataset.html === html) return;
    const hadFocus = document.activeElement && document.activeElement.id === "learnBtn";
    box.dataset.html = html;
    box.innerHTML = html;
    const btn = $("learnBtn");
    btn.addEventListener("click", e => learnNode(n.id, pointFrom(e, btn)));
    // Keep keyboard focus in place after levelling up; fall back to the node if the button is now disabled
    if (hadFocus) (btn.disabled ? $("tree").querySelector(`[data-id="${n.id}"]`) : btn).focus({ preventScroll: true });
  }

  function drawTreeLines() {
    const wrap = $("treeWrap"), svg = $("treeLines");
    if (!wrap.offsetParent) return;   // tab hidden; redrawn when it opens
    const wr = wrap.getBoundingClientRect();
    svg.setAttribute("width", wr.width);
    svg.setAttribute("height", wr.height);
    svg.setAttribute("viewBox", `0 0 ${wr.width} ${wr.height}`);
    const centre = id => {
      const r = $("tree").querySelector(`[data-id="${id}"]`).getBoundingClientRect();
      return [r.left - wr.left + r.width / 2, r.top - wr.top + r.height / 2];
    };
    let out = "";
    TREE.forEach(n => {
      [...(n.requires || []), ...(n.requiresAny || [])].forEach(p => {
        const [x1, y1] = centre(p), [x2, y2] = centre(n.id);
        const cls = nodeLevel(n.id) > 0 ? "learned" : nodeLevel(p) > 0 ? "open" : "closed";
        out += `<line class="${cls}${n.requiresAny ? " any" : ""}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
      });
    });
    svg.innerHTML = out;
  }

  // ---------- Memories (achievements) ----------
  function renderAchievements() {
    $("achievements").innerHTML = ACHIEVEMENTS.map(a => {
      const done = S.achievements.includes(a.id);
      return `<div class="ach ${done ? "done" : ""}">
        <div class="a-icon" aria-hidden="true">${a.icon}${a.badge ? `<span class="a-badge">${a.badge}</span>` : ""}</div>
        <div><div class="name">${a.name}${done ? "" : ' <span class="visually-hidden">(locked)</span>'}</div><div class="desc">${a.desc}</div></div></div>`;
    }).join("");
    setText($("achCount"), `${S.achievements.length}/${ACHIEVEMENTS.length}`);
  }

  function renderStats() {
    const rows = [
      ["Fish caught this migration", fmt(S.runFish)],
      ["Fish caught all time", fmt(S.lifetimeFish)],
      ["Fish from patting", fmt(S.stats.clickFish)],
      ["Penguin pats", fmt(S.stats.clicks)],
      ["Golden fish caught", fmt(S.stats.goldenClicks)],
      ["Big Catches", fmt(S.stats.bigCatches)],
      ["Big Catch chance", `${+(M.critChance * 100).toFixed(1)}% for ×${fmt(M.critMult)}`],
      ["Workshop levels", `${Object.values(S.research).reduce((a, b) => a + b, 0)}`],
      ["Heirloom levels", `${Object.values(S.heritage).reduce((a, b) => a + b, 0)}`],
      ["Colony members", fmt(Object.values(S.buildings).reduce((a, b) => a + b, 0))],
      ["Upgrades owned", `${S.upgrades.length}`],
      ["Migrations", `${S.migrations}`],
      ["Feather bonus", `+${fmt((M.feather - 1) * 100)}%`],
      ["Memories bonus", `+${fmt((M.ach - 1) * 100)}%`],
      ["This migration started", `${fmtTime((Date.now() - S.stats.runStartedAt) / 1000)} ago`],
      ["Playing since", new Date(S.stats.startedAt).toLocaleDateString()],
    ];
    $("stats").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  }

  function renderBuffs() {
    const now = Date.now();
    const html = S.buffs.filter(b => b.until > now)
      .map(b => `<span class="buff">${b.name} ×${b.mult} · ${Math.ceil((b.until - now) / 1000)}s</span>`).join("");
    if ($("buffs").innerHTML !== html) $("buffs").innerHTML = html;
  }

  // ---------- Colony scene: grows as you build ----------
  const SCENE_PROPS = [
    { id: "fisher",  icon: "🎣", style: "left:4%;bottom:24%" },
    { id: "drill",   icon: "🛖", style: "left:13%;bottom:28%" },
    { id: "igloo",   igloo: true, style: "left:72%;bottom:28%" },
    { id: "krill",   icon: "🦐", style: "left:88%;bottom:10%;font-size:1.2rem" },
    { id: "trawler", icon: "⛵", style: "left:84%;bottom:40%;font-size:1.3rem" },
    { id: "orca",    icon: "🐋", style: "left:62%;bottom:40%;font-size:1.2rem" },
    { id: "factory", icon: "🧶", style: "left:27%;bottom:8%;font-size:1.3rem" },
    { id: "rocket",  icon: "🎈", style: "left:18%;top:22%", float: true },
    { id: "portal",  icon: "🔮", style: "left:64%;bottom:8%;font-size:1.3rem" },
    { id: "time",    icon: "🕰️", style: "left:36%;bottom:30%;font-size:1.3rem" },
  ];

  function buildLights() {
    const colors = ["#e8735a", "#ffd27a", "#a6e3bd", "#a9c8ff"];
    $("lights").innerHTML = Array.from({ length: 16 }, (_, i) =>
      `<span class="bulb" style="background:${colors[i % 4]};box-shadow:0 0 8px ${colors[i % 4]};animation-delay:${(i % 4) * 0.6}s"></span>`).join("");
  }

  let sceneKey = "";
  function rebuildScene() {
    const total = Object.values(S.buildings).reduce((a, b) => a + b, 0);
    const count = Math.min(22, Math.ceil(Math.sqrt(total) * 1.4));
    const present = SCENE_PROPS.filter(p => S.buildings[p.id] > 0).map(p => p.id);
    const key = `${count}|${present.join(",")}|${S.buildings.aurora > 0}|${S.settings.reduceMotion}`;
    if (key === sceneKey) return;
    sceneKey = key;
    $("aurora").classList.toggle("on", S.buildings.aurora > 0);
    $("props").innerHTML = SCENE_PROPS.filter(p => present.includes(p.id)).map(p => p.igloo
      ? `<div class="prop igloo" style="${p.style}"></div>`
      : `<span class="prop${p.float ? " float" : ""}" style="${p.style}">${p.icon}</span>`).join("");
    const box = $("waddlers");
    box.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "waddler";
      p.textContent = "🐧";
      p.style.animationDuration = `${randBetween(14, 32)}s`;
      p.style.animationDelay = `-${randBetween(0, 32)}s`;
      p.style.left = `${randBetween(5, 90)}%`;   // used when motion is reduced
      p.style.bottom = `${randBetween(4, 36)}px`;
      p.style.fontSize = `${randBetween(16, 24)}px`;
      box.appendChild(p);
    }
  }

  function startSnow() {
    setInterval(() => {
      if (!S.settings.particles || !motionOK() || document.hidden) return;
      const f = document.createElement("div");
      f.className = "flake";
      f.textContent = Math.random() < 0.5 ? "❄" : "•";
      f.style.left = `${Math.random() * 100}vw`;
      f.style.fontSize = `${randBetween(6, 16)}px`;
      const d = randBetween(9, 18);
      f.style.animationDuration = `${d}s`;
      $("snow").appendChild(f);
      setTimeout(() => f.remove(), d * 1000);
    }, 450);
  }

  // ---------- Tabs ----------
  let currentTab = "colony";
  function selectTab(name, focus = false) {
    currentTab = name;
    document.querySelectorAll(".tab").forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    document.querySelectorAll(".tab-body").forEach(b => b.classList.toggle("hidden", b.id !== `tab-${name}`));
    hideTooltip();
    if (name === "achievements") renderAchievements();
    if (name === "stats") renderStats();
    tickUI();
    if (name === "heritage") refreshTree();   // after the panel is visible, so lines can be measured
  }

  // ---------- Settings ----------
  function applySettings() {
    const st = S.settings;
    document.documentElement.classList.toggle("reduce-motion", st.reduceMotion);
    document.documentElement.style.fontSize = `${st.textSize * 100}%`;
    Sound.setVolume();
    if (Sound.ctx || !st.ambience) Sound.setAmbience(st.ambience && st.sound);
    $("optSound").checked = st.sound;
    $("optVolume").value = st.volume;
    $("optAmbience").checked = st.ambience;
    $("optShake").value = st.shake;
    $("optReduceMotion").checked = st.reduceMotion;
    $("optParticles").checked = st.particles;
    $("optScientific").checked = st.scientific;
    $("optTextSize").value = String(st.textSize);
    sceneKey = "";
    rebuildScene();
  }

  // ---------- Structural refresh (event-driven) ----------
  function refreshStructure() {
    refreshBuildings();
    rebuildScene();
    setText($("achCount"), `${S.achievements.length}/${ACHIEVEMENTS.length}`);
    if (currentTab === "achievements") renderAchievements();
    if (currentTab === "heritage") refreshTree();
    tickUI();
  }
  bus.on("structure", refreshStructure);
  bus.on("buffs", refreshBuildings);

  // ---------- Live numbers (ticker) ----------
  function tickUI() {
    setText($("fish"), fmt(Math.floor(S.fish)));
    setText($("fps"), fmt(fishPerSecond()));
    setText($("clickPower"), fmt(clickPower()));
    setText($("featherTotal"), fmt(S.feathersEarned));
    setText($("featherBonus"), M.feather >= 11 ? `×${fmt(M.feather)}` : `+${fmt((M.feather - 1) * 100)}%`);
    $("featherBadge").classList.toggle("hidden", S.feathersEarned === 0 && pendingFeathers() === 0);
    const title = `${fmt(Math.floor(S.fish))} fish · Penguin Idle`;
    if (document.title !== title) document.title = title;
    renderBuffs();
    if (currentTab === "colony") { tickUpgrades(); tickBuildings(); }
    if (currentTab === "heritage") tickMigration();
    if (currentTab === "workshop") tickResearch();
  }

  // ---------- Formatting ----------
  function fmt(n) {
    if (!isFinite(n)) return "∞";
    if (n < 0) return "-" + fmt(-n);
    if (n < 1000) {
      if (n === Math.floor(n)) return String(n);
      return n < 10 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.floor(n));
    }
    const exp = Math.floor(Math.log10(n));
    if ((S && S.settings.scientific) || exp >= SUFFIXES.length * 3) return `${(n / Math.pow(10, exp)).toFixed(2)}e${exp}`;
    const tier = Math.floor(exp / 3);
    const scaled = n / Math.pow(1000, tier);
    return `${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
  }

  function fmtTime(sec) {
    sec = Math.floor(sec);
    const d = Math.floor(sec / 86400), h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60, s = sec % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function randBetween(a, b) { return a + Math.random() * (b - a); }

  // =====================================================================
  // 7. Loop & wiring
  // =====================================================================

  let lastFrame = performance.now();
  let uiTimer = 0, autoTimer = 0, achTimer = 0, saveTimer = 0, statsTimer = 0;

  // Timer-driven (not requestAnimationFrame) so the colony keeps fishing in background tabs
  function frame() {
    const now = performance.now();
    const dt = Math.min(5, (now - lastFrame) / 1000);
    lastFrame = now;
    gain(fishPerSecond() * dt);

    if (M.autoRate > 0) {
      autoTimer += dt;
      const step = 1 / M.autoRate;
      while (autoTimer >= step) { autoTimer -= step; clickPenguin(null, true); }
    }
    if (Date.now() >= nextGolden) spawnGolden();

    const t = Date.now();
    if (S.buffs.some(b => b.until <= t)) { S.buffs = S.buffs.filter(b => b.until > t); bus.emit("buffs"); }

    uiTimer += dt; achTimer += dt; saveTimer += dt; statsTimer += dt;
    if (uiTimer >= 0.1) { uiTimer = 0; tickUI(); }
    if (achTimer >= 1) { achTimer = 0; checkAchievements(); }
    if (statsTimer >= 1 && currentTab === "stats") { statsTimer = 0; renderStats(); }
    if (saveTimer >= 15) { saveTimer = 0; save(); }
    S.lastTick = Date.now();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { save(); return; }
    const away = (Date.now() - S.lastTick) / 1000;
    if (away > 2) { gain(fishPerSecond(false) * away); S.lastTick = Date.now(); }
    lastFrame = performance.now();
  });
  window.addEventListener("beforeunload", save);

  function replaceState(newState) {
    S = newState;
    S.buffs = [];
    S.lastTick = Date.now();
    recompute();
    applySettings();
    bus.emit("structure");
    save();
  }

  function init() {
    const loadProblem = load();
    recompute();
    const offline = loadProblem && loadProblem.title.startsWith("This save is from a newer") ? null : applyOffline();

    buildBuildingList();
    buildTree();
    buildResearch();
    buildLights();
    applySettings();
    refreshStructure();
    scheduleGolden();

    // Big penguin: pointer or keyboard. Held keys don't auto-repeat into an autoclicker.
    const peng = $("bigPenguin");
    peng.addEventListener("click", e => clickPenguin(pointFrom(e, peng)));
    peng.addEventListener("keydown", e => { if (e.repeat && (e.key === " " || e.key === "Enter")) e.preventDefault(); });

    // Tabs with roving focus and arrow-key navigation
    const tabs = [...document.querySelectorAll(".tab")];
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => selectTab(t.dataset.tab));
      t.addEventListener("keydown", e => {
        const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (dir) { e.preventDefault(); selectTab(tabs[(i + dir + tabs.length) % tabs.length].dataset.tab, true); }
        if (e.key === "Home") { e.preventDefault(); selectTab(tabs[0].dataset.tab, true); }
        if (e.key === "End") { e.preventDefault(); selectTab(tabs[tabs.length - 1].dataset.tab, true); }
      });
    });

    document.querySelectorAll("#buyMode button").forEach(btn => btn.addEventListener("click", () => {
      document.querySelectorAll("#buyMode button").forEach(x => {
        x.classList.toggle("active", x === btn);
        x.setAttribute("aria-pressed", String(x === btn));
      });
      buyAmount = btn.dataset.n === "max" ? "max" : Number(btn.dataset.n);
      Sound.play("tick");
      tickUI();
    }));

    $("migrateBtn").addEventListener("click", migrate);
    $("respecBtn").addEventListener("click", respec);

    // Save controls
    $("saveBtn").addEventListener("click", () => {
      if (savingBlocked) { toast("⚠️ Saving is paused because the stored save is from a newer version. Refresh the page."); return; }
      save(); toast("💾 Saved. Your colony is tucked in.");
    });
    $("exportBtn").addEventListener("click", () => {
      const ta = $("saveText");
      ta.classList.remove("hidden");
      ta.value = encodeSave();
      ta.select();
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => toast("📋 Save copied to clipboard."), () => {});
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
        const imported = decodeSave(ta.value);
        savingBlocked = false;
        replaceState(imported);
        ta.value = "";
        ta.classList.add("hidden");
        toast("✅ Save imported. Welcome back!");
      } catch (e) {
        toast(`❌ ${e.message || "That save couldn't be read."}`);
      }
    });
    $("resetBtn").addEventListener("click", () => openModal({
      title: "Start over completely?",
      body: "<p>This wipes <b>everything</b>, including feathers, heirlooms and memories. It can't be undone.</p>",
      danger: true,
      actions: [
        { label: "Keep my colony", cancel: true },
        { label: "Wipe everything", danger: true, onClick: () => { savingBlocked = false; const keep = S.settings; const s = freshState(); s.settings = keep; replaceState(s); } },
      ],
    }));

    // Settings
    const bind = (id, key, read, after) => $(id).addEventListener(id === "optVolume" || id === "optShake" ? "input" : "change", e => {
      S.settings[key] = read(e.target);
      applySettings();
      if (after) after();
    });
    bind("optSound", "sound", el => el.checked, () => Sound.play("tick"));
    bind("optVolume", "volume", el => Number(el.value));
    $("optVolume").addEventListener("change", () => Sound.play("pop"));
    bind("optAmbience", "ambience", el => el.checked, () => Sound.setAmbience(S.settings.ambience && S.settings.sound));
    bind("optShake", "shake", el => Number(el.value));
    $("optShake").addEventListener("change", () => Shake.add(0.5));   // preview the chosen strength
    bind("optReduceMotion", "reduceMotion", el => el.checked);
    bind("optParticles", "particles", el => el.checked);
    bind("optScientific", "scientific", el => el.checked, refreshStructure);
    bind("optTextSize", "textSize", el => Number(el.value));

    // Browsers only allow audio after a user gesture: start ambience on the first interaction
    const unlockAudio = () => {
      if (S.settings.sound && S.settings.ambience) Sound.setAmbience(true);
      else if (Sound.ctx) Sound.ensure();
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);

    startSnow();
    tickUI();
    // Every screen opens with something focused, so Space/Enter work straight away.
    // focusVisible:false hides the ring until the player actually uses the keyboard.
    peng.focus({ preventScroll: true, focusVisible: false });

    if (loadProblem) openModal({ title: loadProblem.title, body: loadProblem.body, actions: [{ label: "Okay", primary: true, cancel: true }] });
    if (offline) openModal({ title: offline.title, body: offline.body, actions: [{ label: "Cozy!", primary: true, cancel: true }] });

    lastFrame = performance.now();
    setInterval(frame, 50);
  }

  // Small debug hook for the browser console
  window.penguinIdle = {
    get state() { return S; }, fmt, save,
    fishPerSecond: () => fishPerSecond(),
    spawnGolden: () => spawnGolden(),
    encodeSave: () => encodeSave(), decodeSave: str => decodeSave(str),
    catalog: () => ({
      buildings: BUILDINGS.map(b => b.icon),
      upgrades: UPGRADES.map(u => ({ id: u.id, icon: u.icon, name: u.name })),
      heritage: TREE.map(n => ({ id: n.id, icon: n.icon })),
      research: RESEARCH.map(r => ({ id: r.id, icon: r.icon })),
      achievements: ACHIEVEMENTS.map(a => ({ id: a.id, icon: a.icon, badge: a.badge })),
    }),
  };

  init();
})();
