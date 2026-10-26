"""国税庁の各国税局が公開している「酒蔵マップ」の一覧から造り手を集めて data/nta.csv を作る

    pip install pdfplumber
    python3 scripts/fetch_nta.py

出典：国税庁ホームページ（各国税局の「酒蔵マップ」と、その掲載業者の法人番号一覧）
利用条件：公共データ利用規約（第1.0版）。この一覧は上記を加工して作成したもので、国税庁が作成したものではありません。

取り込むもの（文字として読める一覧がある国税局だけ。地図が画像だけの国税局は対象外）
  仙台     酒蔵マップ掲載酒類製造者一覧（製造場名・市町村・代表銘柄・ジャンル）
  東京     法人番号一覧（製造場名）
  札幌・金沢・名古屋・高松・福岡・熊本  法人番号一覧（製造者名）
取得した内容は data/.cache/nta/ に保存し、次からはそれを使う
"""
import csv
import hashlib
import html
import io
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'data' / '.cache' / 'nta'
OUT = ROOT / 'data' / 'nta.csv'
UA = 'shuhyo-cho/1.0 (sake label binder; https://github.com/yosuke-34/new-project)'
BASE = 'https://www.nta.go.jp/about/organization'

PREFS = ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川',
         '新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良',
         '和歌山', '鳥取', '島根', '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分',
         '宮崎', '鹿児島', '沖縄']


def fetch(url):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest() + Path(url).suffix)
    if f.exists():
        return f.read_bytes()
    for i in range(6):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                body = r.read()
            f.write_bytes(body)
            time.sleep(2)
            return body
        except Exception as e:  # 一時的な失敗は待って再試行
            print(f'  retry {i}: {e}', file=sys.stderr)
            time.sleep(5 * 2 ** i)
    raise SystemExit(f'取得できません: {url}')


def decode(b):
    for enc in ('utf-8', 'cp932'):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            pass
    return b.decode('cp932', 'replace')


def nfkc(s):
    return unicodedata.normalize('NFKC', s or '').strip()


def pref_of(s):
    s = nfkc(s)
    for p in PREFS:
        if s.startswith(p):
            return p
    return ''


CORP = re.compile(r'\((?:株|有|名|資|合|同)\)|株式会社|有限会社|合名会社|合資会社|合同会社|農事組合法人|農業生産法人|一般社団法人|社会福祉法人|協同組合|組合')


def clean_name(s):
    s = nfkc(s)
    s = CORP.sub(' ', s)
    s = re.sub(r'\([^)]*\)', ' ', s)          # 個人名などの括弧書き
    s = re.sub(r'\s+', ' ', s).strip(' ・、')
    return s


def pick_name(lines):
    """製造場名のセル（複数行）から、会社名でない製造場の名前を選ぶ"""
    lines = [nfkc(l) for l in lines if nfkc(l)]
    plain = [l for l in lines if not CORP.search(l) and not re.fullmatch(r'\(.*\)', l) and not re.search(r'第.工場|工場$', l)]
    name = clean_name(plain[0] if plain else (lines[0] if lines else ''))
    return name


GENRE = [
    (r'ワイン|シードル|果実酒|ポワレ|ミード', 'wine'),
    (r'ビール|発泡酒', 'beer'),
    (r'ウイスキー|ウヰスキー', 'whisky'),
    (r'ジン', 'gin'),
    (r'焼酎|泡盛', 'shochu'),
    (r'清酒|日本酒', 'sake'),
]
NAME_TYPE = [
    (r'ブルワリー|ブリュワリー|ブルーイング|ブリューイング|ビール|麦酒|ブラッスリー|ブロイ|brew|beer|brasserie|bräu|aleworks|\bale\b', 'beer'),
    (r'ワイナリー|ワイン|葡|ぶどう|ブドウ|ヴィンヤード|ヴィニュロン|ドメーヌ|シャトー|シードル|winery|wine|vineyard|domaine|chateau|cidre|cider', 'wine'),
    (r'ウイスキー|ウヰスキー|whisky|whiskey', 'whisky'),
    (r'蒸留所|蒸溜所|蒸留|蒸溜|distill|スピリッツ|spirits|ジン', 'other'),
    (r'焼酎|泡盛', 'shochu'),
]
SHOCHU_PREFS = {'熊本', '大分', '宮崎', '鹿児島', '沖縄'}


