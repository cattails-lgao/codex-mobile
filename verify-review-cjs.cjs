const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://127.0.0.1:4173";
const THREAD = "01a02214-e7d5-73f1-ae7f-732424dc5630";
const OUT = path.join(__dirname, "output", "playwright");
fs.mkdirSync(OUT, { recursive: true });

const DARK_KEY = "codex-web-local.dark-mode.v1";

async function waitReviewBtn(page, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const n = await page.locator(".rgp-review").count();
    if (n > 0) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

function isReviewOpen(page) {
  return page.evaluate(() => {
    const btn = document.querySelector(".rgp-review");
    const label = btn?.innerText ?? "";
    return { modal: !!document.querySelector(".review-pane"), openLabel: label.includes("(Open)") || label.includes("（打开）") };
  });
}

async function waitDiffLines(page, timeout) {
  const dl = Date.now() + timeout;
  while (Date.now() < dl) {
    const ok = await page.evaluate(() => document.querySelectorAll(".review-pane-line").length > 0);
    if (ok) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function lastDiffLineVisible(page) {
  return page.evaluate(() => {
    const d = document.querySelector(".review-pane-diff");
    if (!d || !document.querySelector(".review-pane-line")) return null;
    d.scrollTop = d.scrollHeight;
    const nodes = document.querySelectorAll(".review-pane-line");
    const last = nodes[nodes.length - 1];
    const dR = d.getBoundingClientRect(), lR = last.getBoundingClientRect();
    return {
      containerBottom: Math.round(dR.bottom),
      lastBottom: Math.round(lR.bottom),
      lastVisible: Math.round(lR.bottom) <= Math.round(dR.bottom) + 1,
      diffScrollable: d.scrollHeight > d.clientHeight,
      scrollHeight: d.scrollHeight,
      clientHeight: d.clientHeight,
    };
  });
}

async function openReview(browser, opts) {
  const ctx = await browser.newContext({ viewport: opts.viewport });
  // seed theme before app loads
  await ctx.addInitScript(([k, v]) => {
    try { localStorage.setItem(k, v); } catch {}
  }, [DARK_KEY, opts.dark ? "dark" : "light"]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/thread/${THREAD}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  // The review toggle button lives in the git right-panel header.
  if (!(await waitReviewBtn(page, 8000))) {
    // Panel is likely closed on this width. Open it via the header toggle, but
    // only if the review button is still absent (the toggle would otherwise CLOSE it).
    const toggle = page.locator("button.content-header-right-panel-toggle").first();
    if (await toggle.count()) {
      await toggle.click({ force: true });
      await page.waitForTimeout(1000);
    }
    const gitTab = page.getByRole("tab", { name: "Git" });
    if (await gitTab.count()) {
      const selected = await gitTab.first().getAttribute("aria-selected");
      if (selected !== "true") {
        await gitTab.first().click({ force: true });
        await page.waitForTimeout(1000);
      }
    }
    await waitReviewBtn(page, 8000);
  }

  // Open the modal (only if not already open).
  const paneVisible = await page.evaluate(() => !!document.querySelector(".review-pane"));
  if (!paneVisible) {
    await page.evaluate(() => {
      const b = document.querySelector(".rgp-review");
      if (b) b.click();
    });
  }
  // wait for modal (async component) to mount
  await page.waitForFunction(() => !!document.querySelector(".review-pane"), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return { ctx, page };
}

function readPose(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: c.position, z: c.zIndex, radius: c.borderRadius, bg: c.backgroundColor };
  }, sel);
}

async function run() {
  const browser = await chromium.launch();
  const results = [];

  // 1) Desktop 768x1024, light
  {
    const { ctx, page } = await openReview(browser, { viewport: { width: 768, height: 1024 }, dark: false });
    await page.waitForTimeout(1500);
    const vw = await page.evaluate(() => window.innerWidth);
    const backdrop = await readPose(page, ".review-pane-backdrop");
    const pane = await readPose(page, ".review-pane");
    const paneClass = await page.evaluate(() => document.querySelector(".review-pane")?.className ?? "");
    const open = await isReviewOpen(page);
    const bodyDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    await waitDiffLines(page, 12000);
    const scrolled = await lastDiffLineVisible(page);
    const f = "review-768-light.png";
    await page.screenshot({ path: path.join(OUT, f) });
    results.push({ file: f, vw, paneClass, opened: open, backdrop, pane, scrolled, dark: false, bodyDark });
    await ctx.close();
  }

  // 2) Mobile 375x812, light
  {
    const { ctx, page } = await openReview(browser, { viewport: { width: 375, height: 812 }, dark: false });
    await page.waitForTimeout(1500);
    const vw = await page.evaluate(() => window.innerWidth);
    const backdrop = await readPose(page, ".review-pane-backdrop");
    const pane = await readPose(page, ".review-pane");
    const paneClass = await page.evaluate(() => document.querySelector(".review-pane")?.className ?? "");
    const open = await isReviewOpen(page);
    const bodyDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    await waitDiffLines(page, 12000);
    const scrolled = await lastDiffLineVisible(page);
    const f = "review-375-light.png";
    await page.screenshot({ path: path.join(OUT, f) });
    results.push({ file: f, vw, paneClass, opened: open, backdrop, pane, scrolled, dark: false, bodyDark });
    await ctx.close();
  }

  // 3) Mobile 375x812, dark
  {
    const { ctx, page } = await openReview(browser, { viewport: { width: 375, height: 812 }, dark: true });
    await page.waitForTimeout(1500);
    const vw = await page.evaluate(() => window.innerWidth);
    const backdrop = await readPose(page, ".review-pane-backdrop");
    const pane = await readPose(page, ".review-pane");
    const paneClass = await page.evaluate(() => document.querySelector(".review-pane")?.className ?? "");
    const open = await isReviewOpen(page);
    const bodyDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    await waitDiffLines(page, 12000);
    const scrolled = await lastDiffLineVisible(page);
    const f = "review-375-dark.png";
    await page.screenshot({ path: path.join(OUT, f) });
    results.push({ file: f, vw, paneClass, opened: open, backdrop, pane, scrolled, dark: true, bodyDark });
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });