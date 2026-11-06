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

test("rubbing the penguin pats it, holding keeps patting, and the keyboard still pats once", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  const clicks = () => state(page, () => window.penguinIdle.state.stats.clicks);
  const box = await page.locator("#bigPenguin").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // Rub side to side: the press pats once, then each stroke pats (capped at about 14 a second)
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(cx + (i % 2 ? -50 : 50), cy, { steps: 4 });
    await page.waitForTimeout(90);
  }
  await page.mouse.up();
  const rubbed = await clicks();
  expect(rubbed).toBeGreaterThanOrEqual(5);
  // Up and down works too
  await page.mouse.down();
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(cx, cy + (i % 2 ? -50 : 50), { steps: 4 });
    await page.waitForTimeout(90);
  }
  await page.mouse.up();
  const stroked = await clicks();
  expect(stroked).toBeGreaterThanOrEqual(rubbed + 4);
  // Holding still: one pat on press, then repeats after a short pause
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
  const held = await clicks();
  expect(held - stroked).toBeGreaterThanOrEqual(3);
  expect(held - stroked).toBeLessThanOrEqual(6);
  // Stops when let go
  await page.waitForTimeout(500);
  expect(await clicks()).toBe(held);
  // Keyboard: one pat per press
  await page.locator("#bigPenguin").focus();
  await page.keyboard.press("Enter");
  expect(await clicks()).toBe(held + 1);
});

test("hold-to-pat can be switched off, rubs are counted, and the next goal is shown", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  const clicks = () => state(page, () => window.penguinIdle.state.stats.clicks);
  await page.locator('[data-tab="stats"]').click();
  await page.locator("#optHoldToPat").uncheck();
  expect(await state(page, () => window.penguinIdle.state.settings.holdToPat)).toBe(false);
  await page.locator('[data-tab="colony"]').click();
  const box = await page.locator("#bigPenguin").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
  expect(await clicks()).toBe(1);   // just the press
  // Rubbing still works, and is counted on its own
  await page.mouse.down();
  for (let i = 0; i < 4; i++) { await page.mouse.move(cx + (i % 2 ? -50 : 50), cy, { steps: 4 }); await page.waitForTimeout(90); }
  await page.mouse.up();
  const rubs = await state(page, () => window.penguinIdle.state.stats.rubPats);
  expect(rubs).toBeGreaterThanOrEqual(3);
  expect(await clicks()).toBe(2 + rubs);
  // What you're saving up for: the first Sleepy Chick
  await expect(page.locator("#nextGoal")).toContainText(/Next: .+ in 🐟 \d+/);
});

