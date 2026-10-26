// 酒標帖のページ描画。どの関数も <section class="page"> の HTML 文字列を返す。
// Node のビルド（templates/build.mjs）と、検索・印刷ページ（site/app.js）の両方から使う。
//
// 見開きの考え方（A4 横のページ 2 枚で 1 本）
//   左ページ＝ラベル台紙（表ラベル）  … 綴じ側が右、小口が左
//   右ページ＝銘板（メーカー名・QR・裏ラベル） … 綴じ側が左、小口が右
import { TYPES, REGIONS, TILES } from './data.js';

let cfg = {};
let qrcode = null;

// cfg: config.json の中身、qr: qrcode-generator の関数
export function setup(config, qr) {
  cfg = config;
  qrcode = qr;
  if (qrcode?.stringToBytesFuncs?.['UTF-8']) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
}

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mm = (n) => `${+n.toFixed(2)}mm`;
const pad = (n) => String(n).padStart(3, '0');
const brand = () => esc([cfg.title, cfg.recipient && `${cfg.recipient} 蔵`].filter(Boolean).join(' · '));

// ---------------------------------------------------------------- 部品

// QR コード（SVG）。周囲に 4 モジュール分の余白を含めて size mm 角
export function qrSvg(text, size) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), quiet = 4, total = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  return `<svg width="${mm(size)}" height="${mm(size)}" viewBox="0 0 ${total} ${total}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#1f1c1a"/></svg>`;
}

// QR を置く場所。URL が無ければ点線の枠だけ
function qrBox(url, size, placeholder) {
  if (url) return `<div class="qr">${qrSvg(url, size)}</div>`;
  return `<div style="width:${mm(size)};height:${mm(size)};border:.3mm dashed var(--line);display:flex;align-items:center;justify-content:center;
    text-align:center;font-family:var(--gothic);font-size:5.6pt;line-height:1.5;color:#b3aba0">${placeholder}</div>`;
}

const TAB_TOP = 22, TAB_PITCH = 34, TAB_H = 31;

function tab(type, side) {
  const top = TAB_TOP + (type.id - 1) * TAB_PITCH;
  return `<div class="tab ${side}" style="top:${mm(top)};height:${mm(TAB_H)};background:${type.color}">
    <span class="n">${type.num}</span>${esc(type.name)}</div>`;
}

function mount({ left, top, width, height, hint }) {
  return `<div class="mount" style="left:${mm(left)};top:${mm(top)};width:${mm(width)};height:${mm(height)}">
    <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
    <i class="m t"></i><i class="m b"></i><i class="m l"></i><i class="m r"></i>
    <span class="hint">${hint}</span></div>`;
}

export const chip = (t) => `<span class="chip"><i style="background:${t.color}"></i>${t.num} ${esc(t.name)}</span>`;
const field = (label, style = 'flex:1') =>
  `<div class="field" style="${style}"><span class="lbl">${label}</span><span class="fill"></span></div>`;
const numBox = (type) => `<div class="no"><span class="k">No.</span>${type ? `<span class="pfx" style="color:${type.color}">${type.prefix}</span>` : ''}<span class="box"></span></div>`;
const heading = (title, note) => `<div style="display:flex;align-items:baseline;gap:3mm"><span style="font-weight:800;font-size:10.5pt;letter-spacing:.3em">${title}</span><span class="lbl">${note}</span></div>
    <div class="rule thin" style="margin:1.5mm 0 3.5mm"></div>`;
const foot = (left, width, l, r) => `<div class="foot" style="left:${mm(left)};width:${mm(width)};bottom:5mm"><span>${l}</span><span>${r}</span></div>`;