def guess_types(name, pref, genre=''):
    types = [t for pat, t in GENRE if re.search(pat, genre)]
    if types:
        return types
    low = nfkc(name).lower()
    types = [t for pat, t in NAME_TYPE if re.search(pat, low, re.I)]
    if types:
        return types
    if re.search(r'酒造|酒蔵|醸造|本店|本家|酒舗|商店|酒類', name):
        return ['other'] if pref in SHOCHU_PREFS else ['sake']
    return ['other']


rows = []


def add(name, pref, city='', types=(), brands=(), source=''):
    name = clean_name(name)
    if len(name) < 2 or pref not in PREFS:
        return
    rows.append({'name': name, 'kana': '', 'pref': pref, 'city': nfkc(city), 'types': '|'.join(types),
                 'url': '', 'brands': '、'.join(b for b in brands if b), 'source': source})


# ---------------------------------------------------------------- 仙台：製造者一覧（列の位置から読む）

def sendai(url, sake):
    pdf = pdfplumber.open(io.BytesIO(fetch(url)))
    pref = ''
    for page in pdf.pages:
        words = page.extract_words(keep_blank_chars=False)
        head = {w['text']: w for w in words if w['top'] < 80}
        hdr = [w for w in words if w['text'] in ('市町村', '製造場名', '代表銘柄', 'ジャンル', '電話番号')]
        if not hdr:
            continue
        top = max(w['bottom'] for w in hdr) + 8
        # 列の境界は表の縦罫線から取る（見出しは列の中央、中身は左寄せのため）
        rules = []
        for x in sorted(e['x0'] for e in page.edges if e['orientation'] == 'v' and e['height'] > 8):
            if not rules or x - rules[-1] > 3:
                rules.append(x)
        def col_start(word):
            c = (word['x0'] + word['x1']) / 2
            return max([r for r in rules if r <= c], default=word['x0'] - 6)
        xs = {}
        for w in hdr:
            if w['text'] == '代表銘柄':   # 「代表銘柄ラベル等」（画像の列）ではなく、文字の列
                xs['代表銘柄'] = max(xs.get('代表銘柄', 0), col_start(w))
            else:
                xs[w['text']] = col_start(w)
        c_city, c_name, c_brand = xs['市町村'], xs['製造場名'], xs['代表銘柄']
        c_genre = xs.get('ジャンル', xs['電話番号'])
        c_tel = xs['電話番号']
        body = [w for w in words if w['top'] > top]
        anchors = sorted((w for w in body if re.fullmatch(r'[○◯]?\d{1,3}', w['text']) and w['x0'] < c_city), key=lambda w: w['top'])
        # 県の見出し（「青森県」など）。ページの途中で県が変わることもあるので、行ごとに直前の見出しを使う
        labels = sorted((w['top'], pref_of(w['text'])) for w in words
                        if re.fullmatch('(?:' + '|'.join(PREFS) + ')[都道府県]?', w['text']))
        centers = [(a['top'] + a['bottom']) / 2 for a in anchors]
        for i, a in enumerate(anchors):
            pref = next((p for t, p in reversed(labels) if t < a['top']), pref)
            y0 = (centers[i - 1] + centers[i]) / 2 if i else top
            y1 = (centers[i] + centers[i + 1]) / 2 if i + 1 < len(centers) else page.height
            cell = lambda x0, x1: [' '.join(w['text'] for w in sorted(g, key=lambda w: w['x0']))
                                   for _, g in _lines([w for w in body if y0 <= (w['top'] + w['bottom']) / 2 < y1 and x0 <= w['x0'] < x1])]
            city = ' '.join(cell(c_city, c_name))
            name = pick_name(cell(c_name, c_brand))
            brands = [nfkc(b) for b in cell(c_brand, c_genre)]
            genre = ' '.join(cell(c_genre, c_tel)) if not sake else '清酒'
            add(name, pref, city, guess_types(name, pref, genre), brands[:2], 'nta')
    return len(rows)


