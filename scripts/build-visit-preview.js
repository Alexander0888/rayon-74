import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { build } from 'vite';
import { productHud } from '../src/content/fr.js';
import { sessionlessClient } from './localSupabase.js';

const [outputFile, ...extraProducts] = process.argv.slice(2);
if (!outputFile) throw new Error('Specify an output HTML file for the tour preview.');
const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = parseEnv(
  await readFile('.env.shared.local', 'utf8'),
);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname) || !key.startsWith('sb_publishable_')) {
  throw new Error('The preview requires a local Supabase URL and its publishable key.');
}

const guest = sessionlessClient(url, key);
const keys = [...new Set([...Object.keys(productHud.products), ...extraProducts])];
const preview = Object.fromEntries(await Promise.all(keys.map(async (product) => {
  const { data, error } = await guest.rpc('get_demo_product_hud', { p_product: product });
  if (error || !data) throw new Error('Demo product unavailable: ' + product);
  return [product, data];
})));

const bundle = await build({
  mode: 'visit-preview',
  envDir: false,
  define: {
    __RAYON_HUD_PREVIEW__: JSON.stringify(preview),
    'import.meta.env.VITE_SUPABASE_URL': 'undefined',
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': 'undefined',
  },
  build: {
    write: false,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
const files = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(({ output }) => output);
const html = files.find((file) => file.fileName === 'index.html')?.source;
const code = files.find((file) => file.type === 'chunk' && file.isEntry)?.code;
const css = files.find((file) => file.fileName.endsWith('.css'))?.source;
if (typeof html !== 'string' || !code || typeof css !== 'string' || files.length !== 3) {
  throw new Error('Expected one HTML page, one script, and one stylesheet for the offline preview.');
}

const standalone = html
  .replace(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/, () =>
    '<script>if (!location.hash) location.hash = "/visit/rayon"</script>\n<script type="module">' +
    code.replace(/<\/script/gi, '<\\/script') + '</script>')
  .replace(/<link rel="stylesheet"[^>]*>/, () => '<style>' + css + '</style>');
const path = resolve(outputFile);
await mkdir(dirname(path), { recursive: true });
await writeFile(path, standalone);
console.log('Preview saved to ' + path);