export function seal(text, size) {
  const chars = [...text];
  const fs = chars.length <= 2 ? size * 0.38 : size * 0.34;
  let glyphs;
  if (chars.length <= 2) {
    glyphs = chars.map((ch, i) =>
      `<text x="${size / 2}" y="${size * (chars.length === 1 ? 0.5 : 0.3 + i * 0.4)}" font-size="${chars.length === 1 ? size * 0.6 : fs}">${esc(ch)}</text>`).join('');
  } else { // 4文字：右上→右下→左上→左下（縦書きの順）
    const pos = [[0.71, 0.3], [0.71, 0.7], [0.29, 0.3], [0.29, 0.7]];
    glyphs = chars.slice(0, 4).map((ch, i) =>
      `<text x="${size * pos[i][0]}" y="${size * pos[i][1]}" font-size="${fs}">${esc(ch)}</text>`).join('');
  }
  return `<svg width="${mm(size)}" height="${mm(size)}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.4" y="0.4" width="${size - 0.8}" height="${size - 0.8}" rx="${size * 0.07}" fill="#b7282e"/>
    <rect x="${size * 0.09}" y="${size * 0.09}" width="${size * 0.82}" height="${size * 0.82}" rx="${size * 0.03}" fill="none" stroke="#fff" stroke-width="${size * 0.025}"/>
    <g fill="#fff" font-family="Shippori Mincho" font-weight="800" text-anchor="middle" dominant-baseline="central">${glyphs}</g></svg>`;
}

function milestones(steps, size = 15) {
  return steps.map(([t, n]) => `<div style="display:flex;align-items:center;gap:3mm">
      <div style="width:${mm(size)};height:${mm(size)};flex:none;border:.3mm dashed var(--line);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--gothic);font-size:6.2pt;color:#b3aba0">${n}</div>
      <div style="flex:1"><div style="font-weight:600;font-size:8.6pt;letter-spacing:.1em">${t}</div>
        <div style="border-bottom:.25mm solid var(--line);height:5mm"></div></div></div>`).join('');
}

// ---------------------------------------------------------------- 見開き

// 左ページ：ラベル台紙（表ラベルを貼る）
export function labelPage(type) {
  const L = 20, W = 258;
  return `<section class="page">
  <div class="hdr" style="left:${mm(L)};top:7mm;width:${mm(W)}">
    ${numBox(type)}
    ${field('銘柄')}
    <span class="lbl" style="padding-bottom:1mm">${chip(type)}　ラベル台紙</span>
  </div>
  ${mount({ left: L, top: 22, width: W, height: 176, hint: '表ラベル　FRONT LABEL ─ 縦長の大きいラベルは横向きに' })}
  ${foot(L, W, brand(), '右ページ（銘板）へ続く')}
  ${tab(type, 'left')}
</section>`;
}

// 「新潟」→「新潟県」、「東京」→「東京都」
export function prefName(pref) {
  if (!pref) return '';
  if (pref === '京都' || pref === '大阪') return pref + '府';
  if (pref === '北海道' || /[都道府県]$/.test(pref)) return pref;
  return pref + (pref === '東京' ? '都' : '県');
}

// 名前の長さに合わせて、縦書きの文字の大きさを決める（pt）
function makerFontSize(name, columnMm) {
  const n = Math.max([...name].length, 1);
  return Math.max(16, Math.min(54, (columnMm / n) / 0.3528 * 0.9));
}

