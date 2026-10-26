// 1 枚もののまとめ（A4 横）
//   quickGuidePage()  … 贈る相手向けの「つかいかた」早見表（ポップな版。帖の最初のポケットや箱に添える）
//   makingStepsPage() … 作る人向けの「ファイル作成手順」（材料・印刷・組み立て・チェック）
// 帖の本文ではないので、検索・印刷ページ（site/）では使わない
import { TYPES } from '../site/lib/data.js';
import { esc, qrSvg, seal } from '../site/lib/render.js';

let cfg = {};
export const setupHandouts = (config) => { cfg = config; };

const mm = (n) => `${+n.toFixed(2)}mm`;
const SHU = '#b7282e';

// 線画のアイコン（size は mm）
const ICONS = {
  bottle: '<path d="M10 2h4v5c0 1 3 2 3 6v9a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-9c0-4 3-5 3-6z"/><rect x="8.5" y="13" width="7" height="6" rx=".6"/>',
  tag: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h3M7 14h10"/><circle cx="16" cy="10" r="1.3"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.4"/><rect x="9" y="6" width="6" height="6"/><path d="M11 18h2"/>',
  label: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M8 10h8M8 14h5"/>',
  pen: '<path d="M4 20l3-1 11-11-2-2L5 17z"/><path d="M14 6l2 2"/><ellipse cx="16" cy="18" rx="5" ry="3"/>',
  pocket: '<rect x="3" y="5" width="9" height="14" rx="1"/><rect x="12" y="5" width="9" height="14" rx="1"/><path d="M12 5v14"/><circle cx="5" cy="8" r=".6"/><circle cx="5" cy="16" r=".6"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
};
const icon = (name, size, color) => `<svg width="${mm(size)}" height="${mm(size)}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const POP_CSS = `
.pop { font-family: 'Zen Maru Gothic', var(--gothic); color: var(--ink); }
.pop b { font-weight: 900; }
.pop .card { position: relative; border-radius: 5mm; padding: 4.6mm 4.8mm 4.2mm; min-height: 53mm; }
.pop .head { display: flex; align-items: center; justify-content: space-between; gap: 2mm; }
.pop .num { position: absolute; left: -2.5mm; top: -3mm; width: 10mm; height: 10mm; border-radius: 50%; color: #fff;
  display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 15pt; box-shadow: 0 .6mm 0 rgba(0,0,0,.18); }
