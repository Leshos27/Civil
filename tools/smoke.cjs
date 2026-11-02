// Дымовой тест в настоящем браузере: телефон + ПК, скриншоты в dist/shots.
// Запуск: node tools/smoke.cjs
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const url = 'file://' + path.resolve(__dirname, '../dist/index.html');
const out = path.resolve(__dirname, '../dist/shots');
fs.mkdirSync(out, { recursive: true });

async function run(name, ctxOpts, steps) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForTimeout(1200);
  await steps(page, (n) => page.screenshot({ path: `${out}/${name}-${n}.png` }));
  await browser.close();
  console.log(`${name}: ${errors.length ? 'ОШИБКИ:\n  ' + errors.join('\n  ') : 'без ошибок'}`);
  return errors.length;
}

(async () => {
  let fails = 0;
  const flow = async (page, shot, mobile) => {
    await shot('1-menu');
    await page.click('[data-act="setup"]');
    await page.waitForTimeout(300);
    await shot('2-setup');
    await page.click('[data-act="start"]');
    await page.waitForTimeout(700);
    await shot('3-start');
    await page.click('[data-act="found"]');
    await page.waitForTimeout(600);
    await shot('4-city');
    await page.click('[data-act="build"][data-id="warrior"]');
    await page.click('[data-act="enqueue"][data-id="monument"]');
    await page.waitForTimeout(200);
    if (mobile) await page.click('[data-act="closeSheet"]');
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.click('[data-act="main"]'); // наука
    await page.waitForTimeout(300);
    await shot('5-tech');
    await page.click('[data-act="research"][data-id="writing"]');
    await page.click('[data-act="closeModal"]');
    // играем 25 ходов: пропуская отряды и разрешая решения
    for (let t = 0; t < 25; t++) {
      for (let k = 0; k < 12; k++) {
        const modal = await page.$('#modal:not([hidden]) .choice:not([disabled]), #modal:not([hidden]) [data-act="peaceAnswer"]');
        if (modal) { await modal.evaluate((e) => e.click()); await page.waitForTimeout(80); continue; }
        const label = await page.textContent('#b-main .t');
        if (label === 'Конец хода') break;
        if (label === 'Наука') { await page.click('[data-act="main"]'); await page.waitForTimeout(100); const av = await page.$('.tech:not(.known):not(.locked)'); if (av) await av.evaluate((e) => e.click()); await page.evaluate(() => document.querySelector('[data-act="closeModal"]')?.click()); continue; }
        if (label === 'Производство') { await page.click('[data-act="main"]'); await page.waitForTimeout(100); const b = await page.$('.bi:not([disabled])'); if (b) await b.evaluate((e) => e.click()); await page.evaluate(() => document.querySelector('[data-act="closeSheet"]')?.click()); continue; }
        await page.evaluate(() => document.querySelector('[data-act="forceEnd"]')?.click());
        break;
      }
      const label = await page.textContent('#b-main .t');
      if (label === 'Конец хода') await page.evaluate(() => document.querySelector('[data-act="main"]').click());
      await page.waitForTimeout(250);
      if (await page.$('#screen .result')) break;
    }
    await page.waitForTimeout(400);
    await shot('6-turn25');
    await page.click('[data-act="diplo"]');
    await page.waitForTimeout(200);
    await shot('7-diplo');
    await page.click('[data-act="closeModal"]');
    const city = await page.evaluate(() => 1);
    void city;
  };
  fails += await run('phone', { ...devices['iPhone 13'], reducedMotion: 'reduce' }, (p, s) => flow(p, s, true));
  fails += await run('desktop', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, (p, s) => flow(p, s, false));
  process.exit(fails ? 1 : 0);
})();
