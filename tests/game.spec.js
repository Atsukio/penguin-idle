// End-to-end tests for Penguin Idle. Each test gets a fresh browser profile (empty save).
const { test, expect } = require("@playwright/test");

const SAVE_KEY = "penguinIdleSave_v1";
const encodeOld = obj => Buffer.from(JSON.stringify(obj)).toString("base64");   // pre-checksum save format

// Fail any test that logs a page error
test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on("pageerror", e => page.errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") page.errors.push(m.text()); });
});
test.afterEach(async ({ page }) => { expect(page.errors, "page errors").toEqual([]); });

const game = page => page.evaluate(() => window.penguinIdle);
const state = (page, fn) => page.evaluate(fn);
async function seed(page, saveObj) {
  await page.addInitScript(([key, value]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(key, value); sessionStorage.setItem("seeded", "1"); } },
    [SAVE_KEY, encodeOld(saveObj)]);
}
async function closeModals(page) {
  while (await page.locator(".modal").count()) await page.keyboard.press("Escape");
}

test("loads cleanly and draws the penguin", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#penguinSvg .p-eyes")).toHaveCount(1);
  await expect(page.locator(".tab")).toHaveCount(6);
  await expect(page.locator("#buildings .building")).toHaveCount(12);
  expect(await game(page)).toBeTruthy();
});

test("patting earns fish and buys a Sleepy Chick", async ({ page }) => {
  await page.goto("/");
  // force: the penguin bobs continuously, so Playwright would otherwise wait forever for it to hold still
  for (let i = 0; i < 20; i++) await page.locator("#bigPenguin").click({ force: true });
  expect(await state(page, () => window.penguinIdle.state.stats.clicks)).toBe(20);
  await page.locator("#buildings .building").first().click();
  expect(await state(page, () => window.penguinIdle.state.buildings.chick)).toBe(1);
  await expect(page.locator("#buildings .building").first().locator(".owned")).toHaveText("1");
});

test("hovering with x10 shows the row's new count and output, and the preview matches the real purchase", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  await page.evaluate(() => { const g = window.penguinIdle; g.state.buildings.chick = 20; g.state.fish = 1e9; g.engine.recompute(); g.engine.bus.emit("structure"); });
  const chick = page.locator("#buildings .building").first();
  const eachText = () => chick.locator(".b-fps").textContent();
  const eachNow = await eachText();
  await page.locator('#buyMode [data-n="10"]').click();
  await chick.hover();
  await expect(chick).toHaveClass(/previewing/);
  await expect(chick.locator(".owned")).toHaveText("30");
  expect(await eachText()).not.toBe(eachNow);                 // passing the 25 milestone doubles output
  const totalOf = t => t.split("/s")[0];
  await page.locator('#buyMode [data-n="1"]').click();        // below a milestone, x1 still raises the row's total
  await page.evaluate(() => { const g = window.penguinIdle; g.state.buildings.chick = 30; g.engine.recompute(); g.engine.bus.emit("structure"); });
  await page.mouse.move(5, 5);
  const total30 = totalOf(await eachText());
  await page.locator('#buyMode [data-n="10"]').click();
  await chick.hover();
  await expect(chick.locator(".owned")).toHaveText("40");
  expect(totalOf(await eachText())).not.toBe(total30);
  await page.evaluate(() => { const g = window.penguinIdle; g.state.buildings.chick = 20; g.engine.recompute(); g.engine.bus.emit("structure"); });
  await chick.hover();
  await expect(chick.locator(".owned")).toHaveText("30");
  await page.mouse.move(5, 5);
  await expect(chick).not.toHaveClass(/previewing/);
  await expect(chick.locator(".owned")).toHaveText("20");
  const { preview, before, after } = await page.evaluate(() => {
    const g = window.penguinIdle, E = g.engine;
    const before = E.fishPerSecond(false);
    const preview = E.previewBuy("chick", 10);
    const untouched = g.state.buildings.chick === 20 && E.fishPerSecond(false) === before;
    E.buyBuilding("chick", 10);
    return { preview, before: untouched ? before : -1, after: E.fishPerSecond(false) };
  });
  expect(before).toBeGreaterThan(0);                  // previewing changed nothing
  expect(preview.fps).toBeCloseTo(after, 6);          // and predicted the real result
});