// 右ページ：銘板（メーカー名・QR・裏ラベル）。maker が無ければ手書き用の空欄
// maker: { name, kana, pref, city, url }
export function meibanPage(type, maker = null) {
  const L = 20, W = 262;
  // 所在地はメーカー名の右に縦書きで（「新潟県　〇〇市」）
  const place = maker ? [prefName(maker.pref), maker.city].filter(Boolean).join('　') : '';
  const nameCol = 140;
  const name = maker
    ? `<div style="display:flex;justify-content:center;align-items:center;height:${mm(nameCol)}">
        <div style="display:flex;flex-direction:row-reverse;align-items:flex-start;gap:3mm;max-height:100%">
          ${place ? `<div style="writing-mode:vertical-rl;font-family:var(--kaisho);font-size:14pt;letter-spacing:.12em;margin:0 2mm 0 0;padding-top:4mm;color:#3a3531">${esc(place)}</div>` : ''}
          ${maker.kana ? `<div class="g" style="writing-mode:vertical-rl;font-size:7.4pt;letter-spacing:.35em;color:var(--sub);align-self:center">${esc(maker.kana)}</div>` : ''}
          <div class="maker" style="font-size:${makerFontSize(maker.name, nameCol).toFixed(1)}pt;letter-spacing:.06em">${esc(maker.name)}</div>
        </div>
      </div>`
    : `<div style="display:flex;flex-direction:row-reverse;justify-content:center;align-items:flex-start;gap:4mm;height:${mm(nameCol)}">
        <div style="width:11mm;height:78%;margin-top:6mm;border:.25mm dashed var(--faint);display:flex;align-items:flex-end;justify-content:center;padding-bottom:2mm">
          <span class="lbl" style="writing-mode:vertical-rl;color:#b3aba0;letter-spacing:.3em">所在地</span></div>
        <div style="width:24mm;height:100%;border:.25mm dashed var(--faint);display:flex;align-items:flex-end;justify-content:center;padding-bottom:2mm">
          <span class="lbl" style="writing-mode:vertical-rl;color:#b3aba0;letter-spacing:.3em">メーカー名を筆ペンで</span></div></div>`;
  // 味わい：両端の言葉か、間の点をペンで丸する
  const taste = type.taste.map(([a, b]) => `<div class="taste"><span>${esc(a)}</span><i></i><i></i><i></i><span>${esc(b)}</span></div>`).join('');
  return `<section class="page">
  <div class="hdr" style="left:${mm(L)};top:7mm;width:132mm">
    ${numBox(type)}
    <span class="lbl" style="margin-left:auto;padding-bottom:1mm">裏ラベル　BACK LABEL</span>
  </div>
  ${mount({ left: L, top: 22, width: 132, height: 176, hint: '裏ラベル・肩ラベル' })}
  <div class="abs" style="left:160mm;top:9mm;width:120mm;display:flex;align-items:flex-end;justify-content:space-between;gap:3mm">
    <span style="display:flex;gap:3mm;align-items:center">${chip(type)}<span class="lbl">${esc(type.makerLabel)}</span></span>
    <span class="date"><span class="lbl">日付</span><i style="width:13mm"></i>年<i></i>月<i></i>日</span>
  </div>
  <div class="abs rule thin" style="left:160mm;top:18mm;width:120mm"></div>
  <div class="abs" style="left:160mm;top:24mm;width:88mm">${name}</div>
  <div class="abs" style="left:166mm;top:${mm(198 - 26 + 1)};width:78mm">
    <div class="lbl" style="margin-bottom:1.6mm;letter-spacing:.3em">味わい</div>${taste}
  </div>
  <div class="abs" style="left:254mm;top:${mm(198 - 26 - 5)};width:26mm;text-align:center">
    ${qrBox(maker?.url, 26, maker ? '公式サイト<br>未登録' : 'QR')}
    <div class="lbl" style="margin-top:1mm;font-size:5.8pt">${maker?.url ? '公式サイト' : ''}</div>
  </div>
  ${foot(L, W, '銘板', brand())}
  ${tab(type, 'right')}
</section>`;
}

// ---------------------------------------------------------------- 扉・使い方

