// 酒標帖 台紙の検索・印刷ページ
import { TYPES, REGIONS, typeOf, foldVariants } from './lib/data.js';
import * as R from './lib/render.js';

// 一覧データにはあるが、帖の区分には無い種類（区分は印刷時に選び直す）
const EXTRA_TYPES = { shochu: { name: '焼酎・泡盛', color: '#8c8478' }, other: { name: 'その他', color: '#8c8478' } };
const typeInfo = (key) => typeOf(key) ?? EXTRA_TYPES[key] ?? { name: key, color: '#8c8478' };
const PAGE_PX = 297 * 96 / 25.4; // A4 横の幅（CSS px）
const STORE = 'shuhyo-cart';

const $ = (id) => document.getElementById(id);
const esc = R.esc;
const state = { makers: [], q: '', type: 'all', pref: '', hasUrl: false, limit: 60, cart: [], withLabel: true };

// 検索用の正規化：全角半角・カタカナ/ひらがな・空白・会社の種類をそろえる
function norm(s) {
  return foldVariants(String(s ?? '').normalize('NFKC')).toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/株式会社|有限会社|合名会社|合資会社|\(株\)|\(有\)|\(名\)|\(資\)|[\s・･\-ー－]/g, '');
}

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ cart: state.cart, withLabel: state.withLabel })); } catch { /* 保存できなくても動く */ } };

async function init() {
  const [cfg, data] = await Promise.all([
    fetch('config.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch('makers.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  R.setup({ title: '酒標帖', sealText: '酒標', ...cfg }, window.qrcode);
  state.makers = (data?.makers ?? []).map((m) => ({ ...m, key: norm([m.n, m.k, m.c, m.p, m.b].join(' ')) }));
  const saved = load(STORE, {});
  state.cart = Array.isArray(saved.cart) ? saved.cart : [];
  state.withLabel = saved.withLabel ?? true;

  renderDataNote(data?.meta);
  buildFilters();
  bind();
  renderResults();
  renderCart();
}

function renderDataNote(meta) {
  const n = state.makers.length;
  $('data-note').innerHTML = n
    ? `収録 ${n.toLocaleString()} 件${meta?.updated ? `（${esc(meta.updated)} 時点）` : ''}。出典：${(meta?.sources ?? []).map((s) => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)).join('、') || '—'}。<br>閉業・移転・URL の変更があり得ます。`
    : '造り手の一覧は準備中です。下の「自分で入力して作る」から銘板を作れます。';
}

function buildFilters() {
  const present = new Set(state.makers.flatMap((m) => m.t ?? []));
  const keys = ['all', ...TYPES.map((t) => t.key), ...Object.keys(EXTRA_TYPES).filter((k) => present.has(k))];
  $('type-filter').innerHTML = keys.map((k) => {
    const info = k === 'all' ? { name: 'すべて' } : typeInfo(k);
    return `<button type="button" class="chip-btn" data-type="${k}" aria-pressed="${state.type === k}">${info.color ? `<i style="background:${info.color}"></i>` : ''}${esc(info.name)}</button>`;
  }).join('');

  const prefOptions = REGIONS.map((r) => `<optgroup label="${esc(r.name)}">${r.prefs.map((p) => `<option value="${p}">${esc(R.prefName(p))}</option>`).join('')}</optgroup>`).join('');
  $('pref').innerHTML = `<option value="">すべての都道府県</option>${prefOptions}`;
  $('manual-pref').innerHTML = `<option value="">—</option>${prefOptions}<option value="海外">海外</option>`;
  $('manual-type').innerHTML = TYPES.map((t) => `<option value="${t.key}">${t.num} ${esc(t.name)}</option>`).join('');
  $('blank-buttons').innerHTML = TYPES.map((t) => `<button type="button" class="chip-btn" data-blank="${t.key}"><i style="background:${t.color}"></i>＋ ${esc(t.name)}</button>`).join('');
  $('with-label').checked = state.withLabel;
}

let urlTimer;

function bind() {
  let timer;
  $('q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value; state.limit = 60; renderResults(); }, 120); });
  $('type-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]'); if (!b) return;
    state.type = b.dataset.type; state.limit = 60;
    $('type-filter').querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    renderResults();
  });
  $('pref').addEventListener('change', (e) => { state.pref = e.target.value; state.limit = 60; renderResults(); });
  $('has-url').addEventListener('change', (e) => { state.hasUrl = e.target.checked; state.limit = 60; renderResults(); });
  $('more').addEventListener('click', () => { state.limit += 60; renderResults(); });
  $('results').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    const m = filtered()[+b.dataset.add];
    addToCart({ name: m.n, kana: m.k, pref: m.p, city: m.c, url: m.u, type: (m.t ?? []).find((k) => typeOf(k)) ?? 'sake' });
    b.textContent = '追加しました';
  });
  $('manual-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    addToCart({ name: f.name.trim(), kana: f.kana.trim(), pref: f.pref, city: f.city.trim(), url: f.url.trim(), type: f.type });
    e.target.reset();
  });
  $('blank-buttons').addEventListener('click', (e) => {
    const b = e.target.closest('[data-blank]'); if (b) addToCart({ blank: true, type: b.dataset.blank });
  });
  $('cart').addEventListener('change', (e) => {
    const s = e.target.closest('[data-i]'); if (!s) return;
    state.cart[+s.dataset.i].type = s.value; save(); renderCart();
  });
  $('cart').addEventListener('input', (e) => {
    const u = e.target.closest('[data-url]'); if (!u) return;
    state.cart[+u.dataset.url].url = u.value.trim(); save();
    clearTimeout(urlTimer); urlTimer = setTimeout(renderPreview, 400);
  });
  $('cart').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    state.cart.splice(+b.dataset.rm, 1); save(); renderCart();
  });
  $('with-label').addEventListener('change', (e) => { state.withLabel = e.target.checked; save(); renderCart(); });
  $('print').addEventListener('click', print);
  window.addEventListener('resize', fitThumbs);
}

