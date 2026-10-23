// 酒標帖 印刷データ生成スクリプト
//   node templates/build.mjs          … print/ に PDF と HTML を出力
//   node templates/build.mjs --preview … docs/images/ にプレビュー PNG も出力
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { REGIONS, TILES, regionOf } from './regions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'print');
const IMG = path.join(ROOT, 'docs', 'images');
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
const CSS = fs.readFileSync(path.join(HERE, 'styles.css'), 'utf8');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mm = (n) => `${+n.toFixed(2)}mm`;
const brand = () => esc([cfg.title, cfg.recipient && `${cfg.recipient} 蔵`].filter(Boolean).join(' · '));

// ---------------------------------------------------------------- 部品

const TAB_TOP = 30, TAB_PITCH = 34.3, TAB_H = 32;

function tab(region, side) {
  if (!region) {
    return REGIONS.map((r) =>
      `<div class="tab-ghost ${side}" style="top:${mm(TAB_TOP + (r.id - 1) * TAB_PITCH)};height:${mm(TAB_H)}"></div>`).join('');
  }
  const top = TAB_TOP + (region.id - 1) * TAB_PITCH;
  return `<div class="tab ${side}" style="top:${mm(top)};height:${mm(TAB_H)};background:${region.color}">
    <span class="n">${region.num}</span>${esc(region.name)}</div>`;
}

function mount({ left, top, width, height, hint, fold = false }) {
  return `<div class="mount" style="left:${mm(left)};top:${mm(top)};width:${mm(width)};height:${mm(height)}">
    <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
    <i class="m t"></i><i class="m b"></i><i class="m l"></i><i class="m r"></i>
    ${fold ? '<i class="fold"></i>' : ''}
    <span class="hint">${hint}</span></div>`;
}

const chip = (r) => `<span class="chip"><i style="background:${r.color}"></i>${r.num} ${esc(r.name)}</span>`;
const field = (label, style = 'flex:1', unit = '') =>
  `<div class="field" style="${style}"><span class="lbl">${label}</span><span class="fill"></span>${unit ? `<span class="unit">${unit}</span>` : ''}</div>`;

function seal(text, size) {
  const chars = [...text];
  const fs_ = chars.length <= 2 ? size * 0.38 : size * 0.34;
  let glyphs;
  if (chars.length <= 2) {
    glyphs = chars.map((ch, i) =>
      `<text x="${size / 2}" y="${size * (chars.length === 1 ? 0.5 : 0.3 + i * 0.4)}" font-size="${chars.length === 1 ? size * 0.6 : fs_}">${esc(ch)}</text>`).join('');
  } else { // 4文字：右上→右下→左上→左下（縦書きの順）
    const pos = [[0.71, 0.3], [0.71, 0.7], [0.29, 0.3], [0.29, 0.7]];
    glyphs = chars.slice(0, 4).map((ch, i) =>
      `<text x="${size * pos[i][0]}" y="${size * pos[i][1]}" font-size="${fs_}">${esc(ch)}</text>`).join('');
  }
  return `<svg width="${mm(size)}" height="${mm(size)}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.4" y="0.4" width="${size - 0.8}" height="${size - 0.8}" rx="${size * 0.07}" fill="#b7282e"/>
    <rect x="${size * 0.09}" y="${size * 0.09}" width="${size * 0.82}" height="${size * 0.82}" rx="${size * 0.03}" fill="none" stroke="#fff" stroke-width="${size * 0.025}"/>
    <g fill="#fff" font-family="Shippori Mincho" font-weight="800" text-anchor="middle" dominant-baseline="central">${glyphs}</g></svg>`;
}

// ---------------------------------------------------------------- 台紙

// 表面：綴じ側が左、小口（爪）が右
function sheetFront(region) {
  const L = 18, W = 172;
  return `<section class="page">
  <div class="hdr" style="left:${mm(L)};top:12mm;width:${mm(W)}">
    <div class="no"><span class="k">No.</span><span class="box"></span></div>
    ${field('銘柄')}
    ${field('産地', 'width:46mm')}
  </div>
  ${mount({ left: L, top: 30, width: W, height: 250, hint: '表ラベル　FRONT LABEL ─ 長いラベルは縦向きに' })}
  <div class="foot" style="left:${mm(L)};width:${mm(W)}"><span>${brand()}</span><span>${region ? chip(region) + '　' : ''}表</span></div>
  ${tab(region, 'right')}
</section>`;
}

// 裏面：綴じ側が右、小口（爪）が左
function sheetBack(region) {
  const L = 20, W = 172;
  return `<section class="page">
  <div class="hdr" style="left:${mm(L)};top:12mm;width:${mm(W)}">
    <div class="no"><span class="k">No.</span><span class="box"></span></div>
    <span class="lbl" style="margin-left:auto;padding-bottom:1mm">裏ラベル・肩ラベル　BACK LABEL</span>
  </div>
  ${mount({ left: L, top: 28, width: W, height: 98, hint: '裏ラベル・肩ラベル ─ 表ラベルしか無い瓶は、ここに瓶の写真を' })}
  ${record(L, 132, W)}
  <div class="foot" style="left:${mm(L)};width:${mm(W)}"><span>裏</span><span>${brand()}</span></div>
  ${tab(region, 'left')}
</section>`;
}