def _lines(ws):
    """y が近い単語を 1 行にまとめる"""
    ws = sorted(ws, key=lambda w: w['top'])
    out, cur, y = [], [], None
    for w in ws:
        if y is not None and abs(w['top'] - y) > 4:
            out.append((y, cur)); cur = []
        cur.append(w); y = w['top'] if not cur[:-1] else y
    if cur:
        out.append((y, cur))
    return out


# ---------------------------------------------------------------- 法人番号一覧（表）

def table_pdf(url, name_col, pref_col=None, fixed_pref=''):
    pdf = pdfplumber.open(io.BytesIO(fetch(url)))
    pref = fixed_pref
    for page in pdf.pages:
        m = re.search('（(' + '|'.join(PREFS) + ')[都道府県]?）', page.extract_text() or '')
        if m and not pref_col:
            pref = m.group(1)
        for t in page.extract_tables():
            for r in t:
                r = [nfkc(c) for c in r]
                if len(r) <= name_col or not r[name_col] or r[name_col] in ('製造場名', '製造者名', '法人名'):
                    continue
                p = pref_of(r[pref_col]) if pref_col is not None else pref
                add(r[name_col], p, '', guess_types(r[name_col], p), (), 'nta')


def table_html(url, name_col, pref_col=None, city_col=None, fixed_pref=''):
    t = decode(fetch(url))
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S):
        cells = [nfkc(html.unescape(re.sub(r'<[^>]+>', '', c))) for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', tr, re.S)]
        if len(cells) <= name_col or cells[name_col] in ('', '法人名等', '製造場名'):
            continue
        p = pref_of(cells[pref_col]) if pref_col is not None else fixed_pref
        add(cells[name_col], p, cells[city_col] if city_col is not None else '', guess_types(cells[name_col], p), (), 'nta')


def run(label, fn, *args, **kw):
    n = len(rows)
    fn(*args, **kw)
    print(f'  {label}: {len(rows) - n} 件', file=sys.stderr)


run('仙台（清酒）', sendai, f'{BASE}/sendai/sake/sakagura/seizo_ichiran/pdf/57_ja_01.pdf', True)
run('仙台（清酒以外）', sendai, f'{BASE}/sendai/sake/sakagura/seizo_ichiran/pdf/58_ja_02.pdf', False)
run('東京', table_pdf, f'{BASE}/tokyo/sake/pdf/hojinbango.pdf', 1)
run('札幌', table_html, f'{BASE}/sapporo/sake/sakagura/hojinbango.htm', 1, fixed_pref='北海道')
run('金沢', table_html, f'{BASE}/kanazawa/sake/sakemap/hojin_jp.htm', 3, pref_col=0, city_col=1)
run('名古屋', table_pdf, f'{BASE}/nagoya/sake/sakagura/pdf/06.pdf', 2, pref_col=0)
run('高松', table_pdf, f'{BASE}/takamatsu/sake/pdf/number.pdf', 2, pref_col=0)
run('福岡', table_pdf, f'{BASE}/fukuoka/sake/sakagura/pdf/05.pdf', 2, pref_col=0)
run('熊本', table_pdf, f'{BASE}/kumamoto/sake/sakagura/pdf/hojin.pdf', 2, pref_col=0)

# 同じ一覧の中の重複（同じ会社の複数の製造場など）を除く
seen, out = set(), []
for r in rows:
    k = (r['name'], r['pref'])
    if k not in seen:
        seen.add(k)
        out.append(r)
with OUT.open('w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['name', 'kana', 'pref', 'city', 'types', 'url', 'brands', 'source'], lineterminator='\n')
    w.writeheader()
    w.writerows(out)
print(f'✓ data/nta.csv  {len(out)} 行', file=sys.stderr)