export function titlePage() {
  // 名前があれば「〇〇〇 蔵」、無ければ手書き用の線と「蔵」
  const who = cfg.recipient
    ? `<span style="font-size:17pt;font-weight:600;letter-spacing:.3em">${esc(cfg.recipient)}<span style="font-weight:800;letter-spacing:0;margin-top:1.5mm;display:inline-block">蔵</span></span>`
    : `<span style="display:inline-block;height:44mm;border-left:.3mm solid var(--line)"></span><span style="font-size:16pt;font-weight:800;margin-top:4mm">蔵</span>`;
  return `<section class="page">
  <div class="abs" style="inset:12mm;border:.5mm solid var(--ink)"></div>
  <div class="abs" style="inset:14mm;border:.2mm solid var(--ink)"></div>
  <div class="abs g sub" style="right:58mm;top:33mm;writing-mode:vertical-rl;font-size:8pt;letter-spacing:.6em">${esc(cfg.titleReading)}</div>
  <div class="abs" style="right:66mm;top:30mm;writing-mode:vertical-rl;display:flex;align-items:flex-start">
    <span style="font-weight:800;font-size:56pt;letter-spacing:.32em;line-height:1">${esc(cfg.title)}</span>
    <span style="font-weight:600;font-size:14pt;letter-spacing:.3em;margin-top:5mm">第${esc(cfg.volume)}巻</span>
  </div>
  <div class="abs" style="left:150mm;top:70mm;writing-mode:vertical-rl;display:flex;align-items:flex-start;gap:3mm">
    ${who}
    <span style="margin-top:8mm">${seal(cfg.sealText, 15)}</span>
  </div>
  <div class="abs" style="left:24mm;bottom:24mm;display:flex;align-items:flex-end;gap:4mm">
    ${qrBox(cfg.siteUrl, 24, '公開URLが<br>決まったら<br>ここにQR')}
    <div class="g" style="font-size:7pt;line-height:1.7;color:var(--sub)"><b style="color:var(--ink);font-size:8pt">台紙の追加・印刷</b><br>メーカーを探して<br>銘板を印刷できます</div>
  </div>
  <div class="abs" style="left:24mm;top:24mm;display:flex;flex-direction:column;gap:2mm">${TYPES.map(chip).join('')}</div>
  <div class="abs g" style="right:24mm;bottom:22mm;font-size:7pt;letter-spacing:.6em;color:var(--sub)">${esc(cfg.subtitle)}　VOL.${['', '壱', '弐', '参', '肆', '伍'].indexOf(cfg.volume) || 1}</div>
</section>`;
}

// 使い方ページ用：見開きとポケットの関係の図
function spreadDiagram() {
  const t = TYPES[0];
  const page = (inner, caption, sub) => `<div style="text-align:center">
    <div style="position:relative;width:42mm;height:29.7mm;border:.3mm solid var(--ink);background:#fff">${inner}</div>
    <div class="lbl" style="margin-top:1.4mm;color:var(--ink)">${caption}</div><div class="lbl">${sub}</div></div>`;
  const left = page(`<div style="position:absolute;left:4mm;right:5mm;top:5mm;bottom:4mm;border:.25mm solid var(--line);background:#f3efe8;display:flex;align-items:center;justify-content:center;font-size:7pt;font-weight:600">表ラベル</div>
      <div style="position:absolute;left:-.3mm;top:3mm;width:2mm;height:6mm;background:${t.color}"></div>`, '左：ラベル台紙', 'ポケット①の裏面');
  const right = page(`<div style="position:absolute;left:3mm;top:5mm;bottom:4mm;width:18mm;border:.25mm solid var(--line);background:#f3efe8;display:flex;align-items:center;justify-content:center;font-size:6pt;font-weight:600">裏ラベル</div>
      <div style="position:absolute;left:26mm;top:5mm;writing-mode:vertical-rl;font-family:var(--kaisho);font-size:11pt">〇〇酒造</div>
      <div style="position:absolute;right:4mm;bottom:3.5mm;width:5mm;height:5mm;background:repeating-conic-gradient(var(--ink) 0 25%, #fff 0 50%) 0 0/1.6mm 1.6mm"></div>
      <div style="position:absolute;right:-.3mm;top:3mm;width:2mm;height:6mm;background:${t.color}"></div>`, '右：銘板', 'ポケット②の表面');
  return `<div style="display:flex;gap:0;align-items:flex-start;justify-content:center">${left}<div style="width:.6mm;height:29.7mm;background:var(--ink)"></div>${right}</div>`;
}

