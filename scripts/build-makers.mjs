// data/makers.csv（造り手の一覧）を、検索・印刷ページが読む site/makers.json に変換する
//   node scripts/build-makers.mjs
//
// CSV の列：name,kana,pref,city,types,url,brands,source
//   name   造り手の名前（「株式会社」などの会社の種類は自動で外す）
//   kana   よみ（ひらがな）
//   pref   都道府県（「新潟」「新潟県」どちらでも可）
//   city   市区町村
//   types  sake / shochu / whisky / gin / wine / beer / other を | 区切りで
//   url    公式サイト（http/https のみ）
//   brands 代表銘柄（、区切り。検索に使う）
//   source 出典の名前（data/sources.json のキー）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREFS, foldVariants } from '../site/lib/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(ROOT, 'data', 'makers.csv');
const SOURCES = path.join(ROOT, 'data', 'sources.json');
const OUT = path.join(ROOT, 'site', 'makers.json');
const TYPES = new Set(['sake', 'shochu', 'whisky', 'gin', 'wine', 'beer', 'other']);

// RFC 4180 の CSV（ダブルクォートで囲んだ値、"" のエスケープ、値の中の改行）を読む
export function parseCsv(text) {
  const rows = [];
  let row = [], val = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { val += '"'; i++; }
      else if (c === '"') quoted = false;
      else val += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(val); val = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(val); rows.push(row); row = []; val = '';
    } else val += c;
  }
  if (val !== '' || row.length) { row.push(val); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const cleanName = (s) => s.normalize('NFKC').trim()
  .replace(/^(株式会社|有限会社|合名会社|合資会社|合同会社|\(株\)|\(有\)|\(名\)|\(資\))\s*/, '')
  .replace(/\s*(株式会社|有限会社|合名会社|合資会社|合同会社|\(株\)|\(有\)|\(名\)|\(資\))$/, '')
  .replace(/\s+/g, ' ');
const cleanPref = (s) => {
  const p = s.normalize('NFKC').trim();
  return PREFS.includes(p) ? p : p.replace(/[都府県]$/, '');   // 「京都」はそのまま、「京都府」→「京都」
};

export function buildMakers(rows) {
  const [head, ...body] = rows;
  const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  for (const need of ['name', 'pref', 'types']) if (!(need in col)) throw new Error(`makers.csv に ${need} 列がありません`);
  const get = (r, k) => (col[k] === undefined ? '' : (r[col[k]] ?? '').trim());
  const brands = (r) => get(r, 'brands').split('、').map((x) => x.trim()).filter(Boolean);

  const warnings = [];
  const seen = new Map();
  for (const [i, r] of body.entries()) {
    const line = i + 2;
    const n = cleanName(get(r, 'name'));
    const p = cleanPref(get(r, 'pref'));
    const t = get(r, 'types').split('|').map((s) => s.trim()).filter(Boolean);
    let u = get(r, 'url');
    if (!n) { warnings.push(`${line}行目：name が空`); continue; }
    if (!PREFS.includes(p)) warnings.push(`${line}行目：都道府県「${p}」が不明（${n}）`);
    const bad = t.filter((x) => !TYPES.has(x));
    if (bad.length) warnings.push(`${line}行目：種類「${bad.join('|')}」が不明（${n}）`);
    if (u && !/^https?:\/\/[^\s]+$/.test(u)) { warnings.push(`${line}行目：URL「${u}」を無視（${n}）`); u = ''; }

    // 同じ名前（旧字体の違いは同じとみなす）・同じ都道府県は 1 件にまとめる（種類と URL を補い合う）
    const key = `${foldVariants(n).replace(/[ヶケが]/g, 'ケ')}|${p}`;
    const prev = seen.get(key);
    if (prev) {
      prev.t = [...new Set([...prev.t, ...t.filter((x) => TYPES.has(x))])];
      prev.u ||= u;
      prev.k ||= get(r, 'kana');
      prev.c ||= get(r, 'city');
      prev.b = [...new Set([...prev.b, ...brands(r)])];
      continue;
    }
    seen.set(key, { n, k: get(r, 'kana'), p, c: get(r, 'city'), t: t.filter((x) => TYPES.has(x)), u, b: brands(r), s: get(r, 'source') });
  }
  const makers = [...seen.values()]
    .map((m) => ({ ...m, b: m.b.join('、') }))
    .map((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => (Array.isArray(v) ? v.length : v !== ''))))
    .sort((a, b) => PREFS.indexOf(a.p) - PREFS.indexOf(b.p) || (a.k || a.n).localeCompare(b.k || b.n, 'ja'));
  return { makers, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { makers, warnings } = buildMakers(parseCsv(fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '')));
  const allSources = fs.existsSync(SOURCES) ? JSON.parse(fs.readFileSync(SOURCES, 'utf8')) : {};
  const used = new Set(makers.map((m) => m.s).filter(Boolean));
  const meta = {
    updated: new Date().toISOString().slice(0, 10),
    sources: [...used].map((k) => ({ name: allSources[k]?.name ?? k, url: allSources[k]?.url ?? '', license: allSources[k]?.license ?? '' })),
  };
  fs.writeFileSync(OUT, JSON.stringify({ meta, makers }) + '\n');
  for (const w of warnings) console.warn('⚠', w);
  const byType = {};
  for (const m of makers) for (const t of m.t ?? []) byType[t] = (byType[t] ?? 0) + 1;
  console.log(`✓ site/makers.json  ${makers.length} 件（公式サイトあり ${makers.filter((m) => m.u).length} 件）`, byType);
}
