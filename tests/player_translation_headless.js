import * as THREE from 'three';
import {
  R_MakeDoomSpriteMaterial,
  R_MakeIndexedTexture,
  R_SetPaletteIndex,
  R_ShaderInit,
} from '../src/r_shader.js';
import {
  R_TranslatePlayerPaletteIndex,
  SPRITE_SHADOW_PALETTE_INDEX,
} from '../src/r_sprite_logic.js';
import { V_InitPlaypal } from '../src/v_palette.js';
import { W_CacheLumpName, W_InitMultipleFiles } from '../src/w_wad.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function playpalRGBA(playpal) {
  const rgba = new Uint8Array(14 * 256 * 4);
  for (let palette = 0; palette < 14; palette++) {
    for (let index = 0; index < 256; index++) {
      const source = palette * 768 + index * 3;
      const target = palette * 1024 + index * 4;
      rgba[target + 0] = playpal[source + 0];
      rgba[target + 1] = playpal[source + 1];
      rgba[target + 2] = playpal[source + 2];
      rgba[target + 3] = 255;
    }
  }
  return rgba;
}

async function run() {
  const wad = await fetch('../doom1.wad').then((response) => response.arrayBuffer());
  W_InitMultipleFiles([{ name: 'doom1.wad', buffer: wad }]);
  const playpal = W_CacheLumpName('PLAYPAL', 0);
  const colormaps = W_CacheLumpName('COLORMAP', 0);
  V_InitPlaypal(playpal);
  R_ShaderInit(playpalRGBA(playpal), colormaps);

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(1, 1, false);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  const sourcePixels = new Uint8Array([0x70]);
  const texture = R_MakeIndexedTexture(sourcePixels, new Uint8Array([255]), 1, 1);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  const material = R_MakeDoomSpriteMaterial(texture);
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2, 2, 1);
  material.uniforms.center.value = sprite.center;
  scene.add(sprite);

  // A non-identity row proves that the translation table is applied before
  // COLORMAP instead of translating its output.
  const row = 12;
  material.uniforms.fixedColormap.value = row;
  material.uniforms.fullbright.value = false;
  material.uniforms.shadow.value = false;
  material.uniforms.opacity.value = 1;
  const pixel = new Uint8Array(4);

  function renderIndex(sourceIndex, translation, paletteIndex, shadow = false) {
    texture.image.data[0] = sourceIndex;
    texture.needsUpdate = true;
    material.uniforms.playerTranslation.value = translation;
    material.uniforms.shadow.value = shadow;
    material.uniforms.opacity.value = 1;
    R_SetPaletteIndex(paletteIndex);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
    return Uint8Array.from(pixel);
  }

  const sources = [0x70, 0x77, 0x7f, 0x20, 0x6f, 0x80];
  for (const palette of [0, 8, 13]) {
    for (let translation = 0; translation < 4; translation++) {
      for (const source of sources) {
        const actual = renderIndex(source, translation, palette);
        const translated = R_TranslatePlayerPaletteIndex(source, translation);
        const mapped = colormaps[row * 256 + translated];
        const expected = palette * 768 + mapped * 3;
        assertEquals(actual[0], playpal[expected + 0], `p${translation + 1} source ${source} palette ${palette} red`);
        assertEquals(actual[1], playpal[expected + 1], `p${translation + 1} source ${source} palette ${palette} green`);
        assertEquals(actual[2], playpal[expected + 2], `p${translation + 1} source ${source} palette ${palette} blue`);
        assertEquals(actual[3], 255, `p${translation + 1} source ${source} palette ${palette} alpha`);
      }
    }
  }

  // MF_SHADOW's early shader return must ignore both player translation and
  // COLORMAP. Use opaque shadow output here so readback remains exact.
  for (const translation of [0, 3]) {
    const actual = renderIndex(0x70, translation, 8, true);
    const expected = 8 * 768 + SPRITE_SHADOW_PALETTE_INDEX * 3;
    assertEquals(actual[0], playpal[expected + 0], `shadow translation ${translation} red`);
    assertEquals(actual[1], playpal[expected + 1], `shadow translation ${translation} green`);
    assertEquals(actual[2], playpal[expected + 2], `shadow translation ${translation} blue`);
    assertEquals(actual[3], 255, `shadow translation ${translation} alpha`);
  }

  const glError = renderer.getContext().getError();
  assertEquals(glError, renderer.getContext().NO_ERROR, 'WebGL error state');
  const programCount = renderer.info.programs?.length ?? 0;
  if (programCount < 1) throw new Error('sprite shader did not compile');

  material.dispose();
  texture.dispose();
  target.dispose();
  renderer.dispose();
  return {
    ok: true,
    players: 4,
    sources: sources.length,
    palettes: 3,
    shadowCases: 2,
    programCount,
  };
}

run().then((result) => {
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
}).catch((error) => {
  const result = { ok: false, error: error.stack ?? String(error) };
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
});
