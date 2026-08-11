// Real-WebGL regression for r_plane.c's negative-world-Y flat convention.
// Run against a static server rooted at the repository; Chromium is headless.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const watchdog = setTimeout(() => {
  console.error('flat-orientation Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8096/';
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.renderer !== undefined, { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const THREE = await import('three');
    const { R_MakeIndexedTexture } = await import('/src/r_shader.js');
    const { R_FlatTextureUV } = await import('/src/r_plane_mapping.js');

    const size = 64;
    const indices = new Uint8Array(size * size);
    const alphas = new Uint8Array(size * size);
    alphas.fill(255);
    for (let row = 0; row < size; row++) indices.fill(row, row * size, (row + 1) * size);
    const texture = R_MakeIndexedTexture(indices, alphas, size, size);

    const positions = new Float32Array([
      -1, -1, 0,  0, -1, 0,  0, 1, 0,  -1, 1, 0,
       0, -1, 0,  1, -1, 0,  1, 1, 0,   0, 1, 0,
    ]);
    const uvs = new Float32Array(8 * 2);
    const north = R_FlatTextureUV(0, 5);  // reference row (-5)&63 = 59
    const south = R_FlatTextureUV(0, -5); // reference row 5
    for (let i = 0; i < 4; i++) uvs.set([north.u, north.v], i * 2);
    for (let i = 4; i < 8; i++) uvs.set([south.u, south.v], i * 2);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(texture2D(map, vUv).rrr, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.Camera();
    const target = new THREE.WebGLRenderTarget(4, 2, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });
    const renderer = window.renderer;
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, 4, 2);
    renderer.render(scene, camera);
    const pixels = new Uint8Array(4 * 2 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 4, 2, pixels);
    renderer.setRenderTarget(null);

    const readRed = (x, y) => pixels[(y * 4 + x) * 4];
    const output = {
      north: readRed(0, 0),
      south: readRed(3, 0),
      glError: renderer.getContext().getError(),
    };
    target.dispose();
    geometry.dispose();
    material.dispose();
    texture.dispose();
    return output;
  });

  const failures = [];
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (result.north !== 59) failures.push(`positive world Y sampled row ${result.north}, expected 59`);
  if (result.south !== 5) failures.push(`negative world Y sampled row ${result.south}, expected 5`);
  if (result.glError !== 0) failures.push(`WebGL error ${result.glError}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(watchdog);
  if (browser !== null) await browser.close();
}