test("keyboard: arrow keys move between tabs and Escape closes dialogs", async ({ page }) => {
  await page.goto("/");
  await page.locator("#tabbtn-colony").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tabbtn-workshop")).toBeFocused();
  await expect(page.locator("#tab-workshop")).toBeVisible();
  await page.keyboard.press("6");
  await expect(page.locator("#tab-stats")).toBeVisible();
  await page.locator("#resetBtn").click();
  await expect(page.locator(".modal")).toHaveCount(1);
  await expect(page.locator(".modal .btn").first()).toBeFocused();   // destructive dialogs focus the safe choice
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toHaveCount(0);
});

test("saves round-trip, and tampered or newer saves are rejected", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => {
    const g = window.penguinIdle;
    g.state.fish = 12345;
    const enc = g.encodeSave();
    const back = g.decodeSave(enc);
    let tampered = "accepted", newer = "accepted";
    try { g.decodeSave(enc.slice(0, -10) + "AAAA" + enc.slice(-6)); } catch (e) { tampered = e.kind; }
    try { g.decodeSave(btoa(JSON.stringify({ version: 999 }))); } catch (e) { newer = e.kind; }
    return { fish: back.fish, hasChecksum: /\.[0-9a-z]+$/.test(enc), tampered, newer };
  });
  expect(result).toEqual({ fish: 12345, hasChecksum: true, tampered: "corrupt", newer: "newer" });
});

test("a v1 save (before versioning features) migrates to the current version", async ({ page }) => {
  await seed(page, {
    version: 1, fish: 5000, runFish: 5000, lifetimeFish: 5000, buildings: { chick: 3, fisher: 12 },
    upgrades: ["chick_0", "bogus_id"], achievements: ["fish_1"], feathersEarned: 0, heritage: [],
    stats: { clicks: 5 }, settings: { particles: true, scientific: false }, lastTick: Date.now(),
  });
  await page.goto("/");
  const s = await state(page, () => {
    const st = window.penguinIdle.state;
    return { fisher: st.buildings.fisher, upgrades: st.upgrades, volume: st.settings.volume, shore: st.shore, helpers: st.helpers, hat: st.cosmetics.hat };
  });
  expect(s).toEqual({ fisher: 12, upgrades: ["chick_0"], volume: 0.5, shore: "home", helpers: {}, hat: "coral" });
});

test("a v2 save's heirloom list becomes tree levels", async ({ page }) => {
  await seed(page, {
    version: 2, fish: 0, lifetimeFish: 1e15, buildings: {}, upgrades: [], achievements: [],
    feathersEarned: 300, feathersSpent: 254, heritage: ["headstart", "flippers", "emperor"], lastTick: Date.now(),
  });
  await page.goto("/");
  const s = await state(page, () => ({ heritage: window.penguinIdle.state.heritage, spent: window.penguinIdle.state.feathersSpent }));
  expect(s.heritage).toEqual({ headstart: 1, flippers: 1, emperor: 1 });
  expect(s.spent).toBeGreaterThan(0);   // recomputed from what's owned, not trusted from the file
});

test("Heirloom Tree: learn, prerequisites and free refunds", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { const g = window.penguinIdle; g.state.feathersEarned = 500; g.engine.recompute(); g.engine.bus.emit("structure"); });
  await page.locator("#tabbtn-heritage").click();
  await page.locator('#tree [data-id="nest"]').click();
  await expect(page.locator("#learnBtn")).toBeDisabled();   // needs Warm Welcome first
  await page.locator('#tree [data-id="headstart"]').click();
  await page.locator("#learnBtn").click();
  await page.locator('#tree [data-id="nest"]').click();
  await page.locator("#learnBtn").click();
  expect(await state(page, () => window.penguinIdle.state.heritage)).toEqual({ headstart: 1, nest: 1 });
  await expect(page.locator("#treeLines line")).toHaveCount(26);
  await page.locator("#respecBtn").click();
  await page.locator(".modal .btn.primary").click();
  expect(await state(page, () => window.penguinIdle.state.feathersSpent)).toBe(0);
});