export function guidePage() {
  return `<section class="page">
  <div class="abs" style="left:20mm;top:14mm;width:257mm">
    <div class="pagetitle">この帖の使い方<small>HOW TO USE</small></div>
    <div class="rule" style="margin:3mm 0 4mm"></div>
    <div style="display:flex;gap:12mm">
      <div class="prose" style="flex:1.15;font-size:9pt;line-height:1.85">
        <p>一本呑んだら<b>見開きひとつ</b>。左ページに表ラベル、右ページにはその酒の<b>造り手の銘板</b>と裏ラベル。銘板の QR を読めば、造り手の公式サイトが開きます。</p>
        <ol class="steps" style="margin-top:3mm">
          <li><b>剥がす</b>　ラベルを剥がして乾かす（次の頁）。</li>
          <li><b>番号を振る</b>　その区分の「目録」の次の番号を、左右両ページの No. 欄と目録に書く。</li>
          <li><b>銘板を用意する</b>　扉の QR から検索ページを開き、造り手を探して<b>銘板とラベル台紙</b>を印刷。見つからなければ名前を入力して作れる。空の銘板に筆ペンで書いてもいい。</li>
          <li><b>貼る</b>　表ラベルは左のラベル台紙へ、裏ラベル・肩ラベルは右の銘板の枠へ。</li>
          <li><b>綴じる</b>　右の図のように、ラベル台紙を前のポケットの裏面、銘板を次のポケットの表面に入れる。</li>
          <li><b>塗る</b>　「全国制覇地図」の県を塗る。</li>
        </ol>
      </div>
      <div style="flex:1">
        <div style="font-weight:800;font-size:10.5pt;letter-spacing:.2em;margin-bottom:3mm">見開きとポケット</div>
        ${spreadDiagram()}
        <p class="prose note" style="margin-top:4mm;font-size:7.6pt">ポケット 1 枚には表と裏で 2 ページ入る。<b>ある酒の銘板</b>と<b>次の酒のラベル台紙</b>が背中合わせになる。<br>
        途中に一本差し込むときは、空のポケットを 1 枚足して、後ろの銘板を 1 つ移すだけ。</p>
        <div class="panel" style="margin-top:4mm">
          <div style="font-weight:800;font-size:9.5pt;letter-spacing:.15em;margin-bottom:1.5mm">探すとき</div>
          <p class="prose note" style="font-size:7.6pt">区分は小口の色の爪で。番号が分かれば目録から。造り手の名前は右ページに大きく書かれているので、ぱらぱらめくっても見つかる。</p>
        </div>
      </div>
    </div>
  </div>
  ${foot(20, 257, '', brand())}
</section>`;
}

export function removalPage() {
  const card = (k, title, who, body) => `<div class="panel" style="margin-bottom:3mm">
    <div style="display:flex;align-items:baseline;gap:3mm;margin-bottom:1mm"><span style="font-weight:800;font-size:12pt;color:var(--shu)">${k}</span>
      <span style="font-weight:800;font-size:10.5pt;letter-spacing:.12em">${title}</span><span class="lbl">${who}</span></div>
    <div class="prose" style="font-size:8.4pt;line-height:1.8">${body}</div></div>`;
  return `<section class="page">
  <div class="abs" style="left:20mm;top:14mm;width:257mm">
    <div class="pagetitle">ラベルの剥がし方<small>HOW TO PEEL</small></div>
    <div class="rule" style="margin:3mm 0 4mm"></div>
    <div style="display:flex;gap:10mm">
      <div style="flex:1.2">
        <p class="prose" style="margin-bottom:3mm;font-size:8.8pt">まず<b>ラベルの端を爪で少しめくって</b>みる。紙がそのまま浮けば「のり貼り」、ツルッとしたフィルムや粘着が伸びれば「シール」。</p>
        ${card('一', 'ぬるま湯に浸ける', '紙ラベル・のり貼り（日本酒に多い）',
          '空き瓶に水を入れて沈め、<b>40℃前後のぬるま湯</b>に20〜30分。端からゆっくり剥がす。固ければ一晩。お湯に台所用洗剤を少し入れると早い。')}
        ${card('二', 'ドライヤーで温める', 'シール・粘着タイプ（ウイスキー・ジン・ワイン・ビール）',
          'ラベル全体を1〜2分温め、粘着がやわらいだら端から<b>ゆっくり、低い角度で</b>引く。冷めたらまた温める。')}
        ${card('三', 'ラベル剥がしシートを使う', 'どうしても剥がれないもの',
          'ワイン用の透明な「ラベル剥がしシート」を上から貼り、こすってから剥がすと、ラベルの表面だけが写し取られる。')}
      </div>
      <div style="flex:1">
        <div style="font-weight:800;font-size:10.5pt;letter-spacing:.14em;margin-bottom:1.5mm"><span style="color:var(--shu)">◇</span> 乾かし方</div>
        <p class="prose" style="font-size:8.6pt">濡れたラベルは<b>キッチンペーパーで挟み、平らな所で本などの重しを載せて一晩</b>。しっかり乾くまで貼らない（波打ち・カビの原因）。</p>
        <div style="font-weight:800;font-size:10.5pt;letter-spacing:.14em;margin:4mm 0 1.5mm"><span style="color:var(--shu)">◇</span> 気をつけること</div>
        <p class="prose note" style="font-size:7.8pt">・冷えた瓶にいきなり熱湯をかけない（割れることがある）。<br>・剥がした後の瓶は割れ物。布巾の上で作業する。<br>
        ・剥がせない・瓶に直接印刷されている・お店で呑んだ一杯は、写真で残す。</p>
        <div class="panel" style="margin-top:4mm">
          <div style="font-weight:800;font-size:9.5pt;letter-spacing:.2em;margin-bottom:1.5mm">あると便利な道具</div>
          <div class="g" style="font-size:7.6pt;line-height:1.75">・フォトコーナー（透明）…ラベルの四隅を留める<br>・弱粘着の両面テープ…貼り直しができる<br>
            ・ラベル剥がしシート…剥がれない一枚の切り札<br>・グラシン袋…肩ラベル・封緘シール入れ<br>・キッチンペーパーと重し…乾かすときに</div>
        </div>
      </div>
    </div>
  </div>
  ${foot(20, 257, '', brand())}
</section>`;
}