function record(left, top, width) {
  return `<div class="rec" style="left:${mm(left)};top:${mm(top)};width:${mm(width)}">
    <div style="display:flex;align-items:baseline;gap:3mm;margin-bottom:.6mm">
      <span style="font-weight:800;font-size:10.5pt;letter-spacing:.3em">呑みの記録</span><span class="lbl">TASTING NOTE</span>
    </div>
    <div class="rule"></div>
    <div class="row">${field('銘柄', 'flex:1.4')}${field('蔵元・蒸溜所')}</div>
    <div class="row">${field('産地', 'width:52mm', '都道府県／国')}
      <div class="field" style="flex:1;gap:2.6mm"><span class="lbl">種別</span>
        <span class="chk">日本酒</span><span class="chk">焼酎・泡盛</span><span class="chk">ウイスキー</span><span class="chk">ワイン</span><span class="chk">その他</span></div></div>
    <div class="row">${field('特定名称・種類', 'flex:1.4')}${field('原料（米・麦など）')}</div>
    <div class="row">${field('精米歩合', 'flex:1', '%')}${field('度数', 'flex:1', '%')}${field('日本酒度')}${field('酸度')}${field('熟成・樽', 'flex:1.5')}</div>
    <div class="row">
      <div class="field" style="width:56mm"><span class="lbl">呑んだ日</span><span class="fill"></span><span class="unit">年</span><span class="fill" style="flex:.6"></span><span class="unit">月</span><span class="fill" style="flex:.6"></span><span class="unit">日</span></div>
      ${field('場所')}${field('一緒に')}</div>
    <div class="row">
      <div class="field" style="flex:1.3;gap:2.6mm"><span class="lbl">入手</span><span class="chk">購入</span><span class="chk">いただきもの</span><span class="chk">お店で</span></div>
      <div class="field" style="flex:1"><span class="lbl">価格・容量</span><span class="unit">¥</span><span class="fill"></span><span class="unit">／</span><span class="fill" style="flex:.7"></span><span class="unit">ml</span></div></div>

    <div style="display:flex;gap:6mm;margin-top:4mm">
      <div><h4>味わい（点を打つ）</h4>
        <div class="taste">
          <span class="ax" style="left:1mm;top:50%;transform:translateY(-120%)">甘口</span>
          <span class="ax" style="right:1mm;top:50%;transform:translateY(-120%)">辛口</span>
          <span class="ax" style="left:50%;top:.8mm;transform:translateX(12%)">濃醇・重厚</span>
          <span class="ax" style="left:50%;bottom:.8mm;transform:translateX(12%)">淡麗・軽快</span>
        </div></div>
      <div style="flex:1">
        <h4>呑み方（○で囲む）</h4>
        <div class="circle-opts"><span>冷酒</span><span>常温</span><span>ぬる燗</span><span>熱燗</span><span>ロック</span><span>水割り</span><span>ハイボール</span><span>ストレート</span></div>
        <h4 style="margin-top:1.6mm">香り</h4>
        <div class="circle-opts"><span>華やか</span><span>穏やか</span><span>果実</span><span>米の旨み</span><span>熟成</span><span>スモーキー</span><span>樽</span></div>
        <div style="height:8mm;margin-top:1mm">${field('合わせた肴')}</div>
      </div>
      <div style="width:44mm">
        <h4>評価（塗りつぶす）</h4>
        <div class="stars">☆☆☆☆☆</div>
        <h4 style="margin-top:4.4mm">また呑みたい？</h4>
        <div class="circle-opts"><span>ぜひ</span><span>機会があれば</span><span>一度で十分</span></div>
      </div>
    </div>
    <h4 style="margin-top:3.4mm">メモ</h4>
    <div class="lines" style="height:30.4mm"></div>
  </div>`;
}

// A3 二つ折りのワイド台紙（巻きつけ型の長いラベル用）
function wideSheet() {
  return `<section class="page a3">
  <div class="hdr" style="left:20mm;top:12mm;width:380mm">
    <div class="no"><span class="k">No.</span><span class="box"></span></div>
    ${field('銘柄')}${field('蔵元・蒸溜所', 'width:80mm')}${field('産地', 'width:50mm')}
    <span class="lbl" style="padding-bottom:1mm">ワイド台紙　WIDE</span>
  </div>
  ${mount({ left: 20, top: 30, width: 380, height: 238, hint: '長いラベル・巻きつけラベル ─ 中央の点線で二つ折りにして A3 対応ポケットへ', fold: true })}
  <div class="foot" style="left:20mm;width:380mm"><span>${brand()}</span><span>記録は同じ No. の標準台紙の裏面へ（表面には瓶の写真を）</span></div>
</section>`;
}