test("helpers: hiring the Shopkeeper buys upgrades automatically", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { const g = window.penguinIdle; g.state.feathersEarned = 50; g.state.buildings.chick = 5; g.state.fish = 1e6; g.engine.recompute(); g.engine.bus.emit("structure"); });
  await page.locator("#tabbtn-heritage").click();
  await page.locator('[data-hire="shopkeeper"]').click();
  await expect(page.locator('[data-toggle="shopkeeper"]')).toHaveText("On");
  await expect.poll(() => state(page, () => window.penguinIdle.state.upgrades.length), { timeout: 5000 }).toBeGreaterThan(0);
  await page.locator('[data-toggle="shopkeeper"]').click();
  expect(await state(page, () => window.penguinIdle.state.helpers.shopkeeper)).toBe(false);
});

test("Workshop research levels up", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { const g = window.penguinIdle; g.state.fish = 1e6; g.state.runFish = 1e6; });
  await page.locator("#tabbtn-workshop").click();
  await page.locator('#research [data-id="mittens"]').click();
  await page.locator('#research [data-id="mittens"]').click();
  expect(await state(page, () => window.penguinIdle.state.research.mittens)).toBe(2);
  await expect(page.locator('#research [data-id="mittens"] .r-level')).toHaveText("Lv 2/20");
});

test("migrating to a chosen shore", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { const g = window.penguinIdle; g.state.lifetimeFish = 1e15; g.engine.recompute(); });
  await page.locator("#tabbtn-heritage").click();
  await page.locator("#migrateBtn").click();
  await page.locator('.modal input[value="krillbay"]').check();
  await page.locator(".modal .btn.primary").click();
  const s = await state(page, () => ({ shore: window.penguinIdle.state.shore, migrations: window.penguinIdle.state.migrations, feathers: window.penguinIdle.state.feathersEarned }));
  expect(s).toEqual({ shore: "krillbay", migrations: 1, feathers: 10 });
  await expect(page.locator("#shorePill")).toContainText("Krill Bay");
  // The scenery and weather change with the shore
  await expect(page.locator("#colony")).toHaveAttribute("data-shore", "krillbay");
  await expect(page.locator("#colony .sea")).toHaveCount(1);
  expect(await state(page, () => window.PI.fx.Particles.weather)).toBe("bubbles");
});

test("residents chat with each other in speech bubbles", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  await page.evaluate(() => { const g = window.penguinIdle; g.state.buildings.chick = 40; g.engine.recompute(); g.engine.bus.emit("structure"); });
  await expect.poll(() => page.evaluate(() => window.PI.ui.chatNow()), { timeout: 10000 }).toBe(true);
  const bubble = page.locator("#colony .chat-bubble");
  await expect(bubble).toHaveCount(1, { timeout: 8000 });
  expect((await bubble.textContent()).length).toBeGreaterThan(0);
  await expect(page.locator("#colony .waddler.talking")).toHaveCount(1);
  // The bubble stays inside the scene
  const [c, b] = await Promise.all([page.locator("#colony").boundingBox(), bubble.boundingBox()]);
  expect(b.x).toBeGreaterThanOrEqual(c.x);
  expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 1);
  await expect(bubble).toHaveCount(0, { timeout: 30000 });   // the chat finishes…
  await expect.poll(() => page.locator("#waddlers [data-busy]:not([data-job])").count(), { timeout: 30000 }).toBe(0);   // …and the chatters go back to wandering (workers are busy too)
});

