const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = "http://127.0.0.1:4173";
const THREAD = "01a02214-e7d5-73f1-ae7f-732424dc5630";
const DARK_KEY = "codex-web-local.dark-mode.v1";
const OUT = path.join(__dirname, "output", "playwright");
fs.mkdirSync(OUT, { recursive: true });

async function waitBtn(page, timeout) {
  const dl = Date.now() + timeout;
  while (Date.now() < dl) { if (await page.locator(".rgp-review").count()) return true; await page.waitForTimeout(300); }
  return false;
}

async function openReview(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [DARK_KEY, "light"]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/thread/${THREAD}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  if (!(await waitBtn(page, 8000))) {
    const togg = page.locator("button.content-header-right-panel-toggle").first();
    if (await togg.count()) { await togg.click({ force: true }); await page.waitForTimeout(1000); }
    await waitBtn(page, 8000);
  }
  if (!(await page.evaluate(() => !!document.querySelector(".review-pane")))) {
    await page.evaluate(() => { const b = document.querySelector(".rgp-review"); if (b) b.click(); });
  }
  await page.waitForFunction(() => !!document.querySelector(".review-pane"), null, { timeout: 10000 }).catch(() => {});
  // wait for a real file to be selected (diff content present)
  await page.waitForFunction(() => document.querySelector(".review-pane-diff") && document.querySelector(".review-pane-file-title"), null, { timeout: 15000 }).catch(() => {});
  // Keep the default workspace/unstaged view: the untracked sample file shows
  // as an added file at the repo root, so no scope switch is needed.
  await page.waitForTimeout(1000);
  return { ctx, page };
}

// Real scroll check for the currently selected file.
async function inspectFile(page) {
  return page.evaluate(() => {
    const d = document.querySelector(".review-pane-diff");
    if (!d) return { ok: false, reason: "no-diff" };
    const lines = document.querySelectorAll(".review-pane-line");
    if (!lines.length) return { ok: false, reason: "no-lines", scrollable: d.scrollHeight > d.clientHeight + 1, scrollHeight: d.scrollHeight, clientHeight: d.clientHeight };
    const last = lines[lines.length - 1];
    const lR = last.getBoundingClientRect();
    const dR = d.getBoundingClientRect();
    const scrollable = d.scrollHeight > d.clientHeight + 1;
    const visibleAtTop = lR.bottom <= dR.bottom + 1 && lR.top >= dR.top - 1;
    d.scrollTop = d.scrollHeight;
    const lR2 = last.getBoundingClientRect();
    const dR2 = d.getBoundingClientRect();
    const visibleAtBottom = lR2.bottom <= dR2.bottom + 1 && lR2.top >= dR2.top - 1;
    return {
      ok: true,
      file: document.querySelector(".review-pane-file-title")?.textContent?.trim() ?? null,
      scrollable,
      scrollHeight: d.scrollHeight,
      clientHeight: d.clientHeight,
      maxScroll: d.scrollHeight - d.clientHeight,
      reachedBottom: d.scrollTop,
      lastLineText: (last.textContent || "").trim().slice(0, 40),
      visibleAtTop,
      visibleAtBottom,
    };
  });
}

// Synthetic probe: append a tall element into the diff container to confirm
// the container is height-constrained (grid fix) and scrolls to its true bottom.
async function syntheticProbe(page) {
  return page.evaluate(async () => {
    const d = document.querySelector(".review-pane-diff");
    if (!d) return null;
    // Identify the real scroll container for the diff content.
    function findScroller(el) {
      let cur = el;
      while (cur && cur !== document.body) {
        const cs = getComputedStyle(cur);
        const overY = cs.overflowY;
        if ((overY === "auto" || overY === "scroll" || overY === "overlay") && cur.scrollHeight > cur.clientHeight + 1) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    }
    const scroller = findScroller(d) || d;

    const probe = document.createElement("div");
    probe.setAttribute("data-test", "overflow");
    probe.style.height = "4000px";
    probe.style.width = "1px";
    probe.style.flex = "0 0 auto";
    const marker = document.createElement("div");
    marker.setAttribute("data-test", "bottommark");
    marker.style.height = "40px";
    marker.style.background = "lime";
    probe.appendChild(marker);
    d.appendChild(probe);

    const clientHeight = scroller.clientHeight;
    const scrollHeight = scroller.scrollHeight;
    scroller.scrollTop = scroller.scrollHeight;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const mR = marker.getBoundingClientRect();
    const sR = scroller.getBoundingClientRect();
    const bottomMarkerVisible = mR.bottom <= sR.bottom + 1 && mR.top >= sR.top - 1;
    const delta = Math.round(sR.bottom - mR.bottom);
    const scrollerIsDiff = scroller === d;
    const overflowY = getComputedStyle(scroller).overflowY;
    const scrolledTo = scroller.scrollTop;
    probe.remove();
    return {
      scrollerIsDiff,
      scrollerTag: scroller.className || scroller.tagName,
      overflowY,
      clientHeight,
      scrollHeight,
      maxScroll: scrollHeight - clientHeight,
      scrollTopAssigned: scroller.scrollHeight,
      scrolledTo,
      bottomMarkerVisible,
      deltaBelowContainerBottom: delta,
    };
  });
}

// Expand every folder node, then select the sample file and inspect its real content.
async function selectSampleAndInspect(page, scope) {
  const scopeSel = scope === "sheet" ? ".review-pane-sheet " : ".review-pane ";
  // expand folders until stable
  for (let i = 0; i < 5; i++) {
    const collapsed = await page.evaluate((sel) => {
      let clicked = false;
      document.querySelectorAll(sel + ".review-pane-tree-folder").forEach((f) => {
        if (f.getAttribute("data-expanded") !== "true") { f.click(); clicked = true; }
      });
      return clicked;
    }, scopeSel);
    if (!collapsed) break;
    await page.waitForTimeout(500);
  }
  const found = await page.evaluate((sel) => {
    const b = [...document.querySelectorAll(sel + ".review-pane-tree-file")].find((x) => (x.getAttribute("title") || "").includes("scroll-verify-sample.md"));
    if (b) { b.click(); return true; }
    return false;
  }, scopeSel);
  if (!found) return { ok: false, reason: "sample-not-found" };
  await page.waitForTimeout(1200);
  return inspectFile(page);
}

async function run() {
  const browser = await chromium.launch();

  // Open pane (default workspace/unstaged view), select the big untracked sample file.
  {
    await openReview(browser, { width: 768, height: 1024 }).then(({ ctx, page }) => {
      return (async () => {
        const sample = await selectSampleAndInspect(page, "main");
        console.log("DESKTOP 768 · real sample-file scroll:");
        console.log(JSON.stringify(sample, null, 2));
        await page.screenshot({ path: path.join(OUT, "review-scroll-desktop.png") });
        await ctx.close();
      })();
    });
  }

  // Mobile: open sheet, select sample, verify real scroll.
  {
    await openReview(browser, { width: 375, height: 812 }).then(async ({ ctx, page }) => {
      async function mobileSel() {
        const s = page.locator(".review-pane-mobile-files-button").first();
        if (await s.count()) { await s.click({ force: true }); await page.waitForTimeout(800); }
        return selectSampleAndInspect(page, "sheet");
      }
      const sample = await mobileSel();
      console.log("MOBILE 375 · real sample-file scroll:");
      console.log(JSON.stringify(sample, null, 2));
      await page.screenshot({ path: path.join(OUT, "review-scroll-mobile.png") });
      await ctx.close();
    });
  }

  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });