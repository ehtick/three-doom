import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const options = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser;
try {
  browser = await chromium.launch(options);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.DOOM_URL ?? 'http://127.0.0.1:8092/', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => window.renderer !== undefined, { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const menu = await import('/src/m_menu.js');
    const { KEY_ESCAPE, KEY_UPARROW } = await import('/src/doomdef.js');

    menu.M_ClearMenus();
    let infoKey = null;
    menu.M_StartMessage('info', (key) => { infoKey = key; }, false);
    const infoOpened = doomstat.menuactive;
    const infoConsumed = menu.M_Responder({ type: 0, data1: KEY_UPARROW });
    const infoClosed = doomstat.menuactive === false;

    menu.M_StartControlPanel();
    let promptKey = null;
    menu.M_StartMessage('confirm', (key) => { promptKey = key; }, true);
    const unsupportedConsumed = menu.M_Responder({ type: 0, data1: 13 });
    const promptStayedOpen = doomstat.menuactive === true && promptKey === null;
    const accepted = menu.M_Responder({ type: 0, data1: 0x79 });
    const promptClosed = doomstat.menuactive === false;

    menu.M_StartMessage('cancel', null, true);
    const cancelConsumed = menu.M_Responder({ type: 0, data1: KEY_ESCAPE });
    const cancelClosed = doomstat.menuactive === false;

    menu.M_StartControlPanel();
    menu.M_StartMessage('stop', null, true);
    menu.M_StopMessage();
    const stopRestored = doomstat.menuactive === true;
    menu.M_ClearMenus();

    return {
      infoOpened, infoConsumed, infoKey, infoClosed,
      unsupportedConsumed, promptStayedOpen, accepted, promptKey, promptClosed,
      cancelConsumed, cancelClosed, stopRestored,
    };
  });
  const expected = {
    infoOpened: true, infoConsumed: true, infoKey: 0xad, infoClosed: true,
    unsupportedConsumed: false, promptStayedOpen: true,
    accepted: true, promptKey: 0x79, promptClosed: true,
    cancelConsumed: true, cancelClosed: true, stopRestored: true,
  };
  if (JSON.stringify(result) !== JSON.stringify(expected) || errors.length !== 0) {
    throw new Error(JSON.stringify({ result, expected, errors }));
  }
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