test("the colony works: residents fetch fish to the basket, props make fish, and the basket shows the fish count", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  await page.evaluate(() => { const g = window.penguinIdle; Object.assign(g.state.buildings, { chick: 10, fisher: 5, trawler: 2 }); g.state.fish = 5000; g.engine.recompute(); g.engine.bus.emit("structure"); });
  await expect(page.locator("#fishPile span")).toHaveCount(3);                      // ceil(log10(5001) × 0.7)
  await expect(page.locator('#props [data-id="trawler"]')).toHaveAttribute("title", /^2 Lantern Boats: .+ fish\/s \(\d+% of the colony's catch\)$/);
  await page.evaluate(() => PI.ui.propNow());
  await expect(page.locator("#colony .fly-fish").first()).toBeAttached();
  test.setTimeout(60000);
  expect(await page.evaluate(() => PI.ui.workNow())).toBe(true);
  const worker = await page.locator("#waddlers [data-job]").first().elementHandle();
  await expect(page.locator("#waddlers .w-held")).toBeAttached({ timeout: 20000 });  // holding a rod or a fish
  await expect(page.locator("#colony .catch-pop")).toBeAttached({ timeout: 30000 }); // delivered: "+N" over the basket
  await expect.poll(() => worker.evaluate(w => w.dataset.job || ""), { timeout: 15000 }).toBe("");   // the first worker goes back to wandering
  // Spending fish empties the basket; reduce motion keeps everyone still
  await page.evaluate(() => { const g = window.penguinIdle; for (const id in g.state.buildings) g.state.buildings[id] = 0; g.state.fish = 0; g.state.settings.reduceMotion = true; g.engine.recompute(); });
  await expect(page.locator("#fishPile span")).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator("#iceHole")).toBeHidden();
  expect(await page.evaluate(() => PI.ui.workNow())).toBe(false);
});

test("the big penguin talks: a hello for new players, and the first of a kind is welcomed", async ({ page }) => {
  await page.goto("/");
  const say = page.locator("#penguinSay");
  await expect(say).toBeVisible({ timeout: 5000 });
  await expect(say).toHaveText("Hello! Pat me to catch fish!");
  await page.evaluate(() => { window.penguinIdle.state.fish = 1000; });
  await page.locator("#buildings .building").first().click();
  await expect(say).toHaveText("Welcome to the colony, Sleepy Chick!");
  // It sits inside the panel and goes away on its own
  const [panel, bubble] = await Promise.all([page.locator(".clicker").boundingBox(), say.boundingBox()]);
  expect(bubble.x).toBeGreaterThanOrEqual(panel.x);
  expect(bubble.x + bubble.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
  await expect(say).toBeHidden({ timeout: 10000 });
});

test("every shore has its own scenery and weather (?shore= preview)", async ({ page }) => {
  const seen = new Set();
  for (const [shore, weather] of [["home", "snow"], ["blizzard", "blizzard"], ["harbour", "rain"], ["quiethollow", "fluff"]]) {
    await page.goto(`/?shore=${shore}`);
    await expect(page.locator("#colony")).toHaveAttribute("data-shore", shore);
    expect(await state(page, () => window.PI.fx.Particles.weather)).toBe(weather);
    seen.add(await page.locator("#colony").evaluate(el => getComputedStyle(el).backgroundImage));
  }
  expect(seen.size).toBe(4);   // every sky is different
  expect(await state(page, () => window.penguinIdle.state.shore)).toBe("home");   // previewing doesn't move you
});

test("penguin letters can be answered for a reward", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { const st = window.penguinIdle.state; st.letters.list.forEach(l => { l.base = -1e30; }); });   // complete them all
  await page.locator("#tabbtn-home").click();
  const buttons = page.locator("[data-claim]");
  await expect(buttons).toHaveCount(3);
  for (let i = 0; i < 3; i++) await page.locator("[data-claim]").first().click();
  await page.locator("#bonusBtn").click();
  const s = await state(page, () => ({ claimed: window.penguinIdle.state.stats.lettersClaimed, bonus: window.penguinIdle.state.letters.bonus }));
  expect(s).toEqual({ claimed: 3, bonus: true });
});