// ---------------------------------------------------------------- 地図・目録・中扉

export function mapPage() {
  const P = 12, T = 11.3, X0 = 20, Y0 = 30;
  const tiles = Object.entries(TILES).map(([name, [col, row]]) =>
    `<div class="abs" style="left:${mm(X0 + col * P)};top:${mm(Y0 + row * P)};width:${mm(T)};height:${mm(T)};border:.35mm solid var(--ink);
      display:flex;align-items:center;justify-content:center;font-family:var(--gothic);font-weight:500;font-size:${name.length > 2 ? 5.8 : 7.2}pt">${name}</div>`).join('');
  const steps = [['初めの一県', '1'], ['十県', '10'], ['折り返し', '24'], ['全国制覇', '47']];
  return `<section class="page">
  <div class="abs" style="left:${mm(X0)};top:${mm(Y0)};width:100mm">
    <div class="pagetitle" style="font-size:20pt">全国制覇地図</div>
    <div class="lbl" style="margin-top:1.5mm;letter-spacing:.3em">MAP OF JAPAN</div>
    <p class="prose" style="margin-top:3mm;font-size:8.4pt;line-height:1.8">造り手のいる県を塗りつぶしてゆく。<br>区分の色で塗り分けても楽しい。</p>
  </div>
  ${tiles}
  <div class="abs" style="left:${mm(X0)};top:${mm(Y0 + 10 * P + 6)};width:${mm(15 * P)}">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2.4mm 6mm">
      ${REGIONS.map((r) => `<div style="display:flex;align-items:flex-end;gap:2mm;height:7mm;border-bottom:.25mm solid var(--faint)">
        <span style="font-size:8.4pt;letter-spacing:.1em;flex:1">${esc(r.name)}</span><span style="font-size:8.6pt">／ ${r.prefs.length}</span></div>`).join('')}
    </div>
  </div>
  <div class="abs" style="left:215mm;top:${mm(Y0)};width:62mm">
    <div style="display:flex;align-items:flex-end;gap:2mm"><span style="font-weight:800;font-size:11pt;letter-spacing:.2em">制覇</span>
      <span style="display:inline-block;width:16mm;border-bottom:.45mm solid var(--ink);height:8mm"></span><span style="font-size:11pt">／ 四十七</span></div>
    <div style="margin-top:8mm">${heading('道しるべ', '印を押す・日付を書く')}</div>
    <div style="display:flex;flex-direction:column;gap:4mm">${milestones(steps)}</div>
    <div style="margin-top:6mm;display:flex;flex-wrap:wrap;gap:1.4mm 3mm">${TYPES.map(chip).join('')}</div>
  </div>
  ${foot(20, 257, '', brand())}
</section>`;
}