// ---------------------------------------------------------------- 目録・索引・地図

function indexPage(start, count) {
  const end = start + count - 1;
  const pad = (n) => String(n).padStart(3, '0');
  const milestones = new Set([10, 25, 50, 77, 88, 100, 150, 200]);
  const rows = Array.from({ length: count }, (_, i) => {
    const n = start + i;
    return `<tr class="${milestones.has(n) ? 'ms' : ''}"><td class="num">${pad(n)}</td><td class="rg"></td><td></td><td></td><td></td><td></td><td></td><td class="st">☆☆☆☆☆</td></tr>`;
  }).join('');
  return `<section class="page">
  <div class="abs" style="left:20mm;top:16mm;width:170mm;display:flex;align-items:flex-end;justify-content:space-between">
    <div class="pagetitle">目録<small>INDEX　No.${pad(start)} – ${pad(end)}</small></div>
    ${seal(cfg.sealText, 11)}
  </div>
  <div class="abs" style="left:20mm;top:31mm;width:170mm;display:flex;flex-wrap:wrap;gap:1mm 3.2mm">${REGIONS.map(chip).join('')}</div>
  <div class="abs" style="left:20mm;top:41mm;width:170mm">
    <table class="idx">
      <colgroup><col style="width:13mm"><col style="width:8mm"><col><col style="width:36mm"><col style="width:20mm"><col style="width:15mm"><col style="width:20mm"><col style="width:20mm"></colgroup>
      <tr><th>No.</th><th style="padding:0;text-align:center">区分</th><th>銘柄</th><th>蔵元・蒸溜所</th><th>産地</th><th>種別</th><th>呑んだ日</th><th>評価</th></tr>
      ${rows}
    </table>
  </div>
  <div class="foot" style="left:20mm;width:170mm"><span>区分欄には上の番号（壱〜漆）を。朱色の番号は節目の一本。</span><span>${brand()}</span></div>
</section>`;
}

function mapPage() {
  const P = 11.33, T = 10.6, X0 = 20, Y0 = 34;
  const tiles = Object.entries(TILES).map(([name, [c, r]]) => {
    const rg = regionOf(name);
    return `<div class="abs" style="left:${mm(X0 + c * P)};top:${mm(Y0 + r * P)};width:${mm(T)};height:${mm(T)};border:.35mm solid ${rg.color};
      display:flex;align-items:center;justify-content:center;font-family:var(--gothic);font-weight:500;font-size:${name.length > 2 ? 5.6 : 7}pt;color:${rg.color}">${name}</div>`;
  }).join('');
  const abroad = REGIONS[6];
  const abroadTiles = abroad.prefs.map((n, i) =>
    `<div class="abs" style="left:${mm(X0 + i * 28.6)};top:${mm(Y0 + 10 * P + 14)};width:26.8mm;height:${mm(T)};border:.35mm solid ${abroad.color};
      display:flex;align-items:center;justify-content:center;font-family:var(--gothic);font-weight:500;font-size:7pt;color:${abroad.color}">${n}</div>`).join('');
  const steps = [['初めの一県', 1], ['五県', 5], ['十県', 10], ['折り返し', 24], ['三十県', 30], ['全国制覇', 47]];
  const ySteps = Y0 + 10 * P + 38;
  return `<section class="page">
  <div class="abs" style="left:${mm(X0)};top:${mm(Y0)};width:95mm">
    <div class="pagetitle" style="font-size:22pt">全国制覇地図</div>
    <div class="lbl" style="margin-top:2mm;letter-spacing:.3em">SAKE MAP OF JAPAN</div>
    <p class="prose" style="margin-top:4mm;font-size:8.6pt;line-height:1.8">呑んだ酒の産地を塗りつぶしてゆく。<br>日本酒・焼酎・ウイスキー、どれでも一県。</p>
    <div style="margin-top:4mm;display:flex;align-items:flex-end;gap:2mm"><span style="font-weight:800;font-size:11pt;letter-spacing:.2em">制覇</span>
      <span style="display:inline-block;width:18mm;border-bottom:.45mm solid var(--ink);height:8mm"></span><span style="font-size:11pt">／ 四十七</span></div>
  </div>
  ${tiles}
  <div class="abs" style="left:${mm(X0 + 9 * P)};top:${mm(Y0 + 8 * P + 1)};width:${mm(6 * P)};display:flex;flex-wrap:wrap;gap:1.2mm 3mm">${REGIONS.map(chip).join('')}</div>
  <div class="abs lbl" style="left:${mm(X0)};top:${mm(Y0 + 10 * P + 8)}">海外　ABROAD</div>
  ${abroadTiles}
  <div class="abs" style="left:${mm(X0)};top:${mm(ySteps)};width:170mm">
    <div style="display:flex;align-items:baseline;gap:3mm"><span style="font-weight:800;font-size:10.5pt;letter-spacing:.3em">道しるべ</span><span class="lbl">到達したら印を押す・日付を書く</span></div>
    <div class="rule thin" style="margin:1.5mm 0 4mm"></div>
    <div style="display:flex;justify-content:space-between">
      ${steps.map(([t, n]) => `<div style="width:25mm;text-align:center">
        <div style="width:19mm;height:19mm;margin:0 auto;border:.3mm dashed var(--line);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--gothic);font-size:6.4pt;color:#b3aba0">${n}</div>
        <div style="font-weight:600;font-size:8.6pt;margin-top:2mm;letter-spacing:.1em">${t}</div>
        <div style="border-bottom:.25mm solid var(--line);height:6mm;margin:0 2mm"></div></div>`).join('')}
    </div>
    <div style="display:flex;align-items:baseline;gap:3mm;margin-top:9mm"><span style="font-weight:800;font-size:10.5pt;letter-spacing:.3em">区分ごとの制覇</span><span class="lbl">塗った数を書く</span></div>
    <div class="rule thin" style="margin:1.5mm 0 3mm"></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3mm 6mm">
      ${REGIONS.slice(0, 6).map((r) => `<div style="display:flex;align-items:flex-end;gap:2mm;height:8mm;border-bottom:.25mm solid var(--faint)">
        <span style="font-weight:800;color:${r.color}">${r.num}</span><span style="font-size:8.6pt;letter-spacing:.1em;flex:1">${esc(r.name)}</span>
        <span style="font-size:9pt">／ ${r.prefs.length}</span></div>`).join('')}
    </div>
  </div>
  <div class="foot" style="left:20mm;width:170mm"><span>番号から探すときは「目録」、産地から探すときは「産地索引」へ</span><span>${brand()}</span></div>
</section>`;
}