test("What's new: new players are up to date, returning players get the news once", async ({ browser }) => {
  // A brand-new colony has nothing to catch up on
  const fresh = await browser.newPage();
  await fresh.goto("/");
  await expect(fresh.locator("#newsBadge")).toBeHidden();
  expect(await fresh.evaluate(() => window.penguinIdle.state.seenVersion)).toBe(await fresh.evaluate(() => PI.data.GAME_VERSION));
  await fresh.close();

  // A save from before What's new existed: a toast, a dot on Settings, and the page lists the releases
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await seed(page, { version: 4, fish: 10, runFish: 10, lifetimeFish: 10, buildings: {}, lastTick: Date.now() });
  await page.goto("/");
  await expect(page.locator(".toast", { hasText: "The colony has news" })).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#newsBadge")).toBeVisible();
  await closeModals(page);
  await page.locator('[data-tab="stats"]').click();
  await page.locator("#whatsNewBtn").click();
  const modal = page.locator(".modal", { hasText: "What's new" });
  await expect(modal).toBeVisible();
  await expect(modal.locator("details.news")).toHaveCount(await page.evaluate(() => PI.data.CHANGELOG.length));
  await expect(modal.locator("details.news").first()).toHaveAttribute("open", "");
  await expect(modal.locator(".pill", { hasText: "New" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("#newsBadge")).toBeHidden();
  // Remembered after a reload
  await page.reload();
  await page.waitForTimeout(2000);
  await expect(page.locator("#newsBadge")).toBeHidden();
  await expect(page.locator(".toast", { hasText: "The colony has news" })).toHaveCount(0);
  await ctx.close();
});

test("move to another device: the link carries a copy and asks before replacing", async ({ page, browser }) => {
  await page.goto("/");
  await closeModals(page);
  await page.evaluate(() => { const g = window.penguinIdle; g.state.fish = 123456; g.state.feathersEarned = 7; g.state.buildings.fisher = 9; g.state.names = ["Pip"]; g.engine.recompute(); });
  await page.locator('[data-tab="stats"]').click();
  await page.locator("#moveBtn").click();
  const modal = page.locator(".modal", { hasText: "Move to another device" });
  await expect(modal.locator(".move-qr svg")).toBeVisible();
  const link = await modal.locator("#moveLink").inputValue();
  expect(link).toMatch(/#move=z[A-Za-z0-9_-]+$/);
  expect(link.length).toBeLessThan(2900);   // fits in a QR code

  // The other device: its own small colony, then the link
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto("/");
  await closeModals(other);
  await other.evaluate(() => { window.penguinIdle.state.fish = 5; window.penguinIdle.state.settings.volume = 0.2; });
  await other.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  const ask = other.locator(".modal", { hasText: "Bring this colony here?" });
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("123K fish");
  // Saying no keeps this device's colony, and the link is gone from the address bar
  await ask.getByRole("button", { name: "Keep the one here" }).click();
  expect(await other.evaluate(() => window.penguinIdle.state.fish)).toBeLessThan(1000);
  expect(await other.evaluate(() => location.hash)).toBe("");
  // Yes brings it over, keeping this device's own settings
  await other.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await other.locator(".modal").getByRole("button", { name: "Bring it here" }).click();
  const got = await other.evaluate(() => { const s = window.penguinIdle.state; return { fish: s.fish >= 123456, feathers: s.feathersEarned, fisher: s.buildings.fisher, names: s.names, volume: s.settings.volume }; });
  expect(got).toEqual({ fish: true, feathers: 7, fisher: 9, names: ["Pip"], volume: 0.2 });
  // A broken link says so instead of loading anything
  await other.goto("/#move=zNOTAREALSAVE");
  await expect(other.locator(".modal", { hasText: "That link didn't work" })).toBeVisible();
  await ctx.close();
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
  await page.locator('#props [data-id="trawler"]').hover({ force: true });            // hovering a prop shows what it earns
  await expect(page.locator("#tooltip")).toContainText("2 owned catch");
  await expect(page.locator("#tooltip")).toContainText(/That's (\d+%|under 1%) of the colony's catch/);
  expect(await state(page, () => window.penguinIdle.state.stats.propLooks)).toBeGreaterThan(0);
  await page.mouse.move(5, 5);
  await page.evaluate(() => PI.ui.propNow());
  await expect(page.locator("#colony .fly-fish").first()).toBeAttached();
  test.setTimeout(60000);
  expect(await page.evaluate(() => PI.ui.workNow())).toBe(true);
  const worker = await page.locator("#waddlers [data-job]").first().elementHandle();
  // Note the moment the worker is free again: it can pick up its next job before a poll would see the gap
  await worker.evaluate(w => new MutationObserver(() => { if (!w.dataset.job) w.dataset.wasFree = "1"; }).observe(w, { attributes: true, attributeFilter: ["data-job"] }));
  await expect(page.locator("#waddlers .w-held")).toBeAttached({ timeout: 20000 });  // holding a rod or a fish
  await expect(page.locator("#colony .catch-pop")).toBeAttached({ timeout: 30000 }); // delivered: "+N" over the basket
  await expect.poll(() => worker.evaluate(w => w.dataset.wasFree || ""), { timeout: 15000 }).toBe("1");   // the first worker goes back to wandering
  // Spending fish empties the basket; reduce motion keeps everyone still
  await page.evaluate(() => { const g = window.penguinIdle; for (const id in g.state.buildings) g.state.buildings[id] = 0; g.state.fish = 0; g.state.settings.reduceMotion = true; g.engine.recompute(); });
  await expect(page.locator("#fishPile span")).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator("#iceHole")).toBeHidden();
  expect(await page.evaluate(() => PI.ui.workNow())).toBe(false);
});

test("cozy cursor: an arrow, a glove on buttons and a mitten on the penguin, and it can be switched off", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  const cursorOf = sel => page.evaluate(s => getComputedStyle(document.querySelector(s)).cursor, sel);
  expect(await cursorOf("body")).toMatch(/^url\("data:image\/svg\+xml.+\) 5 4, auto$/);
  expect(await cursorOf("#tabbtn-colony")).toMatch(/\) 12 7, pointer$/);
  expect(await cursorOf("#bigPenguin")).toMatch(/\) 17 13, pointer$/);
  await page.locator("#tabbtn-stats").click();
  await page.locator("#optCursor").uncheck();
  expect(await cursorOf("body")).toBe("auto");
  expect(await cursorOf("#tabbtn-colony")).toBe("pointer");
});

test("lofi music starts on the first interaction and follows its setting", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => PI.fx.Music.on)).toBe(false);   // browsers block audio before a gesture
  await closeModals(page);
  await page.locator("#tabbtn-stats").click();
  await expect.poll(() => page.evaluate(() => PI.fx.Music.on)).toBe(true);
  await page.locator("#optMusic").uncheck();
  expect(await page.evaluate(() => [PI.fx.Music.on, window.penguinIdle.state.settings.music])).toEqual([false, false]);
  await page.locator("#optMusic").check();
  expect(await page.evaluate(() => PI.fx.Music.on)).toBe(true);
});