export function indexPage(type, start, count) {
  const end = start + count - 1;
  const ms = new Set([10, 25, 50, 77, 88, 100, 150, 200]);
  const rows = Array.from({ length: count }, (_, i) => {
    const n = start + i;
    return `<tr class="${ms.has(n) ? 'ms' : ''}"><td class="num">${type.prefix}${pad(n)}</td><td></td><td></td><td></td><td></td><td></td></tr>`;
  }).join('');
  return `<section class="page">
  <div class="abs" style="left:20mm;top:12mm;width:257mm;display:flex;align-items:flex-end;justify-content:space-between">
    <div class="pagetitle" style="font-size:18pt">目録<small>${type.en} INDEX　${type.prefix}${pad(start)} – ${type.prefix}${pad(end)}</small></div>
    <span style="display:flex;align-items:center;gap:3mm">${chip(type)}${seal(cfg.sealText, 10)}</span>
  </div>
  <div class="abs" style="left:20mm;top:27mm;width:257mm">
    <table class="idx">
      <colgroup><col style="width:17mm"><col><col style="width:62mm"><col style="width:26mm"><col style="width:24mm"><col style="width:56mm"></colgroup>
      <tr><th>No.</th><th>銘柄</th><th>造り手（${esc(type.makerLabel)}）</th><th>産地</th><th>呑んだ日</th><th>ひとこと</th></tr>
      ${rows}
    </table>
  </div>
  ${foot(20, 257, '番号は呑んだ順。朱色の番号は節目の一本。', brand())}
  ${tab(type, 'right')}
</section>`;
}

export function dividerPage(t) {
  return `<section class="page">
  <div class="abs edgeband" style="left:0;top:0;bottom:0;width:6mm;background:${t.color}"></div>
  <div class="abs" style="left:40mm;top:42mm;font-weight:800;font-size:100pt;line-height:1;color:${t.color}">${t.num}</div>
  <div class="abs" style="left:42mm;top:92mm;font-weight:800;font-size:28pt;letter-spacing:.3em">${esc(t.name)}</div>
  <div class="abs lbl" style="left:43mm;top:107mm;letter-spacing:.3em">${t.en}　／　${t.colorName}色の爪　／　No. ${t.prefix}001〜</div>
  <div class="abs" style="left:42mm;top:122mm;width:150mm;border-top:.45mm solid ${t.color};padding-top:4mm;font-size:11pt;letter-spacing:.2em">
    目録 <span style="color:var(--line)">›</span> 見開き（ラベル台紙＋銘板）を番号順に</div>
  <div class="abs" style="left:42mm;top:150mm;display:flex;align-items:flex-end;gap:3mm">
    <span style="font-weight:600;letter-spacing:.2em">収蔵</span><span style="display:inline-block;width:24mm;height:9mm;border-bottom:.45mm solid var(--ink)"></span><span style="letter-spacing:.2em">本</span></div>
  ${foot(42, 235, '', brand())}
  ${tab(t, 'right')}
</section>`;
}

// ---------------------------------------------------------------- 表紙まわり（A4 縦に面付け）