function prefIndexPage() {
  const col = (regions) => regions.map((r) => `
    <div style="display:flex;align-items:center;gap:2mm;height:6.8mm;border-bottom:.45mm solid ${r.color};margin-top:2mm">
      <span style="font-weight:800;color:${r.color};font-size:9.5pt">${r.num}</span><span style="font-weight:600;font-size:9pt;letter-spacing:.15em">${esc(r.name)}</span></div>
    ${r.prefs.map((p) => `<div style="display:flex;align-items:flex-end;height:6.8mm;border-bottom:.25mm solid var(--faint);padding-bottom:1mm">
      <span class="g" style="width:24mm;font-size:7.6pt;flex:none">${esc(p)}</span></div>`).join('')}`).join('');
  return `<section class="page">
  <div class="abs" style="left:20mm;top:16mm;width:170mm;display:flex;align-items:flex-end;justify-content:space-between">
    <div class="pagetitle">産地索引<small>BY REGION</small></div>
    <span class="lbl">産地の欄に、その台紙の No. を書き足してゆく</span>
  </div>
  <div class="abs" style="left:20mm;top:30mm;width:170mm;display:flex;gap:10mm">
    <div style="flex:1">${col(REGIONS.slice(0, 4))}</div>
    <div style="flex:1">${col(REGIONS.slice(4))}</div>
  </div>
  <div class="foot" style="left:20mm;width:170mm"><span>例）新潟　012　027　041</span><span>${brand()}</span></div>
</section>`;
}

// ---------------------------------------------------------------- 扉・使い方

function titlePage() {
  const who = cfg.recipient
    ? `<span style="font-size:17pt;font-weight:600;letter-spacing:.3em">${esc(cfg.recipient)}</span>`
    : `<span style="display:inline-block;height:52mm;border-left:.3mm solid var(--line)"></span>`;
  return `<section class="page">
  <div class="abs" style="inset:14mm;border:.5mm solid var(--ink)"></div>
  <div class="abs" style="inset:16mm;border:.2mm solid var(--ink)"></div>
  <div class="abs g sub" style="right:40mm;top:47mm;writing-mode:vertical-rl;font-size:8pt;letter-spacing:.6em">${esc(cfg.titleReading)}</div>
  <div class="abs" style="right:48mm;top:44mm;writing-mode:vertical-rl;display:flex;align-items:flex-start">
    <span style="font-weight:800;font-size:64pt;letter-spacing:.32em;line-height:1">${esc(cfg.title)}</span>
    <span style="font-weight:600;font-size:15pt;letter-spacing:.3em;margin-top:6mm">第${esc(cfg.volume)}巻</span>
  </div>
  <div class="abs" style="left:52mm;top:128mm;writing-mode:vertical-rl;display:flex;align-items:flex-start;gap:3mm">
    ${who}<span style="font-size:17pt;font-weight:800;margin-top:4mm">蔵</span>
    <span style="margin-top:10mm">${seal(cfg.sealText, 17)}</span>
  </div>
  <div class="abs g" style="left:0;right:0;bottom:30mm;text-align:center;font-size:7.6pt;letter-spacing:.6em;color:var(--sub)">${esc(cfg.subtitle)}　VOL.${['', '壱', '弐', '参', '肆', '伍'].indexOf(cfg.volume) || 1}</div>
</section>`;
}

function messagePage() {
  return `<section class="page">
  <div class="abs" style="left:24mm;right:24mm;top:30mm;bottom:40mm;
    background-image:linear-gradient(90deg, var(--faint) .25mm, transparent .25mm);background-size:13mm 100%;border:.3mm solid var(--line)"></div>
  <div class="abs" style="right:28mm;top:36mm;writing-mode:vertical-rl;font-weight:800;font-size:14pt;letter-spacing:.5em">贈る言葉</div>
  <div class="abs" style="left:24mm;right:24mm;bottom:26mm;display:flex;justify-content:space-between;font-size:9.5pt;letter-spacing:.2em">
    <span>${esc(cfg.presentedOn) || '　　　　年　　月　　日'}</span><span>${cfg.giver ? esc(cfg.giver) + ' より' : '　　　　　　　より'}</span></div>
</section>`;
}

function guidePage() {
  return `<section class="page">
  <div class="abs" style="left:22mm;top:18mm;width:166mm">
    <div class="pagetitle">この帖の使い方<small>HOW TO USE</small></div>
    <div class="rule" style="margin:3mm 0 2mm"></div>
    <div class="prose">
      <p>一本呑んだら一枚。台紙は<b>表に表ラベル、裏に裏ラベルと記録</b>。ページをめくると、瓶をくるりと回したように裏ラベルが現れます。</p>
      <ol class="steps" style="margin-top:4mm">
        <li><b>剥がす</b>　ラベルを剥がして乾かす（次の頁「ラベルの剥がし方」）。</li>
        <li><b>番号を振る</b>　「目録」の次の空き番号を、台紙の No. 欄と目録に書く。番号は呑んだ順。</li>
        <li><b>貼る</b>　産地の区分の台紙（右端の色の爪）を選び、表ラベル・裏ラベルを貼る。長いラベルは縦向きに。それでも収まらなければワイド台紙へ。</li>
        <li><b>記す</b>　裏面の「呑みの記録」を書く。全部埋めなくてよい。日付と一言だけでも。</li>
        <li><b>綴じる</b>　ポケットに入れ、同じ色の中扉の後ろへ。区分の中は番号順。</li>
        <li><b>塗る</b>　「全国制覇地図」の県を塗り、「産地索引」にその No. を書き足す。</li>
      </ol>
      <h3><span class="num">◇</span>探すとき</h3>
      <p>番号がわかれば「目録」→ 区分の爪 → 番号順にめくる。産地から探すなら「産地索引」。閉じたままでも小口の色で区分が分かります。</p>
      <h3><span class="num">◇</span>こんなときは</h3>
      <p><b>ラベルが一枚だけ</b>…裏面の上の枠に瓶の写真（L判）を。<br>
      <b>肩ラベル・首掛け・王冠・お店のレシート</b>…小さなグラシン袋に入れて同じポケットへ。<br>
      <b>剥がせなかった</b>…正面から写真を撮って表面に。印刷瓶も同様に。<br>
      <b>台紙が足りない</b>…印刷データから何枚でも追加できます。</p>
    </div>
    <div class="panel" style="margin-top:6mm;display:flex;align-items:center;gap:5mm">
      ${seal(cfg.sealText, 13)}
      <div class="prose note" style="font-size:7.8pt">ラベルの留め方は<b>フォトコーナー</b>か<b>弱粘着の両面テープ</b>がおすすめ。のりやセロハンテープは年月が経つと黄ばみ、剥がせなくなります。</div>
    </div>
    <div style="display:flex;gap:8mm;margin-top:7mm;align-items:flex-start">
      ${miniSheets()}
      <div style="flex:1">
        <div style="font-weight:800;font-size:10.5pt;letter-spacing:.2em;margin-bottom:2mm">帖の構成</div>
        <div class="g" style="font-size:7.4pt;line-height:2.2;color:var(--ink)">${[
          '扉', '贈る言葉', '使い方', '剥がし方', '全国制覇地図', '産地索引', '目録',
          ...REGIONS.map((r) => `<span style="color:${r.color};font-weight:700">中扉 ${r.num}</span> 台紙…`),
        ].map((x) => `<span style="white-space:nowrap">${x}</span>`).join('<span style="color:var(--line)">　›　</span>')}</div>
      </div>
    </div>
  </div>
  <div class="foot" style="left:22mm;width:166mm"><span></span><span>${brand()}</span></div>
</section>`;
}