test("the top-bar music button and Shift+M toggle the music", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  const music = () => page.evaluate(() => [PI.fx.Music.on, window.penguinIdle.state.settings.music]);
  await page.locator("#musicBtn").click();                    // the very first press starts it rather than muting
  await expect.poll(music).toEqual([true, true]);
  await expect(page.locator("#musicBtn")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#musicBtn")).toHaveAttribute("title", /^Now playing: (night-time )?cozy lofi/);
  await page.locator("#musicBtn").click();
  await expect.poll(music).toEqual([false, false]);
  await expect(page.locator("#musicBtn")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Shift+M");
  await expect.poll(music).toEqual([true, true]);
  expect(await page.locator("#optMusic").isChecked()).toBe(true);
});

test("the music follows the scene: each shore, night-time and the Midwinter Feast", async ({ page }) => {
  await page.goto("/?shore=sunnycove&season=midwinter");
  await closeModals(page);
  const [mood, isNight] = await page.evaluate(() => [PI.fx.Music.next || PI.fx.Music.mood, document.getElementById("colony").classList.contains("night")]);
  expect(mood.bpm).toBe(isNight ? 70 : 78);   // the scene follows the real clock
  expect(mood.bells).toBe(1);
  expect(mood.name).toMatch(/sunny/);
  const night = await page.evaluate(() => { PI.fx.Music.setMood({ night: true, shore: "blizzard" }); return PI.fx.Music.label(); });
  expect(night).toBe("night-time snowed-in");
  // Playing through a change of mood keeps going without errors
  await page.locator("#tabbtn-stats").click();
  await expect.poll(() => page.evaluate(() => PI.fx.Music.on)).toBe(true);
  await page.evaluate(() => PI.fx.Music.setMood({ shore: "aurorafields", season: "midwinter" }));
  await expect.poll(() => page.evaluate(() => PI.fx.Music.mood.name), { timeout: 8000 }).toBe("dreamy midwinter");
});

test("residents can be named: tags in the scene, saved, cleaned and remembered", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  await page.evaluate(() => { const g = window.penguinIdle; g.state.buildings.chick = 12; g.engine.recompute(); g.engine.bus.emit("structure"); });
  await page.keyboard.press("4");   // Home
  const first = page.locator('#friendNames input[data-slot="0"]');
  await first.fill("  Pip  ");
  await first.press("Enter");
  await expect(first).toHaveValue("Pip");
  expect(await state(page, () => window.penguinIdle.state.names)).toEqual(["Pip"]);
  await expect(page.locator("#waddlers .w-tag").first()).toHaveText("Pip");
  await page.locator('#friendNames input[data-slot="2"]').fill("<i>Waddles</i>");
  await page.locator('#friendNames input[data-slot="2"]').press("Enter");
  expect(await state(page, () => window.penguinIdle.state.names)).toEqual(["Pip", "", "iWaddles/i"]);
  // One tag per penguin in the scene; unnamed ones keep their cute default, and nobody else is called Pip
  const shown = await page.locator("#waddlers .waddler").count();
  const now = await state(page, () => window.penguinIdle.state.defaultNames);
  expect(now.filter((n, i) => i !== 0 && i !== 2)).not.toContain("Pip");
  await expect(page.locator("#waddlers .w-tag")).toHaveText(["Pip", now[1], "iWaddles/i", ...now.slice(3)].slice(0, shown));
  const back = await page.evaluate(() => { const g = window.penguinIdle; g.engine.checkAchievements(); return [g.decodeSave(g.encodeSave()).names, g.state.achievements.includes("name_1")]; });
  expect(back).toEqual([["Pip", "", "iWaddles/i"], true]);
  await first.fill("");
  await first.press("Enter");
  expect(await state(page, () => window.penguinIdle.state.names)).toEqual(["", "", "iWaddles/i"]);
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

test("@touch tapping a prop in the scene shows what it earns, with a Buy button", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  await page.evaluate(() => { const g = window.penguinIdle; Object.assign(g.state.buildings, { chick: 3, trawler: 2 }); g.state.fish = 1e12; g.engine.recompute(); g.engine.bus.emit("structure"); });
  await page.locator('#props [data-id="trawler"]').tap({ force: true });
  await expect(page.locator("#infoSheet")).toBeVisible();
  await expect(page.locator("#infoSheet")).toContainText("Lantern Boat");
  await expect(page.locator("#infoSheet")).toContainText(/That's (\d+%|under 1%) of the colony's catch/);
  await page.locator("#sheetBuy").tap();
  expect(await state(page, () => window.penguinIdle.state.buildings.trawler)).toBe(3);
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

test("toasts appear on the left, and clicking one dismisses it", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  await page.evaluate(() => { const g = window.penguinIdle; g.state.fish = 1e6; g.state.buildings.chick = 9; g.engine.recompute(); g.engine.buyBuilding("chick", 1); });
  const ms = page.locator("#toasts .toast", { hasText: "Milestone!" });
  await expect(ms).toBeVisible();
  const box = await ms.boundingBox();
  expect(box.x).toBeLessThan(page.viewportSize().width / 2);
  await ms.click();
  await expect(ms).toHaveCount(0, { timeout: 1000 });
});

test("next feather target sits past the feathers already earned", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  // An earlier run earned 5 feathers at a higher rate; this run's lifetime alone is only worth 2
  const r = await page.evaluate(() => {
    const g = window.penguinIdle; g.state.lifetimeFish = 8e12; g.state.feathersEarned = 5; g.engine.recompute();
    return { at: g.engine.nextFeatherAt(), pend: g.engine.pendingFeathers() };
  });
  expect(r.pend).toBe(0);
  expect(r.at).toBeCloseTo(216e12, -10);   // 6 feathers = 6³ × 1e12
});

test("Foreman Waddles buys cheaper members while the best value is far off", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  // A Fisher is the better value but out of reach, and nothing is earning, so saving up would take forever
  await page.evaluate(() => {
    const g = window.penguinIdle; const s = g.state;
    s.buildings.chick = 1; s.fish = 60; s.feathersEarned = 0; s.helpers.foreman = true; g.engine.recompute();
  });
  await expect.poll(() => state(page, () => window.penguinIdle.state.buildings.chick), { timeout: 5000 }).toBeGreaterThan(1);
  expect(await state(page, () => window.penguinIdle.state.buildings.fisher || 0)).toBe(0);
});

