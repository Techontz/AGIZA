// Visual check: screenshots of pages at phone, tablet, laptop and desktop widths.
// usage: node scripts/shots.mjs <outDir> <path> [path...]   (BASE_URL defaults to http://localhost:3200)
import { chromium } from "@playwright/test";

const [outDir, ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3200";
const sizes = (process.env.SIZES ?? "mobile,desktop").split(",");
const VIEWPORTS = { mobile: [390, 844], tablet: [820, 1180], laptop: [1280, 800], desktop: [1440, 900] };
const full = process.env.FULL !== "0";

const browser = await chromium.launch();
for (const size of sizes) {
  const [width, height] = VIEWPORTS[size];
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (process.env.STATE) await context.addCookies(JSON.parse(process.env.STATE));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const path of paths) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const name = `${outDir}/${size}${path.replace(/[^a-z0-9]+/gi, "_") || "_home"}.png`;
    await page.screenshot({ path: name, fullPage: full });
    console.log(`${size} ${path} → ${name}${overflow > 0 ? `  ⚠ horizontal overflow ${overflow}px` : ""}`);
  }
  if (errors.length) console.log(`${size} console errors:\n  ${errors.join("\n  ")}`);
  await context.close();
}
await browser.close();