// 使い方ページ用：台紙の表裏の縮小図
function miniSheets() {
  const c = REGIONS[2].color;
  const sheet = (inner, tabSide, caption) => `<div style="text-align:center">
    <div style="position:relative;width:26mm;height:36.8mm;border:.3mm solid var(--ink);background:#fff">
      ${inner}<div style="position:absolute;${tabSide}:-.3mm;top:15mm;width:2.2mm;height:5mm;background:${c}"></div></div>
    <div class="lbl" style="margin-top:1.5mm">${caption}</div></div>`;
  const front = sheet(`<div style="position:absolute;left:5mm;right:5mm;top:5mm;bottom:5mm;border:.25mm solid var(--line);background:#f3efe8;
      display:flex;align-items:center;justify-content:center;font-size:7pt;font-weight:600">表ラベル</div>`, 'right', '表');
  const back = sheet(`<div style="position:absolute;left:5mm;right:5mm;top:3mm;height:11mm;border:.25mm solid var(--line);background:#f3efe8;
      display:flex;align-items:center;justify-content:center;font-size:6pt;font-weight:600">裏ラベル</div>
      <div style="position:absolute;left:4mm;right:4mm;top:17mm;bottom:3mm;background-image:linear-gradient(transparent 1.6mm, var(--line) 1.6mm, var(--line) 1.85mm, transparent 1.85mm);background-size:100% 2.2mm"></div>`, 'left', '裏・記録');
  return `<div style="display:flex;align-items:center;gap:2.5mm">${front}
    <div class="g" style="font-size:6.6pt;color:var(--sub);text-align:center;line-height:1.5;margin-top:-5mm">めくる<br>＝<br>瓶を回す</div>${back}</div>`;
}

function removalPage() {
  const card = (k, title, who, body) => `<div class="panel" style="margin-bottom:3.4mm">
    <div style="display:flex;align-items:baseline;gap:3mm;margin-bottom:1.2mm"><span style="font-weight:800;font-size:13pt;color:var(--shu)">${k}</span>
      <span style="font-weight:800;font-size:11pt;letter-spacing:.12em">${title}</span><span class="lbl">${who}</span></div>
    <div class="prose" style="font-size:8.8pt;line-height:1.85">${body}</div></div>`;
  return `<section class="page">
  <div class="abs" style="left:22mm;top:18mm;width:166mm">
    <div class="pagetitle">ラベルの剥がし方<small>HOW TO PEEL</small></div>
    <div class="rule" style="margin:3mm 0 3mm"></div>
    <p class="prose" style="margin-bottom:3mm">まず<b>ラベルの端を爪で少しめくって</b>みる。紙がそのまま浮けば「のり貼り」、ツルッとしたフィルムや粘着が伸びれば「シール」です。</p>
    ${card('一', 'ぬるま湯に浸ける', '紙ラベル・のり貼り（日本酒に多い）',
      '空き瓶に水を入れて沈め、<b>40℃前後のぬるま湯</b>に20〜30分。端からゆっくり剥がす。固ければ一晩浸けておく。お湯に台所用洗剤を少し入れると早い。')}
    ${card('二', 'ドライヤーで温める', 'シール・粘着タイプ（ウイスキー・ワイン・近年の日本酒）',
      'ラベル全体を1〜2分温め、粘着がやわらいだら端から<b>ゆっくり、低い角度で</b>引く。冷めたらまた温める。乾いたまま剥がせるので紙が傷みにくい。')}
    ${card('三', 'ラベル剥がしシートを使う', 'どうしても剥がれないもの',
      'ワイン用の透明な「ラベル剥がしシート」を上から貼り、こすってから剥がすと、ラベルの表面だけが写し取られる。表面がフィルムで覆われた仕上がりになる。')}
    <h3 class="prose" style="font-weight:800;font-size:11pt;letter-spacing:.14em;margin:4mm 0 1.5mm"><span style="color:var(--shu)">◇</span> 乾かし方</h3>
    <p class="prose">濡れたラベルは<b>キッチンペーパーで挟み、平らな所で本などの重しを載せて一晩</b>。しっかり乾くまで台紙に貼らない（波打ち・カビの原因）。裏の残りのりは、乾く前に指でそっと落とす。</p>
    <h3 class="prose" style="font-weight:800;font-size:11pt;letter-spacing:.14em;margin:4mm 0 1.5mm"><span style="color:var(--shu)">◇</span> 気をつけること</h3>
    <p class="prose note" style="font-size:8pt">・冷えた瓶にいきなり熱湯をかけない（割れることがある）。　・剥がした後の瓶は割れ物。滑りやすいので布巾の上で作業する。<br>
    ・剥がせない・印刷瓶・お店で呑んだ一杯は、写真で残す。それもまた立派な一枚。</p>
    <div class="panel" style="margin-top:6mm">
      <div style="font-weight:800;font-size:10.5pt;letter-spacing:.2em;margin-bottom:2mm">あると便利な道具</div>
      <div class="g" style="display:grid;grid-template-columns:1fr 1fr;gap:1.4mm 8mm;font-size:8pt;line-height:1.6">
        <span>・フォトコーナー（透明）…ラベルの四隅を留める</span><span>・弱粘着の両面テープ…貼り直しができる</span>
        <span>・ラベル剥がしシート…剥がれない一枚の切り札</span><span>・グラシン袋…肩ラベル・王冠・レシート入れ</span>
        <span>・キッチンペーパーと重し…乾かすときに</span><span>・ドライヤー…シールを温める</span>
      </div>
    </div>
  </div>
  <div class="foot" style="left:22mm;width:166mm"><span></span><span>${brand()}</span></div>
</section>`;
}