test("residents come with cute default names, and the dice picks another", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  await page.evaluate(() => { const g = window.penguinIdle; g.state.buildings.chick = 12; g.engine.recompute(); g.engine.bus.emit("structure"); });
  const d = await state(page, () => window.penguinIdle.state.defaultNames);
  expect(d).toHaveLength(6);
  expect(new Set(d).size).toBe(6);
  const cute = await page.evaluate(() => PI.data.CUTE_NAMES);
  d.forEach(n => expect(cute).toContain(n));
  // They show as tags straight away, and stay the same after a reload
  await expect(page.locator("#waddlers .w-tag")).toHaveText(d.slice(0, await page.locator("#waddlers .waddler").count()));
  await page.evaluate(() => window.penguinIdle.engine.save());
  await page.reload();
  await closeModals(page);
  expect(await state(page, () => window.penguinIdle.state.defaultNames)).toEqual(d);
  // Defaults don't count as naming anyone
  expect(await page.evaluate(() => { window.penguinIdle.engine.checkAchievements(); return window.penguinIdle.state.achievements.includes("name_1"); })).toBe(false);
  // The empty box shows the default; the dice gives a new name that isn't already taken
  await page.keyboard.press("4");   // Home
  const first = page.locator('#friendNames input[data-slot="0"]');
  await expect(first).toHaveAttribute("placeholder", d[0]);
  await expect(first).toHaveValue("");
  await page.locator('[data-roll="0"]').click();
  const rolled = await first.inputValue();
  expect(cute).toContain(rolled);
  expect(d).not.toContain(rolled);
  expect(await state(page, () => window.penguinIdle.state.names[0])).toBe(rolled);
  // Clearing it gives the default back
  await first.fill("");
  await first.press("Enter");
  await expect(page.locator("#waddlers .w-tag").first()).toHaveText(d[0]);
});

