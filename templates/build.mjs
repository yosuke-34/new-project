// 酒標帖 印刷データ生成スクリプト
//   node templates/build.mjs           … print/ に PDF と HTML を出力
//   node templates/build.mjs --bleed   … print/bleed/ に塗り足し 3mm 付きの PDF を出力
//   node templates/build.mjs --preview … docs/images/ にプレビュー PNG も出力
//   node templates/build.mjs --private … templates/config.local.json（贈る相手の名前など、公開しない設定）を
//                                        重ねて、名前の入る扉（01）だけを print/private/ に出力
//                                        （どちらも .gitignore 済み。検索ページには使わない）
// ページの描画は site/lib/render.js（検索・印刷ページと共用）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { TYPES } from '../site/lib/data.js';
import * as R from '../site/lib/render.js';
import { setupHandouts, handoutCss, quickGuidePage, makingStepsPage } from './handouts.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PRIVATE = process.argv.includes('--private');
const OUT = path.join(ROOT, 'print', ...(PRIVATE ? ['private'] : []));
const IMG = path.join(ROOT, 'docs', 'images');
const LOCAL = path.join(HERE, 'config.local.json');
if (PRIVATE && !fs.existsSync(LOCAL)) throw new Error('templates/config.local.json がありません（例：{ "recipient": "名前" }）');
const cfg = {
  ...JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8')),
  ...(PRIVATE ? JSON.parse(fs.readFileSync(LOCAL, 'utf8')) : {}),
};
const CSS = fs.readFileSync(path.join(ROOT, 'site', 'lib', 'sheet.css'), 'utf8');
const FONTS = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Zen+Maru+Gothic:wght@500;700;900&family=Yuji+Syuku&display=swap';

R.setup(cfg, createRequire(import.meta.url)('qrcode-generator'));
setupHandouts(cfg);

// 検索・印刷ページにも同じ題名・名前を使わせる（--private の設定は公開ページに出さない）
const { title, titleReading, subtitle, volume, recipient, sealText } = cfg;
if (!PRIVATE) fs.writeFileSync(path.join(ROOT, 'site', 'config.json'), JSON.stringify({ title, titleReading, subtitle, volume, recipient, sealText }, null, 2) + '\n');

// プレビュー画像用の見本（実在のメーカーではない）
const SAMPLE = { name: '〇〇酒造', kana: 'まるまるしゅぞう', pref: '新潟', city: '〇〇市', url: 'https://example.com/' };

// --bleed：印刷所入稿用に四辺へ 3mm の塗り足しを付ける（爪や色帯を裁ち落としまで伸ばす）
const BLEED = process.argv.includes('--bleed');
const BLEED_CSS = `
.bleedbox { width: 303mm; height: 216mm; padding: 3mm; overflow: hidden; background: #fff; break-after: page; }
.bleedbox.portrait { width: 216mm; height: 303mm; }
.bleedbox .page { overflow: visible; break-after: auto; }
.bleedbox .tab.right { right: -3mm; width: 15mm; padding-right: 3mm; }
.bleedbox .tab.left { left: -3mm; width: 15mm; padding-left: 3mm; }
.bleedbox .edgeband { left: -3mm !important; top: -3mm !important; bottom: -3mm !important; width: 9mm !important; }`;