function filtered() {
  const q = norm(state.q);
  return state.makers.filter((m) =>
    (state.type === 'all' || (m.t ?? []).includes(state.type)) &&
    (!state.pref || m.p === state.pref) &&
    (!state.hasUrl || m.u) &&
    (!q || m.key.includes(q)));
}

function renderResults() {
  const list = filtered();
  $('count').textContent = state.makers.length ? `${list.length.toLocaleString()} 件` : '';
  $('results').innerHTML = list.slice(0, state.limit).map((m, i) => `<li>
      <div>
        <div class="name">${esc(m.n)}</div>
        <div class="meta">
          ${m.k ? `<span>${esc(m.k)}</span>` : ''}
          <span>${esc([R.prefName(m.p), m.c].filter(Boolean).join(' '))}</span>
          ${m.b ? `<span>銘柄：${esc(m.b.split('、').slice(0, 4).join('、'))}${m.b.split('、').length > 4 ? ' ほか' : ''}</span>` : ''}
          ${(m.t ?? []).map((k) => `<span class="badge"><i style="background:${typeInfo(k).color}"></i>${esc(typeInfo(k).name)}</span>`).join('')}
          ${m.u ? `<a href="${esc(m.u)}" target="_blank" rel="noopener">公式サイト</a>` : '<span>公式サイト未登録</span>'}
        </div>
      </div>
      <button type="button" class="add" data-add="${i}">＋ 印刷リストへ</button>
    </li>`).join('');
  $('more').hidden = list.length <= state.limit;
}

function addToCart(item) {
  state.cart.push(item);
  save();
  renderCart();
}

function pagesFor(item) {
  const t = typeOf(item.type) ?? TYPES[0];
  const pages = [];
  if (state.withLabel || item.blank) pages.push({ html: R.labelPage(t), cap: `${t.name}・ラベル台紙` });
  pages.push({ html: R.meibanPage(t, item.blank ? null : item), cap: item.blank ? `${t.name}・空の銘板` : `${item.name}・銘板` });
  return pages;
}

function renderCart() {
  const c = state.cart;
  $('cart-count').textContent = c.length ? `${c.length} 件` : '';
  $('cart-empty').hidden = c.length > 0;
  $('cart').innerHTML = c.map((item, i) => `<li>
      <span class="nm">${item.blank ? '（空の台紙）' : esc(item.name)}</span>
      ${item.blank ? '' : `<input class="url" data-url="${i}" type="url" value="${esc(item.url ?? '')}" placeholder="公式サイトの URL（無ければ空欄）" aria-label="公式サイトの URL">`}
      <select data-i="${i}" aria-label="区分">${TYPES.map((t) => `<option value="${t.key}"${t.key === item.type ? ' selected' : ''}>${t.num} ${esc(t.name)}</option>`).join('')}</select>
      <button type="button" class="rm" data-rm="${i}" aria-label="取り除く">×</button>
    </li>`).join('');
  renderPreview();
}

// URL を打っている途中でも入力欄を作り直さないよう、プレビューだけを更新する
function renderPreview() {
  const c = state.cart;
  $('print').disabled = c.length === 0;
  const pages = c.flatMap(pagesFor);
  $('print').textContent = c.length ? `印刷する（A4 横 ${pages.length} 枚）` : '印刷する';
  $('preview').innerHTML = pages.map((p) => `<figure style="margin:0"><div class="thumb">${p.html}</div><figcaption class="thumb-cap">${esc(p.cap)}</figcaption></figure>`).join('');
  fitThumbs();
}

function fitThumbs() {
  document.querySelectorAll('.thumb').forEach((box) => {
    const pg = box.firstElementChild;
    if (pg) pg.style.transform = `scale(${box.clientWidth / PAGE_PX})`;
  });
}

async function print() {
  $('print-root').innerHTML = state.cart.flatMap(pagesFor).map((p) => p.html).join('');
  await document.fonts.ready;
  window.print();
}

init();