function dividerPage(r) {
  return `<section class="page">
  <div class="abs edgeband" style="left:0;top:0;bottom:0;width:6mm;background:${r.color}"></div>
  <div class="abs" style="left:30mm;top:60mm;font-weight:800;font-size:110pt;line-height:1;color:${r.color}">${r.num}</div>
  <div class="abs" style="left:32mm;top:112mm;font-weight:800;font-size:30pt;letter-spacing:.3em">${esc(r.name)}</div>
  <div class="abs lbl" style="left:33mm;top:128mm;letter-spacing:.3em">区分 ${r.id}　／　${r.colorName}色の爪</div>
  <div class="abs" style="left:32mm;top:146mm;width:140mm;border-top:.45mm solid ${r.color};padding-top:4mm;display:flex;flex-wrap:wrap;gap:2mm 6mm;font-size:12pt;letter-spacing:.2em">
    ${r.prefs.map((p) => `<span>${esc(p)}</span>`).join('')}</div>
  <div class="abs" style="left:32mm;top:186mm;display:flex;align-items:flex-end;gap:3mm">
    <span style="font-weight:600;letter-spacing:.2em">収蔵</span><span style="display:inline-block;width:24mm;height:9mm;border-bottom:.45mm solid var(--ink)"></span><span style="letter-spacing:.2em">本</span></div>
  <div class="foot" style="left:32mm;width:150mm"><span>この後ろに、${esc(r.name)}の台紙を番号順に</span><span>${brand()}</span></div>
  ${tab(r, 'right')}
</section>`;
}

// 題簽（表紙に貼る題名の紙）・背ラベル・落款
function slipPage() {
  const daisen = (w, h, fs) => `<div style="position:relative;width:${mm(w)};height:${mm(h)};border:.2mm solid var(--line);padding:2mm">
    <div style="width:100%;height:100%;border:.5mm solid var(--ink);outline:.2mm solid var(--ink);outline-offset:-1.4mm;
      writing-mode:vertical-rl;display:flex;align-items:center;justify-content:space-between;padding:${mm(h * 0.08)} 0">
      <span style="font-weight:800;font-size:${fs}pt;letter-spacing:.35em">${esc(cfg.title)}</span>
      <span style="font-weight:600;font-size:${fs * 0.42}pt;letter-spacing:.2em">${esc(cfg.volume)}</span></div></div>`;
  const spine = (w) => `<div style="width:${mm(w)};height:200mm;border:.2mm solid var(--line);background:#fff;
      writing-mode:vertical-rl;display:flex;align-items:center;justify-content:space-between;padding:12mm 0 10mm">
      <span style="font-weight:800;font-size:${Math.min(w * 0.75, 26)}pt;letter-spacing:.35em">${esc(cfg.title)}</span>
      <span style="display:flex;flex-direction:column;align-items:center;gap:4mm">
        <span style="font-weight:600;font-size:${Math.min(w * 0.36, 12)}pt;letter-spacing:.3em">${cfg.recipient ? esc(cfg.recipient) + ' 蔵' : '第' + esc(cfg.volume) + '巻'}</span>
        ${seal(cfg.sealText, Math.min(w * 0.45, 12))}</span></div>`;
  return `<section class="page">
  <div class="abs" style="left:16mm;top:14mm;width:178mm;display:flex;align-items:flex-end;justify-content:space-between">
    <div class="pagetitle" style="font-size:15pt">題簽・背ラベル・落款<small>COVER PARTS</small></div>
    <span class="lbl">和紙や厚紙に印刷し、外側の細線で切り取る</span></div>
  <div class="abs" style="left:16mm;top:30mm;display:flex;gap:3mm;align-items:flex-start">
    <div><div class="lbl" style="margin-bottom:1.5mm">題簽（大）</div>${daisen(34, 160, 27)}</div>
    <div><div class="lbl" style="margin-bottom:1.5mm">題簽（小）</div>${daisen(26, 120, 20)}</div>
    <div><div class="lbl" style="margin-bottom:1.5mm">背 25mm</div>${spine(25)}</div>
    <div><div class="lbl" style="margin-bottom:1.5mm">背 35mm</div>${spine(35)}</div>
    <div><div class="lbl" style="margin-bottom:1.5mm">背 45mm</div>${spine(45)}</div>
  </div>
  <div class="abs" style="left:16mm;top:242mm;width:178mm">
    <div class="lbl" style="margin-bottom:2mm">落款（はんこ発注用の原稿・実寸）── 30mm / 21mm / 15mm / 10mm</div>
    <div style="display:flex;align-items:flex-end;gap:8mm">${[30, 21, 15, 10].map((s) => seal(cfg.sealText, s)).join('')}</div>
  </div>
</section>`;
}