const doc = (title, pages, portrait = false) => {
  let body = pages.join('\n');
  let size = portrait ? 'A4 portrait' : 'A4 landscape';
  if (BLEED) {
    body = body.replace(/<section class="page( portrait)?/g, (_, p) => `<div class="bleedbox${p ?? ''}"><section class="page${p ?? ''}`)
      .replace(/<\/section>/g, '</section></div>');
    size = portrait ? '216mm 303mm' : '303mm 216mm';
  }
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>${R.esc(title)}</title>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS}${handoutCss}${BLEED ? BLEED_CSS : ''}
@page { size: ${size}; margin: 0; }
body { margin: 0; background: #8f8a84; }
@media screen { body { padding: 10mm 0; } .page { margin: 0 auto 10mm; box-shadow: 0 2mm 6mm rgba(0,0,0,.25); } }</style></head>
<body>${body}</body></html>`;
};

const indexPages = (t) => Array.from({ length: cfg.indexPages[t.key] ?? 2 }, (_, i) => R.indexPage(t, i * 20 + 1, 20));

const DOCS = [
  { file: '01_cover-guide', title: '扉・使い方・剥がし方・全国制覇地図', pages: [R.titlePage(), R.guidePage(), R.removalPage(), R.mapPage()] },
  { file: '02_dividers-index', title: '中扉・目録', pages: TYPES.flatMap((t) => [R.dividerPage(t), ...indexPages(t)]) },
  { file: '03_label-sheets', title: 'ラベル台紙（左ページ）', pages: TYPES.map(R.labelPage) },
  { file: '04_blank-meiban', title: '空の銘板（右ページ・手書き用）', pages: TYPES.map((t) => R.meibanPage(t)) },
  { file: '05_cover-parts', title: '題簽・QRシール・背表紙', pages: [R.coverPartsPage(), R.spinePage()], portrait: true },
  { file: '06_seal-order', title: '落款 入稿原稿', pages: [R.sealOrderPage()], portrait: true },
  { file: '07_quick-guide', title: 'つかいかた早見表', pages: [quickGuidePage()] },
  { file: '08_making-steps', title: '作り方（作る人用）', pages: [makingStepsPage()] },
];

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through to the global install */ }
  const root = execSync('npm root -g').toString().trim();
  return import(path.join(root, 'playwright', 'index.mjs'));
}

const DEST = BLEED ? path.join(OUT, 'bleed') : OUT;
fs.mkdirSync(path.join(DEST, 'html'), { recursive: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();

async function open(file) {
  await page.goto('file://' + file, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
}

for (const d of PRIVATE ? DOCS.slice(0, 1) : DOCS) {
  const htmlPath = path.join(DEST, 'html', `${d.file}.html`);
  fs.writeFileSync(htmlPath, doc(d.title, d.pages, d.portrait));
  await open(htmlPath);
  await page.pdf({ path: path.join(DEST, `${d.file}.pdf`), preferCSSPageSize: true, printBackground: true });
  console.log('✓', path.relative(ROOT, path.join(DEST, `${d.file}.pdf`)));
}

if (process.argv.includes('--preview') && !BLEED && !PRIVATE) {
  fs.mkdirSync(IMG, { recursive: true });
  await page.setViewportSize({ width: 2400, height: 1200 });
  await page.emulateMedia({ media: 'print' });
  const sake = TYPES[0];
  const shots = {
    spread: `<div style="display:flex;gap:1.5mm;background:#3b3632;padding:1.5mm">${R.labelPage(sake)}${R.meibanPage(sake, SAMPLE)}</div>`,
    title: R.titlePage(), guide: R.guidePage(), peel: R.removalPage(), map: R.mapPage(),
    divider: R.dividerPage(sake), index: R.indexPage(sake, 1, 20),
    'meiban-blank': R.meibanPage(TYPES[1]), 'cover-parts': R.coverPartsPage(), spine: R.spinePage(),
    'quick-guide': quickGuidePage(), 'making-steps': makingStepsPage(),
  };
  const tmp = path.join(DEST, 'html', '_preview.html');
  for (const [name, html] of Object.entries(shots)) {
    fs.writeFileSync(tmp, doc(name, [`<div id="shot" style="display:inline-block">${html}</div>`]));
    await open(tmp);
    await (await page.$('#shot')).screenshot({ path: path.join(IMG, `${name}.png`), scale: 'css' });
    console.log('🖼', `${name}.png`);
  }
  fs.rmSync(tmp);
}
await browser.close();