test("wardrobe: unlocked outfits change the penguin; locked ones don't", async ({ page }) => {
  await page.goto("/");
  await page.locator("#tabbtn-home").click();
  await page.locator('.ward[data-slot="hat"][data-id="mint"]').click({ force: true });   // locked at 0 memories
  expect(await state(page, () => window.penguinIdle.state.cosmetics.hat)).toBe("coral");
  await page.evaluate(() => { const g = window.penguinIdle; g.state.achievements.push("fish_1", "fish_100", "click_1", "fps_1", "b_chick_1"); g.engine.bus.emit("structure"); });
  await page.locator('.ward[data-slot="hat"][data-id="mint"]').click();
  expect(await state(page, () => window.penguinIdle.state.cosmetics.hat)).toBe("mint");
  await expect(page.locator('#penguinSvg .p-hat path').first()).toHaveAttribute("fill", "#6cc4a1");
});

test("seasonal event preview via ?season=", async ({ page }) => {
  await page.goto("/?season=midwinter");
  await expect(page.locator("#seasonBadge")).toContainText("Midwinter Feast");
  expect(await state(page, () => window.penguinIdle.engine.M.luckyMult)).toBeCloseTo(1.5);
});

test("reduce motion setting applies", async ({ page }) => {
  await page.goto("/");
  await page.locator("#tabbtn-stats").click();
  await page.locator("#optReduceMotion").check();
  await expect(page.locator("html")).toHaveClass(/reduce-motion/);
});

test("installable: manifest and service worker", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "service worker check uses Chromium");
  await page.goto("/");
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.icons.some(i => i.sizes === "512x512")).toBe(true);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toContain("localhost:4173");
});

test("@touch first tap shows details, second tap buys", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { window.penguinIdle.state.fish = 1000; });
  const chick = page.locator("#buildings .building").first();
  await chick.tap();
  await expect(page.locator("#infoSheet")).toBeVisible();
  await expect(page.locator("#infoSheet")).toContainText("Sleepy Chick");
  expect(await state(page, () => window.penguinIdle.state.buildings.chick)).toBe(0);
  await chick.tap();
  expect(await state(page, () => window.penguinIdle.state.buildings.chick)).toBe(1);
  await page.locator("#sheetBuy").tap();
  expect(await state(page, () => window.penguinIdle.state.buildings.chick)).toBe(2);
  await page.locator("#sheetClose").tap();
  await expect(page.locator("#infoSheet")).toBeHidden();
});

test("@touch layout fits a phone screen without sideways scrolling", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("waking the computer from sleep gives offline rewards", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  // Simulate three hours asleep: the page stayed open but no timers ran
  const before = await state(page, () => {
    const g = window.penguinIdle; g.state.buildings.chick = 10; g.engine.recompute();
    g.state.fish = 0; g.state.lastTick = Date.now() - 3 * 3600e3;
    return g.engine.fishPerSecond(false);
  });
  await expect(page.locator(".modal h2")).toHaveText("Welcome home!");
  const fish = await state(page, () => window.penguinIdle.state.fish);
  expect(fish).toBeGreaterThan(before * 3 * 3600 * 0.25 * 0.95);   // 25% pace for the time away
  expect(await state(page, () => window.penguinIdle.state.stats.longestAway)).toBeGreaterThan(3 * 3600 - 5);
});

test("a throttled background tab still earns at full rate", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  // Hidden tabs' timers fire about once a minute: a 60-second gap should count in full, with no welcome note
  const fps = await state(page, () => {
    const g = window.penguinIdle; g.state.buildings.chick = 10; g.engine.recompute();
    g.state.fish = 0; g.state.lastTick = Date.now() - 60e3;
    return g.engine.fishPerSecond(false);
  });
  await expect.poll(() => state(page, () => window.penguinIdle.state.fish)).toBeGreaterThan(fps * 59);
  await expect(page.locator(".modal")).toHaveCount(0);
});
