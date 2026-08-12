// Real-WAD pixel comparison for m_menu.c:M_Drawer modal-message rendering.

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
  await page.goto(process.env.DOOM_URL ?? 'http://127.0.0.1:8134/', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => window.renderer !== undefined, { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const menu = await import('/src/m_menu.js');
    const doomstat = await import('/src/doomstat.js');
    const { KEY_F10 } = await import('/src/doomdef.js');
    const { HU_FONTSTART, HU_GetFont } = await import('/src/hu_font.js');
    const loop = await import('/src/d_loop.js');
    loop.D_DoomRafLoop.stop();

    function canvas() {
      const value = document.createElement('canvas');
      value.width = 320;
      value.height = 200;
      return value;
    }
    function glyph(font, character) {
      let code = character.charCodeAt(0);
      if (code >= 97 && code <= 122) code -= 32;
      const index = code - HU_FONTSTART;
      return index >= 0 && index < font.length ? font[index] : null;
    }
    function drawReference(ctx, text, font) {
      const lineHeight = font[0].h;
      const lines = text.split('\n');
      let y = 100 - Math.trunc((lineHeight * lines.length) / 2);
      for (const line of lines) {
        let width = 0;
        for (const character of line) width += glyph(font, character)?.w ?? 4;
        let x = 160 - Math.trunc(width / 2);
        for (const character of line) {
          const patch = glyph(font, character);
          if (patch === null) { x += 4; continue; }
          if (x + patch.w > 320) break;
          ctx.drawImage(
            patch.canvas,
            x - patch.leftoffset,
            y - patch.topoffset,
            patch.w,
            patch.h,
          );
          x += patch.w;
        }
        y += lineHeight;
      }
    }
    function mismatchCount(a, b) {
      const left = a.getContext('2d').getImageData(0, 0, 320, 200).data;
      const right = b.getContext('2d').getImageData(0, 0, 320, 200).data;
      let count = 0;
      for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) count++;
      return count;
    }
    function opaquePixels(value) {
      const data = value.getContext('2d').getImageData(0, 0, 320, 200).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) count++;
      return count;
    }

    const text = 'are you sure?\npress y or n';
    menu.M_ClearMenus();
    menu.M_StartControlPanel(); // underlying M_DOOM/menu must not be drawn
    menu.M_StartMessage(text, null, true);
    const actual = canvas();
    menu.M_Drawer(actual.getContext('2d'), 0, 0, 320, 200);
    const expected = canvas();
    drawReference(expected.getContext('2d'), text, HU_GetFont());
    const result = {
      mismatch: mismatchCount(actual, expected),
      opaque: opaquePixels(actual),
    };
    menu.M_StopMessage();
    menu.M_ClearMenus();

    // The C selector reaches its compiled-table debug entry on gametic 19.
    // Exercise F10 so this also proves m_menu reads doomstat's live binding.
    doomstat.set_gametic(19);
    menu.M_Responder({ type: 0, data1: KEY_F10 });
    const quitText = 'THIS IS NO MESSAGE!\nPage intentionally left blank.' +
      '\n\n(Press y or click to quit)';
    const actualQuit = canvas();
    menu.M_Drawer(actualQuit.getContext('2d'), 0, 0, 320, 200);
    const expectedQuit = canvas();
    drawReference(expectedQuit.getContext('2d'), quitText, HU_GetFont());
    result.quitMismatch = mismatchCount(actualQuit, expectedQuit);
    result.quitOpaque = opaquePixels(actualQuit);
    menu.M_StopMessage();
    menu.M_ClearMenus();
    return result;
  });

  if (result.mismatch !== 0 || result.opaque === 0 ||
      result.quitMismatch !== 0 || result.quitOpaque === 0 || errors.length !== 0) {
    throw new Error(JSON.stringify({ result, errors }));
  }
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