.pop .ttl { font-weight: 900; font-size: 14pt; letter-spacing: .05em; margin-left: 5mm; line-height: 1.2; white-space: nowrap; }
.pop .txt { font-size: 9.8pt; line-height: 1.7; margin-top: 2.6mm; }
.pop .ic { flex: none; line-height: 0; }
.pop .bubble { border-radius: 4mm; padding: 3mm 4mm; }
.pop .tiny { font-size: 7.6pt; line-height: 1.6; color: var(--sub); }
.mk { font-family: var(--gothic); color: var(--ink); }
.mk h2 { font-family: var(--mincho); font-weight: 800; font-size: 11pt; letter-spacing: .18em; margin-bottom: 1.6mm; display: flex; align-items: center; gap: 2mm; }
.mk h2 i { width: 2mm; height: 4.6mm; background: ${SHU}; display: inline-block; }
.mk table { width: 100%; border-collapse: collapse; font-size: 7.8pt; line-height: 1.45; }
.mk td, .mk th { border-bottom: .2mm solid var(--faint); padding: .9mm 1.2mm; vertical-align: top; text-align: left; }
.mk th { font-weight: 700; color: var(--sub); font-size: 6.6pt; border-bottom-color: var(--line); }
.mk .box { display: inline-block; width: 2.8mm; height: 2.8mm; border: .25mm solid var(--ink); border-radius: .5mm; margin-right: 1.2mm; vertical-align: -.4mm; }
.mk .tl { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0; }
.mk .tl > div { position: relative; padding: 6.5mm 3mm 0 0; font-size: 7.8pt; line-height: 1.5; }
.mk .tl > div::before { content: ''; position: absolute; left: 0; right: 0; top: 2.2mm; border-top: .5mm solid var(--line); }
.mk .tl > div::after { content: ''; position: absolute; left: 0; top: .8mm; width: 3.2mm; height: 3.2mm; border-radius: 50%; background: var(--c); }
.mk .tl .when { display: block; font-weight: 700; font-size: 7.8pt; color: var(--c); letter-spacing: .05em; }
.mk .note { font-size: 6.8pt; color: var(--sub); line-height: 1.55; }
.mk .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 1.2mm; font-size: 7.6pt; }
.mk .flow span { border: .25mm solid var(--line); border-radius: 1mm; padding: .5mm 1.6mm; background: #fff; white-space: nowrap; }
.mk .flow em { font-style: normal; color: var(--sub); }`;
export const handoutCss = POP_CSS;

// ---------------------------------------------------------------- 贈る相手向け：つかいかた早見表
export function quickGuidePage() {
  const [sake, whisky, gin, wine, beer] = TYPES;
  const tint = (c, p = 13) => `color-mix(in srgb, ${c} ${p}%, #fff)`;
  const card = (n, color, ic, title, body) => `<div class="card" style="background:${tint(color)}">
      <div class="num" style="background:${color}">${n}</div>
      <div class="head"><div class="ttl">${title}</div><div class="ic">${icon(ic, 9.5, color)}</div></div>
      <div class="txt">${body}</div></div>`;
  const steps = [
    card(1, sake.color, 'bottle', '呑んで剥がす', '空いた瓶のラベルを剥がす。紙のラベルは<b>ぬるま湯</b>、シールは<b>ドライヤー</b>で温めて。キッチンペーパーに挟んで<b>一晩乾かす</b>。'),
    card(2, whisky.color, 'tag', '番号をつける', 'その区分の<b>目録</b>に、次の番号と名前を書く。左右のページの <b>No.</b> 欄にも同じ番号を。'),
    card(3, gin.color, 'phone', '銘板を印刷', '右の QR から台紙のページへ。造り手を探して<b>「＋ 印刷リストへ」→「印刷する」</b>。設定は<b>片面・A4横・倍率100%</b>。'),
    card(4, wine.color, 'label', '貼る', '表ラベルは<b>左のラベル台紙</b>、裏ラベル・肩ラベルは<b>右の銘板の枠</b>へ。フォトコーナーか弱い両面テープで。'),
    card(5, beer.color, 'pen', '書きこむ', '右上に<b>呑んだ日</b>。下の目盛りの<b>甘口・辛口</b>などを、ペンでぐるっと丸する。'),
    card(6, SHU, 'pocket', 'ポケットへ', 'ラベル台紙は<b>前のポケットの裏</b>、銘板は<b>次のポケットの表</b>へ。開くと見開きに。最後に<b>地図</b>の県を塗る！'),
  ];
  const typeRow = TYPES.map((t) => `<div style="display:flex;align-items:center;gap:1.6mm;font-size:8pt">
      <span style="width:5.4mm;height:5.4mm;border-radius:50%;background:${t.color};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:7pt">${t.prefix}</span>
      <b style="font-weight:700">${t.num} ${esc(t.name)}</b></div>`).join('');
  // 見開きの図（小）
  const mini = `<div style="display:flex;justify-content:center;align-items:flex-end;gap:0">
      <div style="width:26mm;height:18mm;border:.35mm solid var(--ink);border-radius:1mm 0 0 1mm;background:#fff;position:relative">
        <div style="position:absolute;inset:2.4mm 3mm 2.4mm 2.4mm;border-radius:.8mm;background:${tint(sake.color, 22)};display:flex;align-items:center;justify-content:center;font-size:6.4pt;font-weight:700">表ラベル</div></div>
      <div style="width:26mm;height:18mm;border:.35mm solid var(--ink);border-left:.8mm solid var(--ink);border-radius:0 1mm 1mm 0;background:#fff;position:relative">
        <div style="position:absolute;left:2mm;top:2.4mm;bottom:2.4mm;width:9mm;border-radius:.8mm;background:${tint(sake.color, 22)};display:flex;align-items:center;justify-content:center;font-size:5.6pt;font-weight:700;writing-mode:vertical-rl">裏ラベル</div>
        <div style="position:absolute;left:13.5mm;top:2.2mm;writing-mode:vertical-rl;font-family:var(--kaisho);font-size:8.5pt">〇〇酒造</div>
        <div style="position:absolute;right:1.8mm;bottom:1.8mm;width:4mm;height:4mm;background:repeating-conic-gradient(var(--ink) 0 25%, #fff 0 50%) 0 0/1.3mm 1.3mm"></div></div></div>
    <div class="tiny" style="text-align:center;margin-top:1.2mm">左＝前のポケットの裏<br>右＝次のポケットの表</div>`;

  return `<section class="page pop" style="background:#fffaf1">
  <div class="abs" style="left:-26mm;top:-30mm;width:60mm;height:60mm;border-radius:50%;background:${tint(sake.color, 16)}"></div>
  <div class="abs" style="right:-14mm;bottom:-20mm;width:60mm;height:60mm;border-radius:50%;background:${tint(beer.color, 20)}"></div>
  <div class="abs" style="right:70mm;top:-10mm;width:22mm;height:22mm;border-radius:50%;background:${tint(wine.color, 16)}"></div>

  <div class="abs" style="left:16mm;top:11mm;display:flex;align-items:center;gap:5mm">
    ${seal(cfg.sealText, 14)}
    <div>
      <div style="font-weight:900;font-size:25pt;letter-spacing:.1em;line-height:1.15">${esc(cfg.title)}の<span style="color:${SHU}">つかいかた</span></div>
      <div style="font-size:9.5pt;font-weight:700;letter-spacing:.12em;color:var(--sub)">一本呑んだら、見開きひとつ。ラベルと造り手が一緒にたまっていく帖です。</div>
    </div>
  </div>

  <div class="abs" style="left:16mm;top:43mm;width:196mm;display:grid;grid-template-columns:repeat(3,1fr);gap:7mm 5.5mm">
    ${steps.join('')}
  </div>

  <div class="abs" style="left:222mm;top:12mm;width:62mm;display:grid;gap:3.4mm">
    <div class="bubble" style="background:#fff;border:.5mm solid ${SHU};text-align:center">
      <div style="font-weight:900;font-size:10pt;color:${SHU};letter-spacing:.08em">台紙を足すのはここから</div>
      <div style="display:flex;justify-content:center;margin:2mm 0 1.2mm">${cfg.siteUrl ? qrSvg(cfg.siteUrl, 27) : ''}</div>
      <div class="tiny">表紙と扉にも同じ QR があります。<br>一覧に無い造り手は、名前を入力して作れる。</div>
    </div>
    <div class="bubble" style="background:#fff">
      <div style="font-weight:900;font-size:9pt;margin-bottom:1.6mm">色と番号で探す</div>
      <div style="display:grid;gap:1.3mm">${typeRow}</div>
      <div class="tiny" style="margin-top:1.6mm">ページの端の<b>色の爪</b>が区分。番号は区分ごとの通し番号（S001 …）。</div>
    </div>
    <div class="bubble" style="background:#fff">
      <div style="font-weight:900;font-size:9pt;margin-bottom:1.8mm">見開きのしくみ</div>
      ${mini}
    </div>
  </div>

  <div class="abs" style="left:16mm;top:175mm;width:196mm;display:flex;gap:4mm">
    <div class="bubble" style="flex:1;background:#fff;display:flex;gap:3mm;align-items:flex-start">
      ${icon('map', 9, SHU)}
      <div><div style="font-weight:900;font-size:9pt">全国制覇をめざす</div>
      <div class="tiny">造り手のいる都道府県を地図で塗る。節目の一本（朱色の番号）には落款を押して。</div></div></div>
    <div class="bubble" style="flex:1;background:#fff;display:flex;gap:3mm;align-items:flex-start">
      ${icon('label', 9, SHU)}
      <div><div style="font-weight:900;font-size:9pt">剥がせなかったら</div>
      <div class="tiny">瓶に直接印刷・お店の一杯などは、写真を印刷して貼れば OK。剥がし方のくわしくは帖の 3 ページ目。</div></div></div>
  </div>
</section>`;
}

// ---------------------------------------------------------------- 作る人向け：ファイル作成手順
export function makingStepsPage() {
  const C = { a: TYPES[0].color, b: TYPES[1].color, c: TYPES[2].color, d: TYPES[3].color, e: TYPES[4].color, f: SHU };
  const tl = [
    ['a', '1か月前', '落款はんこを発注', '06_seal-order.pdf をはんこ店へ（届くまで1〜2週間）'],
    ['b', '3〜4週間前', '材料をそろえる', '下の表。バインダーとポケットは<b>穴の規格をそろえる</b>'],
    ['c', '3週間前', '試し刷り', 'ラベル台紙と銘板を1枚ずつ刷り、ポケットで見開きにして確かめる'],
    ['d', '2週間前', '本番印刷', '右の表の分だけ。名前入りの扉も'],
    ['e', '1週間前', '組み立て・最初の数本', '下の順に綴じる。2〜3本ぶん埋めておく'],
    ['f', '当日', '包む', '帖・道具箱・一本目のお酒を風呂敷で'],
  ].map(([k, when, what, note]) => `<div style="--c:${C[k]}"><span class="when">${when}</span><div style="font-weight:700">${what}</div><div class="note">${note}</div></div>`).join('');

  const mats = [
    ['A4横バインダー（A4-E）', '短い辺で綴じる横型・背幅30〜40mm', '1,500〜4,000円'],
    ['A4横クリアポケット', 'PP製・中紙なし・50枚前後', '1,000〜2,000円'],
    ['マット紙（片面）', '0.15〜0.2mm・A4 50枚', '800〜1,500円'],
    ['インクジェット和紙', '題簽・背表紙用', '500〜1,000円'],
    ['マットのシール用紙', 'QRシール用', '300〜700円'],
    ['道具箱の中身', 'フォトコーナー・弱粘着両面テープ・剥がしシート・グラシン袋', '2,000〜3,500円'],
    ['落款はんこ＋朱肉', '06_seal-order.pdf で入稿', '3,500〜7,000円'],
    ['筆ペン・風呂敷', '空の銘板用（中字）・包む用', '1,300〜3,500円'],
  ].map(([a, b, c]) => `<tr><td style="white-space:nowrap"><span class="box"></span>${a}</td><td class="note" style="color:var(--sub)">${b}</td><td style="white-space:nowrap;text-align:right">${c}</td></tr>`).join('');

  const prints = [
    ['01 扉・使い方・剥がし方・地図', '<b>名前入り版</b>（手元に保存した PDF）', 'マット紙', '1部'],
    ['02 中扉・目録', '', 'マット紙', '1部'],
    ['03 ラベル台紙', '区分ごとのページを選んで', 'マット紙', '酒15・W5・G3・V3・B3'],
    ['04 空の銘板', '筆ペンで書く用', 'マット紙', '各区分2〜3枚'],
    ['銘板（造り手名入り）', '検索・印刷ページから', 'マット紙', '先に埋める分＋贈る一本'],
    ['05 表紙まわり', '1枚目：題簽・QRシール／2枚目：背表紙', '和紙・シール用紙', '各1枚'],
    ['07 つかいかた早見表', 'この 1 枚の相棒。最初のポケットへ', 'マット紙', '1枚'],
  ].map(([a, b, c, d]) => `<tr><td style="font-weight:700;white-space:nowrap">${a}</td><td>${b}</td><td style="white-space:nowrap">${c}</td><td style="white-space:nowrap">${d}</td></tr>`).join('');

  const order = ['07 早見表', '扉', '使い方', '剥がし方', '地図'].map((x) => `<span>${x}</span>`).join('<em>→</em>');
  const section = TYPES.map((t) => `<span style="border-color:${t.color};color:${t.color};font-weight:700">${t.num} ${esc(t.name)}</span>`).join('<em>→</em>');
  const checks = [
    '扉・表紙の QR をスマホで読むと、台紙のページが開く',
    '銘板の QR が造り手の公式サイトを開く（埋めた分すべて）',
    '左右のページで爪の色と高さがそろっている',
    '目録の No. と見開きの左右の No. が一致している',
    '題簽・背表紙・QR シールの端が浮いていない／落款がかすれていない',
    '贈る一本の銘板と、空の見開きが用意できている',
  ].map((x) => `<div style="font-size:7.9pt;line-height:1.5;margin-bottom:1.3mm"><span class="box"></span>${x}</div>`).join('');

  return `<section class="page mk">
  <div class="abs" style="left:14mm;top:10mm;width:269mm;display:flex;align-items:flex-end;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:4mm">${seal(cfg.sealText, 11)}
      <div class="pagetitle" style="font-size:17pt">${esc(cfg.title)}の作り方<small>作る人用・ファイル作成手順</small></div></div>
    <div class="note" style="text-align:right">くわしくは docs/making-guide.md／印刷データは print/<br>価格は 2026 年時点の目安</div>
  </div>
  <div class="abs rule" style="left:14mm;top:23mm;width:269mm"></div>

  <div class="abs" style="left:14mm;top:27mm;width:269mm"><div class="tl">${tl}</div></div>

  <div class="abs" style="left:14mm;top:57mm;width:126mm">
    <h2><i></i>材料</h2>
    <table><tbody>${mats}</tbody></table>
    <h2 style="margin-top:4mm"><i></i>綴じる順番</h2>
    <div class="flow">${order}</div>
    <div class="flow" style="margin-top:1.4mm"><em>区分ごとに</em>${section}</div>
    <div class="flow" style="margin-top:1.4mm"><em>各区分の中</em><span>中扉</span><em>→</em><span>目録</span><em>→</em><span>見開き</span><em>→</em><span>見開き</span><em>…</em><em>巻末に空のポケット・空の台紙</em></div>
    <div class="note" style="margin-top:1.6mm">見開き＝<b>ラベル台紙を前のポケットの裏</b>、<b>銘板を次のポケットの表</b>。1つのポケットに片面印刷の紙を2枚、背中合わせに入れる。</div>
  </div>

  <div class="abs" style="left:148mm;top:57mm;width:135mm">
    <h2><i></i>印刷するもの</h2>
    <table><thead><tr><th>データ</th><th>メモ</th><th>紙</th><th>量</th></tr></thead><tbody>${prints}</tbody></table>
    <div style="margin-top:2.4mm;border:.4mm solid ${SHU};border-radius:1.5mm;padding:2mm 3mm;font-size:7.6pt;line-height:1.55">
      <b style="color:${SHU}">印刷の設定</b>　<b>片面</b>・A4 横・<b>倍率 100%（実際のサイズ）</b>・余白なし・背景のグラフィックを印刷<br>
      <span class="note">両面にすると見開きにならない。印刷所に出すなら print/bleed/（塗り足し 3mm）を使う。</span></div>
    <h2 style="margin-top:4mm"><i></i>仕上げチェック</h2>
    ${checks}
  </div>

  <div class="abs" style="left:14mm;bottom:8mm;width:269mm;display:flex;justify-content:space-between" >
    <span class="note">表紙に貼るもの：題簽を表紙の左上・QR シールを右下の隅・背表紙は背幅に近いものを選び、高さを合わせて上下を同じだけ切る</span>
    <span class="note">${esc(cfg.title)}</span></div>
</section>`;
}