// 題簽・背ラベル・表紙の QR シール
export function coverPartsPage() {
  const daisen = (w, h, fs) => `<div style="width:${mm(w)};height:${mm(h)};border:.2mm solid var(--line);padding:2mm">
    <div style="width:100%;height:100%;border:.5mm solid var(--ink);outline:.2mm solid var(--ink);outline-offset:-1.4mm;
      writing-mode:vertical-rl;display:flex;align-items:center;justify-content:space-between;padding:${mm(h * 0.08)} 0">
      <span style="font-weight:800;font-size:${fs}pt;letter-spacing:.35em">${esc(cfg.title)}</span>
      <span style="font-weight:600;font-size:${fs * 0.42}pt;letter-spacing:.2em">${esc(cfg.volume)}</span></div></div>`;
  const spine = (w) => `<div style="width:${mm(w)};height:170mm;border:.2mm solid var(--line);background:#fff;
      writing-mode:vertical-rl;display:flex;align-items:center;justify-content:space-between;padding:10mm 0 8mm">
      <span style="font-weight:800;font-size:${Math.min(w * 0.7, 24)}pt;letter-spacing:.3em">${esc(cfg.title)}</span>
      <span style="display:flex;flex-direction:column;align-items:center;gap:3mm">
        <span style="font-weight:600;font-size:${Math.min(w * 0.34, 11)}pt;letter-spacing:.3em">第${esc(cfg.volume)}巻</span>
        ${seal(cfg.sealText, Math.min(w * 0.42, 11))}</span></div>`;
  const sticker = (size) => `<div style="width:${mm(size + 10)};border:.2mm solid var(--line);padding:3mm;text-align:center">
      ${qrBox(cfg.siteUrl, size, '公開URLが<br>決まったら<br>ここにQR')}
      <div style="font-weight:800;font-size:${size > 25 ? 7.5 : 6.5}pt;letter-spacing:.15em;margin-top:1.6mm">台紙の追加・印刷</div></div>`;
  return `<section class="page portrait">
  <div class="abs" style="left:16mm;top:14mm;width:178mm;display:flex;align-items:flex-end;justify-content:space-between">
    <div class="pagetitle" style="font-size:15pt">表紙まわり<small>COVER PARTS</small></div>
    <span class="lbl">和紙やシール用紙に印刷し、外側の細線で切り取る</span></div>
  <div class="abs" style="left:16mm;top:30mm;display:flex;gap:4mm;align-items:flex-start">
    <div><div class="lbl" style="margin-bottom:1.5mm">題簽（大）</div>${daisen(34, 150, 26)}</div>
    <div><div class="lbl" style="margin-bottom:1.5mm">題簽（小）</div>${daisen(26, 115, 19)}</div>
    <div><div class="lbl" style="margin-bottom:1.5mm">背 25mm</div>${spine(25)}</div>
    <div><div class="lbl" style="margin-bottom:1.5mm">背 35mm</div>${spine(35)}</div>
    <div><div class="lbl" style="margin-bottom:1.5mm">背 45mm</div>${spine(45)}</div>
  </div>
  <div class="abs" style="left:16mm;top:212mm;width:178mm">
    <div class="lbl" style="margin-bottom:2mm">表紙の隅に貼る QR シール（検索・印刷ページへ）</div>
    <div style="display:flex;gap:8mm;align-items:flex-end">${sticker(30)}${sticker(22)}</div>
  </div>
</section>`;
}

// はんこ店へのデータ入稿用：落款だけを載せた原稿
export function sealOrderPage() {
  return `<section class="page portrait">
  <div class="abs" style="left:20mm;top:18mm;width:170mm">
    <div class="pagetitle" style="font-size:15pt">落款 入稿原稿<small>SEAL ARTWORK</small></div>
    <div class="rule" style="margin:3mm 0 6mm"></div>
    <div style="display:flex;align-items:flex-end;gap:12mm">
      <div style="text-align:center">${seal(cfg.sealText, 60)}<div class="lbl" style="margin-top:2mm">拡大（確認用）</div></div>
      <div style="text-align:center">${seal(cfg.sealText, 21)}<div class="lbl" style="margin-top:2mm">21mm 角（実寸）</div></div>
      <div style="text-align:center">${seal(cfg.sealText, 15)}<div class="lbl" style="margin-top:2mm">15mm 角（実寸）</div></div>
    </div>
    <div class="panel prose note" style="margin-top:10mm;font-size:8.4pt">
      印文：「${esc(cfg.sealText)}」／<b>白文</b>（文字が白く抜ける）、内側に白い枠線／書体：しっぽり明朝 ExtraBold（SIL Open Font License）<br>
      このデザインどおりの印面で、上のいずれかの実寸サイズの角印を希望します。朱色の部分が朱肉で写る部分です。</div>
  </div>
</section>`;
}