// ---------------------------------------------------------------- 出力

// --bleed：印刷所入稿用に四辺へ 3mm の塗り足しを付ける（爪や色帯を裁ち落としまで伸ばす）
const BLEED = process.argv.includes('--bleed');
const BLEED_CSS = `
.bleedbox { width: 216mm; height: 303mm; padding: 3mm; overflow: hidden; background: #fff; break-after: page; }
.bleedbox.a3 { width: 426mm; }
.bleedbox .page { overflow: visible; break-after: auto; margin: 0; box-shadow: none; }
.bleedbox .tab.right { right: -3mm; width: 17mm; padding-right: 3mm; }
.bleedbox .tab.left { left: -3mm; width: 17mm; padding-left: 3mm; }
.bleedbox .edgeband { left: -3mm !important; top: -3mm !important; bottom: -3mm !important; width: 9mm !important; }`;

const doc = (title, pages, a3 = false) => {
  let body = pages.join('\n');
  let size = a3 ? 'A3 landscape' : 'A4 portrait';
  if (BLEED) {
    body = body.replace(/<section class="page( a3)?/g, (_, a) => `<div class="bleedbox${a ?? ''}"><section class="page${a ?? ''}`)
      .replace(/<\/section>/g, '</section></div>');
    size = a3 ? '426mm 303mm' : '216mm 303mm';
  }
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${CSS}${BLEED ? BLEED_CSS : ''}
@page { size: ${size}; }</style></head>
<body>${body}</body></html>`;
};

const sheets = (region) => Array.from({ length: cfg.sheetsPerRegion }, () => sheetFront(region) + sheetBack(region));
const slug = { 1: 'tohoku', 2: 'kanto', 3: 'chubu', 4: 'kinki', 5: 'chugoku-shikoku', 6: 'kyushu-okinawa', 7: 'abroad' };

const DOCS = [
  { file: '01_cover-guide', title: '扉・贈る言葉・使い方・剥がし方', pages: [titlePage(), messagePage(), guidePage(), removalPage()] },
  { file: '02_index-map', title: '全国制覇地図・産地索引・目録', pages: [mapPage(), prefIndexPage(),
    ...Array.from({ length: cfg.indexPages }, (_, i) => indexPage(i * 25 + 1, 25))] },
  { file: '03_dividers', title: '中扉', pages: REGIONS.map(dividerPage) },
  { file: '04_sheet_0_common', title: '台紙（共通・爪なし）', pages: sheets(null) },
  ...REGIONS.map((r) => ({ file: `04_sheet_${r.id}_${slug[r.id]}`, title: `台紙（${r.name}）`, pages: sheets(r) })),
  { file: '05_wide-sheet_A3', title: 'ワイド台紙（A3）', pages: [wideSheet()], a3: true },
  { file: '06_cover-parts', title: '題簽・背ラベル・落款', pages: [slipPage()] },
];

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through to the global install */ }
  const root = execSync('npm root -g').toString().trim();
  return import(path.join(root, 'playwright', 'index.mjs'));
}

const preview = process.argv.includes('--preview') && !BLEED;
const DEST = BLEED ? path.join(OUT, 'bleed') : OUT;
fs.mkdirSync(path.join(DEST, 'html'), { recursive: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();

for (const d of DOCS) {
  const html = doc(d.title, d.pages, d.a3);
  const htmlPath = path.join(DEST, 'html', `${d.file}.html`);
  fs.writeFileSync(htmlPath, html);
  await page.goto('file://' + htmlPath, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(DEST, `${d.file}.pdf`), preferCSSPageSize: true, printBackground: true });
  console.log('✓', path.relative(ROOT, path.join(DEST, `${d.file}.pdf`)));
}

if (preview) {
  fs.mkdirSync(IMG, { recursive: true });
  const shots = [
    ['01_cover-guide', 0, 'title'], ['01_cover-guide', 2, 'guide'], ['01_cover-guide', 3, 'peel'],
    ['02_index-map', 0, 'map'], ['02_index-map', 1, 'pref-index'], ['02_index-map', 2, 'index'],
    ['03_dividers', 2, 'divider'], ['04_sheet_3_chubu', 0, 'sheet-front'], ['04_sheet_3_chubu', 1, 'sheet-back'],
    ['05_wide-sheet_A3', 0, 'wide'], ['06_cover-parts', 0, 'cover-parts'],
  ];
  await page.setViewportSize({ width: 1700, height: 1200 });
  for (const [file, idx, name] of shots) {
    await page.goto('file://' + path.join(OUT, 'html', `${file}.html`), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: 'print' });
    const el = (await page.$$('section.page'))[idx];
    await el.screenshot({ path: path.join(IMG, `${name}.png`), scale: 'css' });
    console.log('🖼', `${name}.png`);
  }
}
await browser.close();