test("napping shows a dark, low-power screen that keeps fishing, and any key wakes it", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  await page.evaluate(() => { const g = window.penguinIdle; g.state.buildings.fisher = 50; g.state.fish = 1e9; g.engine.recompute(); g.engine.bus.emit("structure"); });
  expect(await state(page, () => window.penguinIdle.loopMs)).toBe(50);
  await page.locator("#napBtn").click();
  await expect(page.locator("#napScreen")).toBeVisible();
  await expect(page.locator("#layout")).toBeHidden();
  await expect(page.locator("#topbar")).toBeHidden();
  await expect(page.locator("#napSvg .p-eyes")).toHaveCount(1);   // the big penguin, fast asleep
  expect(await state(page, () => window.penguinIdle.loopMs)).toBe(1000);
  expect(await state(page, () => PI.fx.Particles.snowWanted())).toBe(false);
  // The colony keeps fishing, and the nap screen keeps count
  const before = await state(page, () => window.penguinIdle.state.fish);
  await page.waitForTimeout(2200);
  expect(await state(page, () => window.penguinIdle.state.fish)).toBeGreaterThan(before);
  await expect(page.locator("#napFish")).toHaveText(await state(page, () => window.penguinIdle.fmt(Math.floor(window.penguinIdle.state.fish))));
  expect(await state(page, () => window.penguinIdle.state.stats.napSeconds)).toBeGreaterThan(1);
  // Any key wakes it, and only wakes it: B doesn't also buy upgrades
  const ups = await state(page, () => window.penguinIdle.state.upgrades.length);
  await page.keyboard.press("b");
  await expect(page.locator("#napScreen")).toBeHidden();
  await expect(page.locator("#layout")).toBeVisible();
  expect(await state(page, () => window.penguinIdle.state.upgrades.length)).toBe(ups);
  expect(await state(page, () => window.penguinIdle.loopMs)).toBe(50);
  // Z naps, a tap wakes
  await page.keyboard.press("z");
  await expect(page.locator("#napScreen")).toBeVisible();
  await page.locator("#napScreen").click({ position: { x: 10, y: 10 } });
  await expect(page.locator("#napScreen")).toBeHidden();
});

test("the colony naps by itself after the chosen idle time", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  await page.keyboard.press("6");
  await page.locator("#optAutoNap").selectOption("5");
  expect(await state(page, () => window.penguinIdle.state.settings.autoNap)).toBe(5);
  await page.waitForTimeout(1500);
  expect(await state(page, () => window.penguinIdle.nap.on)).toBe(false);   // not idle long enough yet
  await page.evaluate(() => window.penguinIdle.nap.idleFor(5 * 60000 + 1000));
  await expect(page.locator("#napScreen")).toBeVisible();
  await page.locator("#napWake").click();
  await expect(page.locator("#napScreen")).toBeHidden();
});

test("battery saver rests the weather and slows the loop, and is remembered", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  await page.keyboard.press("6");
  await page.locator("#optBatterySaver").selectOption("on");
  await expect(page.locator("html")).toHaveClass(/power-saver/);
  expect(await state(page, () => window.penguinIdle.loopMs)).toBe(250);
  expect(await state(page, () => PI.fx.Particles.snowWanted())).toBe(false);
  await page.evaluate(() => window.penguinIdle.save());
  await page.reload();
  await closeModals(page);
  await expect(page.locator("html")).toHaveClass(/power-saver/);
  expect(await state(page, () => window.penguinIdle.loopMs)).toBe(250);
  await page.keyboard.press("6");
  await page.locator("#optBatterySaver").selectOption("off");
  await expect(page.locator("html")).not.toHaveClass(/power-saver/);
  expect(await state(page, () => window.penguinIdle.loopMs)).toBe(50);
});

test("an hour of napping earns a memory and the Nightcap", async ({ page }) => {
  await page.goto("/");
  await closeModals(page);
  const got = await page.evaluate(() => {
    const g = window.penguinIdle;
    const before = g.engine.cosmeticUnlocked("hat", "nightcap");
    g.state.stats.napSeconds = 3600;
    g.engine.checkAchievements();
    return { before, mem: g.state.achievements.includes("nap_hour"), cap: g.engine.cosmeticUnlocked("hat", "nightcap") };
  });
  expect(got).toEqual({ before: false, mem: true, cap: true });
});
