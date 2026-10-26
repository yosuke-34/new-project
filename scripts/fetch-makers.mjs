// 公開データから造り手の一覧を集めて data/makers.csv を作る
//   node scripts/fetch-makers.mjs
//
// 出典
//   - Wikipedia 日本語版（CC BY-SA 4.0）：日本酒メーカー一覧・焼酎メーカー一覧・泡盛の銘柄一覧・
//     ジャパニーズ・ウイスキーの蒸留所一覧・日本のビールメーカー一覧と、ワイン・ジン・ウイスキー・
//     ビールのメーカーのカテゴリ、各記事のよみ・所在地・公式サイト
//   - Wikidata（CC0）：記事に公式サイトが書かれていないときの公式サイト（P856）
// 取得した内容は data/.cache/ に保存し、次からはそれを使う（作り直すときは消す）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PREFS } from '../site/lib/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'data', '.cache');
const OUT = path.join(ROOT, 'data', 'makers.csv');
const UA = 'shuhyo-cho/1.0 (sake label binder; https://github.com/yosuke-34/new-project)';
const WP = 'https://ja.wikipedia.org/w/api.php';
const DELAY = 5000;

fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 取得（キャッシュ・間隔・再試行）

async function cached(key, fetcher) {
  const file = path.join(CACHE, crypto.createHash('sha1').update(key).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let i = 0; ; i++) {
    const res = await fetcher();
    if (res.ok) {
      const data = await res.json();
      fs.writeFileSync(file, JSON.stringify(data));
      await sleep(DELAY);
      return data;
    }
    if (i >= 30 || ![429, 500, 502, 503, 504].includes(res.status)) throw new Error(`${res.status} ${key.slice(0, 200)}`);
    // Retry-After があれば従う（Wikimedia の API は IP ごとに回数を制限している）
    const wait = Math.min(120, Number(res.headers.get('retry-after')) || 5 * 2 ** Math.min(i, 4)) + Math.random() * 5;
    process.stderr.write(`  ${res.status}、${Math.round(wait)} 秒待って再試行\n`);
    await sleep(wait * 1000);
  }
}

const wpApi = (params) => {
  const qs = new URLSearchParams({ ...params, format: 'json', formatversion: '2' });
  return cached(`wp:${qs}`, () => fetch(`${WP}?${qs}`, { headers: { 'User-Agent': UA } }));
};

const sparql = (query) => cached(`wd:${query}`, () => fetch('https://query.wikidata.org/sparql', {
  method: 'POST',
  headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ query }),
}));

async function wikitext(title) {
  const r = await wpApi({ action: 'parse', page: title, prop: 'wikitext|revid', redirects: '1' });
  return { text: r.parse.wikitext, revid: r.parse.revid };
}

// カテゴリの記事（サブカテゴリは depth 段まで。subcat に合うものだけたどる）
async function categoryMembers(cat, depth = 0, subcat = /$^/, seen = new Set()) {
  if (seen.has(cat)) return [];
  seen.add(cat);
  const out = [];
  let cont = {};
  do {
    const r = await wpApi({ action: 'query', list: 'categorymembers', cmtitle: cat, cmlimit: '500', cmnamespace: '0|14', ...cont });
    for (const m of r.query.categorymembers) {
      if (m.ns === 0) out.push(m.title);
      else if (depth > 0 && subcat.test(m.title)) out.push(...await categoryMembers(m.title, depth - 1, subcat, seen));
    }
    cont = r.continue ?? null;
  } while (cont);
  return out;
}

// 取得済みの記事（以前の実行のキャッシュ）を題名で引けるようにする
function cachedPages() {
  const out = new Map();
  for (const f of fs.readdirSync(CACHE)) {
    const r = JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));
    if (!r.query?.pages?.some((p) => p.revisions)) continue;
    pagesInto(r, out);
  }
  return out;
}

function pagesInto(r, out) {
  const alias = new Map();
  for (const n of [...(r.query.normalized ?? []), ...(r.query.redirects ?? [])]) alias.set(n.to, [...(alias.get(n.to) ?? []), n.from]);
  for (const p of r.query.pages) {
    if (p.missing) continue;
    const info = { title: p.title, text: p.revisions?.[0]?.slots?.main?.content ?? '', qid: p.pageprops?.wikibase_item };
    const names = [p.title];
    for (let k = 0; k < names.length; k++) names.push(...(alias.get(names[k]) ?? []));
    for (const n of names) out.set(n, info);
  }
}

// 記事の本文・Wikidata ID をまとめて取得（50 件ずつ。取得済みのものは取りに行かない）
async function articles(titles) {
  const out = cachedPages();
  const list = [...new Set(titles)].filter((t) => !out.has(t));
  process.stderr.write(`  取得済み ${[...new Set(titles)].length - list.length} 件、これから ${list.length} 件\n`);
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    process.stderr.write(`  記事 ${i + 1}–${i + batch.length} / ${list.length}\n`);
    pagesInto(await wpApi({ action: 'query', prop: 'revisions|pageprops', rvprop: 'content', rvslots: 'main', ppprop: 'wikibase_item', redirects: '1', titles: batch.join('|') }), out);
  }
  return out;
}

// ---------------------------------------------------------------- wikitext の整形

function stripTemplates(s) {
  let out = '', depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{' && s[i + 1] === '{') { depth++; i++; continue; }
    if (s[i] === '}' && s[i + 1] === '}' && depth) { depth--; i++; continue; }
    if (!depth) out += s[i];
  }
  return out;
}
const clean = (s) => stripTemplates(s
  .replace(/\{\{\s*Indent\s*\|/gi, '\n').replace(/^\}\}\s*$/gm, '')   // 段落を字下げするだけのテンプレートは中身を残す
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<ref[^>]*\/>/g, '')
  .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, ''))
  .replace(/<[^>]+>/g, '')
  .replace(/'''?/g, '');
const unlink = (s) => s
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, (_, t) => t)
  .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1');
const firstLink = (s) => s.match(/^\s*\[\[([^\]|#]+)/)?.[1]?.trim();

const PREF_RE = new RegExp(`(${PREFS.map((p) => (p === '北海道' ? p : p === '東京' ? '東京都' : p === '京都' || p === '大阪' ? `${p}府` : `${p}県`)).join('|')})`);
const prefIn = (s) => {
  const m = String(s ?? '').match(PREF_RE);
  return m ? (m[1] === '北海道' ? m[1] : m[1].replace(/[都府県]$/, '')) : '';
};
const prefInHeading = (h) => prefIn(h) || PREFS.find((p) => p !== '北海道' && new RegExp(`^\\s*${p}\\s*$`).test(h)) || (h.includes('北海道') ? '北海道' : '');

const COMPANY = /（株）|（有）|（名）|（資）|（合）|（同）|\(株\)|\(有\)|\(名\)|\(資\)|\(合\)|\(同\)|株式会社|有限会社|合名会社|合資会社|合同会社/g;
const cleanName = (s) => s.normalize('NFKC').replace(COMPANY, ' ').replace(/\([^)]*\)/g, ' ')
  .replace(/[()〈〉〔〕「」『』]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[・、,]+$/, '');
// 「(株)運営会社 醸造所名」「運営会社(株) 醸造所名」は醸造所名を、「醸造所名(株)」はそのまま名前にする
const MARK = /\((?:株|有|同|合|名|資)\)|株式会社|有限会社|合同会社|合名会社|合資会社/;
function makerName(s) {
  let t = String(s).normalize('NFKC').trim();
  const m = t.match(MARK);
  if (m) {
    const before = t.slice(0, m.index), after = t.slice(m.index + m[0].length);
    if (m.index === 0) { const a = after.trim(), sp = a.indexOf(' '); t = sp > 0 ? a.slice(sp + 1) : a; }
    else if (/^\s+\S/.test(after)) t = after;
    else t = before + after;
  }
  return cleanName(t.split('/')[0]);
}
const toHira = (s) => s.normalize('NFKC').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s　]/g, '');
const prefFull = (p) => (!p || p === '北海道' ? p : p === '東京' ? '東京都' : p === '京都' || p === '大阪' ? `${p}府` : `${p}県`);
// 住所などから市区町村を取り出す。prefName（「新潟県」など）を渡すと、その直後から探す
const cityIn = (s, prefName) => {
  let t = String(s ?? '').normalize('NFKC').replace(/\s/g, '');
  if (prefName) {
    const i = t.indexOf(prefName);
    if (i < 0) return '';
    t = t.slice(i + prefName.length);
  }
  t = t.replace(/^.*?[:：]/, '').replace(/^の/, '');   // 「本社:軽井沢町」
  const m = t.match(/^(?:[^\d、。,()郡]{1,6}?郡)?([^\d、。,()郡]{1,8}?(?:市|町|村|区))(?!郡)/);
  return m?.[1] ?? t.match(/^([^\d、。,()]{1,6}?郡)/)?.[1] ?? '';
};

// 見出しごとに行を回す
function* lines(text) {
  let heading = '', level = 0;
  for (const raw of clean(text).split('\n')) {
    const h = raw.match(/^(=+)\s*(.+?)\s*\1\s*$/);
    if (h) { heading = h[2]; level = h[1].length; yield { heading, level, isHeading: true }; continue; }
    yield { heading, level, line: raw };
  }
}

// ---------------------------------------------------------------- 一覧記事の読み取り

const entries = [];
const add = (e) => { if (e.name && !/一覧|メーカー$|^\s*$|[\/\[\]=|.]/.test(e.name)) entries.push(e); };

// 「* [[記事|（株）〇〇酒造]] - 銘柄、銘柄」
function bullet(line) {
  const body = line.replace(/^\*+\s*/, '');
  const [head, ...rest] = body.split(/\s*[-－–]\s+|\s+[-－–]\s*/);
  const article = firstLink(head);
  const text = unlink(head);
  const paren = text.match(/[（(]([^）)]*)[）)]\s*$/)?.[1] ?? '';
  const name = makerName(text.replace(/[（(][^）)]*[）)]\s*$/, ''));
  const brands = unlink(rest.join(' - ')).split(/[、,，]/).map((b) => b.replace(/[（(][^）)]*[）)]/g, '').trim()).filter((b) => b && !/未記載|廃業|休業/.test(b));
  return { article, name, paren, brands, closed: /廃業|閉鎖|休業|撤退/.test(body) };
}

async function fromSakeList(sources) {
  const { text, revid } = await wikitext('日本酒メーカー一覧');
  sources.wp_sake = revid;
  let pref = '', kanaPart = false;
  for (const l of lines(text)) {
    if (l.isHeading) {
      if (/五十音/.test(l.heading)) kanaPart = true;
      if (/脚注|関連項目|外部リンク|日本国外/.test(l.heading)) { pref = null; kanaPart = false; }
      else if (!kanaPart) pref = prefInHeading(l.heading) || pref;
      continue;
    }
    if (!l.line.startsWith('*') || pref === null) continue;
    const b = bullet(l.line);
    if (b.closed) continue;
    if (kanaPart) {
      // 五十音順の節：「（しまざきしゅぞう、栃木県）」でよみと都道府県が分かる
      const [kana, where] = b.paren.split(/[、,]/);
      add({ ...b, kana: /^[ぁ-ゖー]+$/.test(toHira(kana ?? '')) ? toHira(kana) : '', pref: prefIn(where ?? '') || PREFS.find((p) => p === (where ?? '').trim()) || '', types: ['sake'] });
    } else add({ ...b, pref, types: ['sake'] });
  }
}

async function fromShochuList(sources) {
  const { text, revid } = await wikitext('焼酎メーカー一覧');
  sources.wp_shochu = revid;
  let pref = '', on = false;
  for (const l of lines(text)) {
    if (l.isHeading) {
      if (/日本の焼酎メーカー/.test(l.heading)) on = true;
      if (/韓国|関連項目|外部リンク/.test(l.heading)) on = false;
      pref = prefInHeading(l.heading);
      continue;
    }
    if (!on || !l.line.startsWith('*')) continue;
    const b = bullet(l.line);
    if (!b.closed) add({ ...b, name: b.name.replace(/※/g, '').trim(), pref: pref || prefIn(b.paren), city: cityIn(b.paren, prefFull(prefIn(b.paren))), types: ['shochu'] });
  }
}

async function fromAwamoriList(sources) {
  const { text, revid } = await wikitext('泡盛の銘柄一覧');
  sources.wp_awamori = revid;
  for (const l of lines(text)) {
    if (l.isHeading || !l.line.startsWith('*')) continue;
    const m = l.line.replace(/^\*+\s*/, '').split(/\s*[-－–]\s*/);
    if (m.length < 2 || /廃業|休業/.test(l.line)) continue;
    const article = firstLink(m[1]);
    const t = unlink(m[1]);
    add({ article, name: cleanName(t.replace(/[（(][^）)]*[）)].*$/, '')), city: cityIn(t.match(/[（(]([^）)]*)[）)]/)?.[1] ?? '', ''), brands: [unlink(m[0]).trim()], pref: '沖縄', types: ['shochu'] });
  }
}

async function fromWhiskyList(sources) {
  const { text, revid } = await wikitext('ジャパニーズ・ウイスキーの蒸留所一覧');
  sources.wp_whisky = revid;
  let pref = '', cur = null;
  for (const l of lines(text)) {
    if (l.isHeading) { pref = prefInHeading(l.heading) || (/関連|脚注|参考|外部/.test(l.heading) ? null : pref); continue; }
    if (pref === null) continue;
    const dt = l.line.match(/^;\s*(.+)$/);
    if (dt) {
      const article = firstLink(dt[1]);
      const t = unlink(dt[1]);
      cur = { article, name: cleanName(t.replace(/\s*[（(][^）)]*[）)]\s*$/, '')), kana: toHira(t.match(/[（(]([^）)]*)[）)]\s*$/)?.[1] ?? ''), pref, types: ['whisky'] };
      if (!/^[ぁ-ゖー]+$/.test(cur.kana)) cur.kana = '';
      add(cur);
    } else if (cur && /^:/.test(l.line)) {
      if (/ジン/.test(l.line)) cur.types = [...new Set([...cur.types, 'gin'])];
      if (!cur.city) cur.city = cityIn(unlink(l.line), prefFull(pref));
    }
  }
}

async function fromBeerList(sources) {
  const { text, revid } = await wikitext('日本のビールメーカー一覧');
  sources.wp_beer = revid;
  let pref = '', on = true;
  for (const l of lines(text)) {
    if (l.isHeading) {
      if (/かつて|過去|撤退|廃業|関連項目|脚注|外部リンク|参考/.test(l.heading)) on = false;
      else if (l.level <= 2) on = true;
      pref = prefInHeading(l.heading) || pref;
      continue;
    }
    if (!on || !l.line.startsWith('*')) continue;
    const b = bullet(l.line);
    if (b.closed) continue;
    const where = unlink(l.line.replace(/^\*+\s*/, '')).match(/[（(]([^）)]*(?:市|町|村|区)[^）)]*)[）)]/)?.[1] ?? '';
    add({ ...b, pref: pref || prefIn(where), city: cityIn(where, ''), types: ['beer'] });
  }
}

async function fromCategory(cat, types, depth = 0, subcat) {
  for (const title of await categoryMembers(cat, depth, subcat)) {
    add({ article: title, name: cleanName(title.replace(/\s*[（(][^）)]*[）)]\s*$/, '')), types });
  }
}

// ---------------------------------------------------------------- 記事から、よみ・所在地・公式サイト

const INFOBOX_ADDR = /\|\s*(?:本社所在地|所在地|本店所在地|住所|本社)\s*=\s*([^\n|]*(?:\n(?!\s*\|)[^\n]*)*)/;
// 情報ボックスの欄だけを見る（行頭の「| URL =」。出典テンプレートの「|url=」は拾わない）
const INFOBOX_URL = /^\s*\|\s*(?:外部リンク|URL|ウェブサイト|公式サイト|ホームページ|homepage)\s*=\s*(.*)$/m;
// 公式サイトではないもの（SNS・報道・官公庁・論文・PDF など）
const SOCIAL = /twitter|x\.com|facebook|instagram|youtube|wikipedia|wikimedia|archive\.org|google\.|amazon\.|rakuten|yahoo|note\.com|ameblo|tabelog|\.pdf(?:$|[?#])|\.(?:lg|go|ac|ed)\.jp|handle\.net|doi\.org|nikkei|prtimes|asahi\.com|yomiuri|mainichi|sankei|jiji|kyodo|nhk\.or|news|press|release|nii\.ac|jstage|kotobank|weblio/i;
const urlIn = (s) => (String(s ?? '').match(/https?:\/\/[^\s\]|}<>"']+/g) ?? []).find((u) => !SOCIAL.test(u)) ?? '';

function fromArticle(text, title) {
  const plain = text.replace(/<!--[\s\S]*?-->/g, '');
  const kana = toHira(plain.match(/'''[^'\n]+?'''\s*[（(]\s*([ぁ-ゖァ-ヺー・\s　]+?)\s*[、，,）)]/)?.[1] ?? '');
  const addr = unlink(clean(plain.match(INFOBOX_ADDR)?.[1] ?? ''));
  let pref = prefIn(addr);
  if (!pref) pref = prefIn(plain.match(/\[\[Category:([^\]]*?)(?:の企業|の酒|の食品|の醸造|の蒸留|のワイン|のビール)/)?.[1] ?? '');
  if (!pref) pref = prefIn(clean(plain.split('\n').find((x) => x.startsWith("'''")) ?? ''));
  const city = cityIn(addr, prefFull(pref));
  let url = urlIn(plain.match(INFOBOX_URL)?.[1]);
  if (!url) url = urlIn(plain.match(/\{\{\s*(?:Official website|official website|公式ウェブサイト|公式サイト)\s*\|\s*([^}]*)\}\}/)?.[1]);
  if (!url) {
    const ext = plain.split(/==\s*外部リンク\s*==/)[1] ?? '';
    const m = [...ext.matchAll(/\[(https?:\/\/[^\s\]]+)\s+([^\]]*)\]/g)].find(([, u, t]) => !SOCIAL.test(u) && (/公式|オフィシャル|ホームページ/.test(t) || t.includes(title.replace(/\s*[（(].*$/, ''))));
    url = m?.[1] ?? '';
  }
  const closed = /\[\[Category:[^\]]*(?:廃業|かつて存在した|解散した)[^\]]*\]\]/.test(plain) || /\|\s*(?:解散|廃業|消滅)\s*=\s*\S/.test(plain);
  const disambiguation = /\{\{\s*(?:aimai|Aimai|曖昧さ回避|人名の曖昧さ回避|地名の曖昧さ回避)/.test(plain);
  return { kana: /^[ぁ-ゖー]+$/.test(kana) ? kana : '', pref, city, url, closed, disambiguation };
}

// ---------------------------------------------------------------- 実行

const sources = {};
console.error('一覧記事を読む…');
await fromSakeList(sources);
await fromShochuList(sources);
await fromAwamoriList(sources);
await fromWhiskyList(sources);
await fromBeerList(sources);
console.error('カテゴリを読む…');
// サブカテゴリは「〇〇県のワインメーカー」のような地域別のものだけたどる（ブランドや番組のカテゴリを除く）
await fromCategory('Category:日本のワインメーカー', ['wine'], 1, /^Category:.+(?:都|道|府|県|地方)のワインメーカー$/);
await fromCategory('Category:日本のジンメーカー', ['gin']);
await fromCategory('Category:日本のウイスキー蒸留所', ['whisky']);
await fromCategory('Category:日本のビールメーカー', ['beer'], 1, /^Category:.+(?:都|道|府|県|地方)のビールメーカー$/);

console.error('記事を読む…');
const info = await articles(entries.filter((e) => e.article).map((e) => e.article));
for (const e of entries) {
  const a = info.get(e.article);
  if (!a) continue;
  const f = fromArticle(a.text, a.title);
  if (f.disambiguation) continue;
  // 同じ名前の別の蔵の記事にリンクされていることがあるので、県が食い違うなら記事の情報は使わない
  if (e.pref && f.pref && e.pref !== f.pref) continue;
  e.qid = a.qid;
  e.closed ||= f.closed;
  e.kana ||= f.kana;
  e.pref ||= f.pref;
  if (!e.city && (!e.pref || e.pref === f.pref)) e.city = f.city;   // 工場と本社で県が違うときは市町村を使わない
  e.url ||= f.url;
}

console.error('Wikidata で公式サイトを補う…');
const qids = [...new Set(entries.filter((e) => !e.url && e.qid).map((e) => e.qid))];
const official = new Map();
for (let i = 0; i < qids.length; i += 200) {
  const r = await sparql(`SELECT ?item ?url WHERE { VALUES ?item { ${qids.slice(i, i + 200).map((q) => `wd:${q}`).join(' ')} } ?item wdt:P856 ?url }`);
  for (const b of r.results.bindings) if (!SOCIAL.test(b.url.value)) official.set(b.item.value.split('/').pop(), b.url.value);
}
for (const e of entries) if (!e.url && official.has(e.qid)) { e.url = official.get(e.qid); e.urlFromWikidata = true; }

// 書き出し（都道府県が分からないもの・廃業したものは除く）
const csv = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const rows = entries.filter((e) => !e.closed && PREFS.includes(e.pref) && e.name.length >= 2);
const header = 'name,kana,pref,city,types,url,brands,source';
const body = rows.map((e) => [e.name, e.kana ?? '', e.pref, e.city ?? '', e.types.join('|'), (e.url ?? '').replace(/^http:\/\//, 'http://'), (e.brands ?? []).join('、'), e.urlFromWikidata ? 'wikipedia+wikidata' : 'wikipedia'].map((v) => csv(String(v))).join(','));
fs.writeFileSync(OUT, [header, ...body].join('\n') + '\n');

const sourcesFile = path.join(ROOT, 'data', 'sources.json');
fs.writeFileSync(sourcesFile, JSON.stringify({
  wikipedia: { name: 'Wikipedia 日本語版', url: 'https://ja.wikipedia.org/wiki/日本酒メーカー一覧', license: 'CC BY-SA 4.0', revisions: sources },
  'wikipedia+wikidata': { name: 'Wikipedia 日本語版・Wikidata', url: 'https://www.wikidata.org/', license: 'CC BY-SA 4.0 / CC0' },
}, null, 2) + '\n');

const dropped = entries.length - rows.length;
console.error(`✓ data/makers.csv  ${rows.length} 行（除外 ${dropped}：都道府県不明・廃業など）`);
