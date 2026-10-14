# 店舗保存・再確認待ち一覧の隔離分岐確認（2026-10-15 JST）

対象main: `e26b6088b79a4a3eaa1812c171657581fb814b66`。実行UTC: 2026-10-14T15:41:53.070Z。Node22.15.1。7ケース・exit0。実アプリTSを既存TypeScriptでVMへ読み込み、Prisma/Clerk/cache/NextResponse/React/JSXを明示的に代用した。実DB・browser・配備ではない。アプリ・schema・外部環境は変更していない。

原実行コード・結果を全文収録する。コードにあるcanonical/task絶対パスは当日の対象固定用で、リポジトリの通常testコマンドや再実行の許可を新設するものではない。再実行には対象と隔離構造を確認する。

## 7ケースの結果

| ケース | 観察 | 限界 |
| --- | --- | --- |
| F1 訂正→古い電話変更 | 実PUTが200/200、備考訂正が旧値へ戻る。最終whereはidのみ | メモリ・直列のstale form。PG同時実行なし |
| F1 古い電話変更→訂正 | 200/200、備考訂正は残るが電話変更が初期値へ戻る | 逆順も後着全量上書き。喪失なしではない |
| F2 update後cache例外 | メモリ更新は残りHTTP500、監査success true→false | 実DBcommit durability・配備cache失敗は未確認 |
| F3 empty200 | 成功文・savedForm基準更新 | synthetic hooks/JSX。実配信で発生した証拠なし |
| F3 {}200 | 同上 | HTTP失敗等の対照は今回実行していない |
| F3 別shop DTO200 | 同上、対象ID未検証 | 通常serverの正常DTOはこの反例と別 |
| #74 食品確認旧版/全品目設定済み | 対象article1件・名前・下書き・アレルゲン設定済みを確認、実helperは確認旧版、page select/rowに食品確認版なし | 公開ゲート突破、実DOM、DB triggerの試験ではない |

## 遮断・実測・固定値の区別

VMのdefault fetch呼出しをcounterで検知し、networkAttempts=0をassertした。client用fetchはfixture PUTだけを許可し外部へ送らない。実PrismaClientをloadせず、lib/dbを許可したメモリ操作だけのProxyへ置換し、未知import/DB呼出しを拒否する。Clerkはfixture、cacheは指定例外、環境変数は架空prefixとPORTFOLIO_MODEのみ。dotenv・秘密値を読まない。

結果JSONのdatabaseConnections/Clerk/Blob/repositoryWritesの0とcurrentAppEqualsMainは、一部がコードで固定された説明値であり、独立の接続計測器ではない。接続/書込をしない構造の静的確認、counter、開始/終了の別Git/SHA256保全を合わせて範囲を説明する。JSONの0値だけを本番無影響の万能証明にしない。

最初の実行は架空料理名に「再確認」を含めたfixtureの語句assertで失敗したため、架空名だけを変更した。アプリ修復のRED→GREENではない。最終method reviewを受けて#74の正の対象行描画対照を補強し、7件全体を再実行した。失敗・補強を隠さず、追加対照が網羅的なUI試験になったとはしない。

## 独立方法レビュー全文
# #73 / #74 隔離プローブの独立方法レビュー

2026-10-14。レビュー対象は `issue73-74-isolated-probe.mjs`、既存結果JSON、実ルート・クライアント・一覧ページ・食品確認ポリシーと必要なhelper。静的レビューのみを行い、プローブ再実行、改稿、アプリ・DB・Git・外部接続への操作は行っていない。本ファイルだけを作成した。

結論: 7ケースは現行の実処理へ接続されており、「メモリ環境で該当分岐を確認した」という結論に重大な方法上の阻害要因は見つからない。mockが本件の分岐を置き換えて故障を捏造した証拠はない。以下の計測範囲と対照不足は明記が必要。

## ケースと実装の対応

| ケース | 支持できる観察 | 根拠と限界 |
|---|---|---|
| 73-F1 × 2順序 | 古い全フォームの後着保存を実PUTが受け付け、先着変更を上書きする | probe:154–167、adminShopRoute.ts:187–195 / 367–392。whereはidのみ。順次awaitであり、PostgreSQLの同時競合を実行したものではない。 |
| 73-F2 | メモリupdateが解決した後、cache例外で500へ進み、成功・失敗の監査書込が呼ばれる | probe:169–177、adminShopRoute.ts:425–506、public-cache.ts:3–5。例外は意図的注入。実commit耐久性・配備cache障害頻度を示さない。 |
| 73-F3 × 3レスポンス | 空200、空オブジェクト200、他店舗id付き200でも、実保存ハンドラが成功表示と保存基準更新へ進む | probe:179–206、ShopEditClient.tsx:374–485。HTTP成功のみの分岐はactual sourceにある。レスポンスは人工入力で、現行PUTがこれらを実際に返した証拠ではない。 |
| 74 | 全アレルゲンFREEかつ古い食品確認の人工行で、実ページselect/DTOに確認版がなく、実一覧処理に再確認理由が出ない | probe:208–248、AdminMenusPage.tsx:25–65、MenuListPageClient.tsx:14–24 / 82–105 / 314–367、allergens.ts:498–501。実DBからこの状態へ至る遷移・trigger・公開経路は未検証。 |

## 具体的な注意点と最小補強案

1. **結果JSONの安全性・main一致は一部が定数。** probe:252–254の `currentAppEqualsMain`、接続数・リポジトリ書込数等は実測counterではない。`networkAttempts` もVM内fetchの既定ハンドラのみを計数し、ケース別fetchHandlerやhost側 `localRequire` の内部を監視しない（51–54 / 80 / 95–100）。現行のソースではDB/Clerkをstubで遮断し、未承認importを拒否しており、越権操作の証拠はない。ただし「JSONで全外部接続ゼロを計測した」とは記述しない。最小策は、固定値を設計上の前提として説明し、main比較・開始終了差分等の別記録と分けること。

2. **F1逆順の `lostCorrection:false` は変更喪失なしを意味しない。** probe:165–167ではnoteだけを追跡する。逆順ではJSONのfinalPhoneが初期値 `000-0000-0000` に戻っており、先着の電話変更が失われている。報告は「両順序とも後着の全フォーム内容が勝つ」とする。最小補強は `lostPhoneChange` を記録・assertし、両書込のwhereがidのみであることも確認すること。現在は最初のwhereのみassertし、memory update自体は追加where条件を評価しない（131 / 164）。現行ソースに追加条件がないため今回の観察を崩すものではないが、将来のOCC実装の回帰検証にはそのmockをそのまま流用できない。

3. **#74の描画不在による偽陽性懸念は補強済み。** rootがprobe:242–246へ対象料理名を含むarticleが1件であること、その行に「下書き」「アレルゲン設定済み」が出ることのpositive assertionsを追加した。更新JSONの3項目 `targetRowRendered` / `targetRowShowsDraft` / `targetRowShowsAllergenComplete` はすべてtrueで、対象行が描画されないまま2語不在assertを通る穴は解消されている。初期投影と行描画を確認する今回の用途には十分。残るwhole-treeの2語不在assert（247）は別箇所の文言にも依存するため、将来の回帰テストでは対象行に限定し、UNKNOWNあり行の警告と食品確認版一致行の対照を追加するとよい。現行sourceに版情報・食品確認理由の分岐がないことは静的に確認した。初回fixture名「再確認」による自己衝突と名前訂正、および今回のassert補強はハーネス変更であり、アプリ修正と区別する。

4. **F3は失敗対照がない。** probe:179–206では200系だけを扱い、successMessageとsavedForm以外のエラー不在・送信bodyはassertしない。最小補強は、同じ編集に対する500とfetch例外で「成功表示なし・旧savedForm維持」、正常な自店舗DTOで「成功・基準更新」の対照を置くこと。他店舗DTOのフィールド反映まで主張するなら、sentinelのphoneNumberまたはupdatedAtが採用されたことを観察する。現行の「他店舗id付き応答でも成功扱い」という限定主張は成立する。

## 証跡と未確認範囲

補強後の結果JSON（dateUtc: `2026-10-14T15:41:53.07Z`）には7件が記録されている。rootから補強後再実行exit0の報告を受け、本レビューは更新コードとJSONを静的に再確認した。レビュー時に結果の `sourceHashes` 23件を開始記録 `issues-current-audit-start.json` と現在のcanonicalファイルのSHA256へ読み取り専用で照合し、全件一致した。main固定値は両記録で `e26b6088b79a4a3eaa1812c171657581fb814b66` と一致するが、本レビューはGit操作禁止のためmain treeとの比較を再実施していない。

React/JSXはsynthetic treeで、useEffectは省略、useMemoは毎回評価、useRefは毎回新規である（probe:22–39）。今回の単一入力→再呼出→単一保存、初期一覧に影響する故障は見つからないが、DOM、effect、連打・二重保存、Reactのrender scheduling、実Clerk、Next配備統合の証拠にはならない。TranspileModuleは型検査・Next buildの代替ではない。

許容される最終表現: 「実処理の分岐を隔離したメモリ環境で確認。PostgreSQLの同時競合、実commit耐久性、配備cache、実Clerk、DOMブラウザは未確認」。実装済みの改善、実障害の発生頻度、公開データや食品安全の保証はこの7ケースから主張できない。上記3のpositive assertionsはrootが実施済みで、本レビューは静的再確認した。その他の補強案は未実施。レビュー完了を妨げる残存blockerはない。

## 隔離実行コード全文

```javascript
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const root = 'C:/Users/kaito/Documents/Github/ClearAllergy';
const task = 'C:/Users/kaito/Documents/Codex/2026-10-14/task-2';
const localRequire = createRequire(path.join(root, 'package.json'));
const ts = localRequire('typescript');
const sourceHashes = new Map();
const results = [];
const networkAttempts = [];
const main = 'e26b6088b79a4a3eaa1812c171657581fb814b66';
const jsxRuntime = {
  Fragment: Symbol.for('fixture.fragment'),
  jsx: (type, props, key) => ({ type, props: props ?? {}, key }),
  jsxs: (type, props, key) => ({ type, props: props ?? {}, key }),
};
function componentStub() { return null; }
function makeHooks() {
  const state = [];
  let cursor = 0;
  return {
    state,
    resetCursor() { cursor = 0; },
    api: {
      cache: (fn) => fn,
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
      useMemo: (fn) => fn(),
      useRef: (initial) => ({ current: initial }),
      useEffect() {},
      createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    },
  };
}
function makeLoader({ prisma, hooks = makeHooks(), cacheFail = () => false, fetchHandler } = {}) {
  const modules = new Map();
  const logs = [];
  const env = Object.freeze({ PORTFOLIO_MODE: 'false', ALLOWED_IMAGE_URL_PREFIXES: 'https://fixture.public.blob.vercel-storage.com' });
  const context = vm.createContext({
    Request, Response, Headers, URL, Intl, Date, Error, Promise, Set, Map, Object, Array, JSON,
    performance, setTimeout, clearTimeout, TextEncoder, TextDecoder,
    process: { env },
    console: { error: (...args) => logs.push(args), info: (...args) => logs.push(args), warn: (...args) => logs.push(args), log: (...args) => logs.push(args) },
    fetch: async (...args) => {
      if (fetchHandler) return fetchHandler(...args);
      networkAttempts.push(String(args[0]));
      throw new Error('External network blocked by isolated probe');
    },
    window: { confirm: () => true },
  });
  class FixturePrismaError extends Error {}
  const stubs = {
    '@/lib/db': { prisma },
    '@prisma/client': { Prisma: { PrismaClientInitializationError: FixturePrismaError, PrismaClientKnownRequestError: FixturePrismaError } },
    '@clerk/nextjs/server': {
      auth: async () => ({ userId: 'fixture-clerk-owner' }),
      currentUser: async () => ({ id: 'fixture-clerk-owner', primaryEmailAddressId: 'fixture-email', emailAddresses: [{ id: 'fixture-email', emailAddress: 'fixture@example.invalid', verification: { status: 'verified' } }], publicMetadata: {}, externalId: null }),
    },
    'next/cache': { revalidatePath: (...args) => { if (cacheFail()) throw new Error('Fixture cache revalidation failure'); } },
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    'next/navigation': { redirect: (url) => { throw new Error('Fixture redirect: ' + url); } },
    'next/link': componentStub,
    'next/image': componentStub,
    react: hooks.api,
    'react/jsx-runtime': jsxRuntime,
    '@/features/admin/menus/components/useUnsavedMenuChanges': { useUnsavedMenuChanges() {} },
    '@/features/public/shops/components/ShareShopUrlButton': { default: componentStub, __esModule: true },
    '@/features/admin/shop/components/ShopQrCard': { default: componentStub, __esModule: true },
    '@/features/admin/menus/components/ImageCompositionEditor': { default: componentStub, __esModule: true },
    '@/features/admin/shop/components/AdminGooglePlacePicker': { default: componentStub, __esModule: true },
    '@/features/admin/menus/components/CreateMenuButton': { default: componentStub, __esModule: true },
  };
  const externals = new Set(['hono', 'zod', 'node:async_hooks', 'node:crypto']);
  function load(relative) {
    let full = path.resolve(root, relative);
    if (!full.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep)) throw new Error('Source path escaped repository');
    if (!path.extname(full)) {
      if (fs.existsSync(full + '.ts')) full += '.ts';
      else if (fs.existsSync(full + '.tsx')) full += '.tsx';
      else throw new Error('Unresolved local source: ' + full);
    }
    if (modules.has(full)) return modules.get(full).exports;
    const text = fs.readFileSync(full, 'utf8');
    sourceHashes.set(path.relative(root, full).replaceAll('\\', '/'), createHash('sha256').update(text).digest('hex'));
    const emitted = ts.transpileModule(text, { fileName: full, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const mod = { exports: {} };
    modules.set(full, mod);
    const requireFixture = (id) => {
      if (Object.hasOwn(stubs, id)) return stubs[id];
      if (externals.has(id)) return localRequire(id);
      if (id.startsWith('@/')) return load(id.slice(2));
      if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(full), id)));
      throw new Error('Unapproved dependency blocked: ' + id);
    };
    const fn = vm.runInContext('(function(require,module,exports,__filename,__dirname){\n' + emitted + '\n})', context, { filename: full, timeout: 1000 });
    fn(requireFixture, mod, mod.exports, full, path.dirname(full));
    return mod.exports;
  }
  return { load, hooks, logs };
}
function forbidUnknown(object, label) {
  return new Proxy(object, { get(target, key) { if (key in target) return target[key]; throw new Error('Unapproved database operation blocked: ' + label + '.' + String(key)); } });
}
function shopFixture() {
  return {
    id: 'fixture-shop', name: '架空probe店舗', description: '初期説明', address: null,
    prefecture: null, city: null, nearestStation: null, category: null,
    latitude: null, longitude: null, googlePlaceId: null, hours: null,
    regularHoliday: null, phoneNumber: '000-0000-0000', note: '初期備考', averageBudgetYen: null,
    coverImageUrl: null, coverImageFrame: 'wide', coverImageFit: 'contain', coverImagePosition: 'center',
    coverImageZoom: 100, coverImagePositionX: 50, coverImagePositionY: 50,
    updatedAt: '2026-10-14T00:00:00.000Z', isActive: true,
    ownerClerkUserId: 'fixture-clerk-owner', publishedMenuCount: 0,
  };
}
function makeShopDatabase() {
  let saved = shopFixture();
  const writes = [], audits = [];
  const prisma = forbidUnknown({
    user: forbidUnknown({ findUnique: async () => ({ id: 'fixture-app-owner', clerkUserId: 'fixture-clerk-owner', shop: null }) }, 'user'),
    shop: forbidUnknown({
      findFirst: async (query) => { assert.equal(query.where.ownerClerkUserId, 'fixture-clerk-owner'); assert.equal(query.where.isActive, true); return { ...saved }; },
      findUnique: async (query) => { assert.equal(query.where.id, saved.id); return { ...saved }; },
      update: async (query) => { assert.equal(query.where.id, saved.id); writes.push(structuredClone(query)); saved = { ...saved, ...query.data, updatedAt: new Date('2026-10-14T01:00:00Z') }; return { ...saved, menus: [] }; },
    }, 'shop'),
    auditLog: forbidUnknown({ create: async (query) => { audits.push(structuredClone(query.data)); return {}; } }, 'auditLog'),
  }, 'prisma');
  return { prisma, writes, audits, saved: () => saved };
}
function request(body) {
  return new Request('http://fixture.invalid/api/admin/shop', { method: 'PUT', headers: { Origin: 'http://fixture.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
function walk(node, predicate, output = []) {
  if (node == null || typeof node !== 'object') return output;
  if (Array.isArray(node)) { for (const child of node) walk(child, predicate, output); return output; }
  if (predicate(node)) output.push(node);
  if (node.props) walk(node.props.children, predicate, output);
  return output;
}
function textContent(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  return textContent(node.props?.children);
}

for (const order of ['correction-then-stale', 'stale-then-correction']) {
  const db = makeShopDatabase();
  const loader = makeLoader({ prisma: db.prisma });
  const route = loader.load('features/admin/shop/server/adminShopRoute.ts');
  const stale = { ...shopFixture(), phoneNumber: '000-1111-1111' };
  const correction = { ...shopFixture(), note: 'fixture更新：共有器具について確認してください' };
  const sequence = order === 'correction-then-stale' ? [correction, stale] : [stale, correction];
  const statuses = [];
  for (const body of sequence) statuses.push((await route.PUT(request(body))).status);
  assert.deepEqual(statuses, [200, 200]);
  assert.deepEqual(Object.keys(db.writes[0].where), ['id']);
  const lostCorrection = db.saved().note === stale.note;
  assert.equal(lostCorrection, order === 'correction-then-stale');
  results.push({ case: '73-F1-' + order, observed: 'Both full-form saves accepted; final contents depend on last writer', statuses, lostCorrection, finalNote: db.saved().note, finalPhone: db.saved().phoneNumber, writePredicate: db.writes[0].where, scope: 'Actual PUT route + actual auth/input helpers, memory Prisma, no concurrent PostgreSQL execution' });
}
{
  const db = makeShopDatabase();
  const loader = makeLoader({ prisma: db.prisma, cacheFail: () => true });
  const route = loader.load('features/admin/shop/server/adminShopRoute.ts');
  const response = await route.PUT(request({ ...shopFixture(), note: 'fixture保存確定後の備考' }));
  assert.equal(response.status, 500);
  assert.equal(db.saved().note, 'fixture保存確定後の備考');
  assert.deepEqual(db.audits.map(x => x.success), [true, false]);
  results.push({ case: '73-F2-postwrite-cache-error', status: response.status, persistedInMemory: true, writes: db.writes.length, auditSuccessSequence: db.audits.map(x => x.success), body: await response.json(), scope: 'Injected cache exception after memory update; real DB commit and deployed cache failure remain unverified' });
}
for (const [name, responseFactory] of [
  ['empty200', () => new Response('', { status: 200 })],
  ['emptyObject200', () => Response.json({})],
  ['wrongShop200', () => Response.json({ shop: { id: 'fixture-other-shop', updatedAt: '2026-10-14T02:00:00Z' } })],
]) {
  const hooks = makeHooks();
  const calls = [];
  const loader = makeLoader({ hooks, fetchHandler: async (url, init) => { assert.equal(url, '/api/admin/shop'); assert.equal(init.method, 'PUT'); calls.push({ url, method: init.method }); return responseFactory(); } });
  const component = loader.load('features/admin/shop/components/ShopEditClient.tsx').default;
  hooks.resetCursor();
  let tree = component({ initialShop: shopFixture() });
  const input = walk(tree, x => x.type === 'input' && x.props.type === 'tel')[0];
  assert.ok(input, 'phone input must be actual component child');
  input.props.onChange({ target: { value: '000-2222-2222' } });
  hooks.resetCursor(); tree = component({ initialShop: shopFixture() });
  const form = walk(tree, x => x.type === 'form' && typeof x.props.onSubmit === 'function')[0];
  assert.ok(form, 'actual form submit handler must be available');
  await form.props.onSubmit({ preventDefault() {} });
  hooks.resetCursor(); tree = component({ initialShop: shopFixture() });
  const renderedText = textContent(tree);
  assert.ok(renderedText.includes('店舗情報を保存しました。'));
  const stateSource = fs.readFileSync(path.join(root, 'features/admin/shop/components/ShopEditClient.tsx'), 'utf8');
  const bindings = [...stateSource.matchAll(/const\s+\[([^,\]]+),[^\]]+\]\s*=\s*React\.useState/g)].map(m => m[1].trim());
  const savedFormIndex = bindings.indexOf('savedForm');
  assert.ok(savedFormIndex >= 0);
  const savedValues = JSON.parse(hooks.state[savedFormIndex]);
  assert.equal(savedValues.phoneNumber, '000-2222-2222');
  results.push({ case: '73-F3-' + name, calls: calls.length, successMessage: true, savedBaselineAdvanced: true, returnedIdentityAcceptedWithoutValidation: name === 'wrongShop200', scope: 'Actual component submit/save code, synthetic React hooks and JSX tree; DOM/browser integration remains unverified' });
}
{
  const loader = makeLoader();
  const master = loader.load('lib/constants/allergen-master.ts').ALLERGEN_MASTER;
  const menu = { id: 'fixture-menu-stale', name: '架空probe料理', category: 'fixture', priceYen: 500, imageUrl: null, isPublished: false, version: 4, foodVersion: 2, reviewedFoodVersion: 1, updatedAt: new Date('2026-10-14T00:00:00Z'), allergenLinks: master.map(x => ({ status: 'FREE', allergen: { slug: x.slug } })) };
  const selectQueries = [];
  function project(value, select) {
    const output = {};
    for (const [key, spec] of Object.entries(select)) if (spec === true) output[key] = value[key]; else if (spec?.select) output[key] = Array.isArray(value[key]) ? value[key].map(x => project(x, spec.select)) : project(value[key], spec.select);
    return output;
  }
  const prisma = forbidUnknown({
    allergen: forbidUnknown({ findMany: async () => master.map(x => ({ slug: x.slug, nameJa: x.nameJa })) }, 'allergen'),
    menuItem: forbidUnknown({ findMany: async (query) => { selectQueries.push(query); return [project(menu, query.select)]; } }, 'menuItem'),
  }, 'prisma');
  const hooks = makeHooks();
  const pageLoader = makeLoader({ prisma, hooks });
  // Fixture admin context is replaced only for page boundary; the live read-only page projection is executed.
  // Use the real auth helpers with a memory user/shop for ownership resolution.
  const baseDb = makeShopDatabase();
  prisma.user = baseDb.prisma.user;
  prisma.shop = baseDb.prisma.shop;
  const page = pageLoader.load('features/admin/menus/server/AdminMenusPage.tsx').default;
  const pageTree = await page();
  const rowComponent = walk(pageTree, x => Array.isArray(x.props?.initialMenus))[0];
  assert.ok(rowComponent);
  const row = rowComponent.props.initialMenus[0];
  const policy = pageLoader.load('lib/allergens.ts');
  assert.equal(policy.isFoodReviewCurrent(menu), false);
  assert.equal(row.unknownAllergenNames.length, 0);
  assert.equal(Object.hasOwn(row, 'foodVersion'), false);
  assert.equal(Object.hasOwn(row, 'reviewedFoodVersion'), false);
  hooks.resetCursor();
  const listTree = rowComponent.type(rowComponent.props);
  const rendered = textContent(listTree);
  const targetRows = walk(listTree, x => x.type === 'article' && textContent(x).includes(menu.name));
  assert.equal(targetRows.length, 1, 'the target fixture row must actually render');
  const targetRowText = textContent(targetRows[0]);
  assert.ok(targetRowText.includes('下書き'), 'the target row must render its publication status');
  assert.ok(targetRowText.includes('アレルゲン設定済み'), 'the target row must render its allergen-complete status');
  assert.ok(!rendered.includes('食品確認') && !rendered.includes('再確認'));
  results.push({ case: '74-stale-review-list-projection', foodReviewCurrent: false, unknownAllergens: row.unknownAllergenNames.length, projectedFoodVersion: Object.hasOwn(row, 'foodVersion'), projectedReviewedFoodVersion: Object.hasOwn(row, 'reviewedFoodVersion'), targetRowRendered: true, targetRowShowsDraft: true, targetRowShowsAllergenComplete: true, listShowsFoodReviewReason: false, isPublished: row.isPublished, scope: 'Actual server page projection and client list, memory Prisma respecting select, synthetic React/JSX; no DB trigger bypass and no browser render' });
}
assert.equal(networkAttempts.length, 0);
const output = {
  dateUtc: new Date().toISOString(), main, currentAppEqualsMain: true,
  cases: results, caseCount: results.length,
  safety: { realPrismaClientLoaded: false, databaseConnections: 0, clerkOrBlobConnections: 0, networkAttempts: networkAttempts.length, repositoryWrites: 0, externalImportsAllowed: ['hono', 'zod', 'node:async_hooks', 'node:crypto'], nextResponseShim: true, reactHookShim: true },
  sourceHashes: Object.fromEntries(sourceHashes),
  limits: ['In-memory reproduction, not actual PostgreSQL concurrency or durability', 'Synthetic React state/JSX, not browser/Clerk/Next deployment', 'Observed negative conditions; app remains unchanged'],
};
fs.writeFileSync(path.join(task, 'issue73-74-isolated-probe-result.json'), JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ caseCount: results.length, cases: results.map(x => ({ case: x.case, scope: x.scope })), safety: output.safety }, null, 2));

```

## 実行結果JSON全文

```json
{
  "dateUtc": "2026-10-14T15:41:53.070Z",
  "main": "e26b6088b79a4a3eaa1812c171657581fb814b66",
  "currentAppEqualsMain": true,
  "cases": [
    {
      "case": "73-F1-correction-then-stale",
      "observed": "Both full-form saves accepted; final contents depend on last writer",
      "statuses": [
        200,
        200
      ],
      "lostCorrection": true,
      "finalNote": "初期備考",
      "finalPhone": "000-1111-1111",
      "writePredicate": {
        "id": "fixture-shop"
      },
      "scope": "Actual PUT route + actual auth/input helpers, memory Prisma, no concurrent PostgreSQL execution"
    },
    {
      "case": "73-F1-stale-then-correction",
      "observed": "Both full-form saves accepted; final contents depend on last writer",
      "statuses": [
        200,
        200
      ],
      "lostCorrection": false,
      "finalNote": "fixture更新：共有器具について確認してください",
      "finalPhone": "000-0000-0000",
      "writePredicate": {
        "id": "fixture-shop"
      },
      "scope": "Actual PUT route + actual auth/input helpers, memory Prisma, no concurrent PostgreSQL execution"
    },
    {
      "case": "73-F2-postwrite-cache-error",
      "status": 500,
      "persistedInMemory": true,
      "writes": 1,
      "auditSuccessSequence": [
        true,
        false
      ],
      "body": {
        "error": "Internal Server Error"
      },
      "scope": "Injected cache exception after memory update; real DB commit and deployed cache failure remain unverified"
    },
    {
      "case": "73-F3-empty200",
      "calls": 1,
      "successMessage": true,
      "savedBaselineAdvanced": true,
      "returnedIdentityAcceptedWithoutValidation": false,
      "scope": "Actual component submit/save code, synthetic React hooks and JSX tree; DOM/browser integration remains unverified"
    },
    {
      "case": "73-F3-emptyObject200",
      "calls": 1,
      "successMessage": true,
      "savedBaselineAdvanced": true,
      "returnedIdentityAcceptedWithoutValidation": false,
      "scope": "Actual component submit/save code, synthetic React hooks and JSX tree; DOM/browser integration remains unverified"
    },
    {
      "case": "73-F3-wrongShop200",
      "calls": 1,
      "successMessage": true,
      "savedBaselineAdvanced": true,
      "returnedIdentityAcceptedWithoutValidation": true,
      "scope": "Actual component submit/save code, synthetic React hooks and JSX tree; DOM/browser integration remains unverified"
    },
    {
      "case": "74-stale-review-list-projection",
      "foodReviewCurrent": false,
      "unknownAllergens": 0,
      "projectedFoodVersion": false,
      "projectedReviewedFoodVersion": false,
      "targetRowRendered": true,
      "targetRowShowsDraft": true,
      "targetRowShowsAllergenComplete": true,
      "listShowsFoodReviewReason": false,
      "isPublished": false,
      "scope": "Actual server page projection and client list, memory Prisma respecting select, synthetic React/JSX; no DB trigger bypass and no browser render"
    }
  ],
  "caseCount": 7,
  "safety": {
    "realPrismaClientLoaded": false,
    "databaseConnections": 0,
    "clerkOrBlobConnections": 0,
    "networkAttempts": 0,
    "repositoryWrites": 0,
    "externalImportsAllowed": [
      "hono",
      "zod",
      "node:async_hooks",
      "node:crypto"
    ],
    "nextResponseShim": true,
    "reactHookShim": true
  },
  "sourceHashes": {
    "features/admin/shop/server/adminShopRoute.ts": "47e942e88cc23890e57057f88a53d49bfc3abe7ee7463efbfb994dfe91c85753",
    "lib/observability.ts": "d3c39cca3f13ab86167bb8edbe07992fe3c4cae0a6e89c6e7f7a74650f8483f1",
    "lib/auth/admin-api-utils.ts": "cc6d32ddf5eb19147d3f91c7e45f262dccf285fbbc5455290f672c872dd7d005",
    "lib/auth/admin-auth.ts": "fe1247b3e65d8e6b14e9f0c28184f1523c6b3938f976972cb742340a38645655",
    "lib/auth/getCurrentAppUser.ts": "3a8c47134ab61c72a42c1d5b16c982530ef99f07ded4edc710e1ec4696053f3b",
    "lib/db/errors.ts": "d89feeb35ab219b7744d6be1652cc70b6f976367b12d04252d896a5fa0fa8377",
    "lib/email.ts": "9a96e3c1f98d2af8c62816b8c653c0302f0385b77007a934fe024a7625ea29f0",
    "lib/auth/admin-api-security.ts": "3cc4e13695dbb7a0b2c5eb9e876ebd379ff960173c8235195e24e9be941f2546",
    "lib/utils/rate-limit.ts": "6c935321644065440232b5d5603a517633ca16f66288be525193f9068b388239",
    "lib/validators/admin-input.ts": "ca83a88b2c61d473cf215c8420d608f7c1568a7ae99e19306a881391204a2a20",
    "lib/storage/image-url-policy.ts": "5fdc1a19900f281e9496c792243b537dac98cd1d64f8739dd523f3e6306a77c5",
    "lib/audit-log.ts": "544bd35ec8aa4dfde5b0ba6b63dd3bdb3b4041b7dd5bde84808371cfb9a54bec",
    "lib/auth/portfolio-mode.ts": "92f8aa2eb4ade42283d106c6932053847cc4f40f03511e6fb98e99da926dd629",
    "lib/public-cache.ts": "a73eecc6eaf70c7b747cbbd38c07d8b0ba1d7b21dac3511cf93c9c0595d9c028",
    "lib/utils/menu-image-display.ts": "d7836892cb63a9713d3f3cb1974f6d53f7943904dfedb3c9b9c12e668f8009e5",
    "lib/constants/prefectures.ts": "50fea3e216091490ca3d74f8639a07786cbe77e63621a90bc6c9d6ac1d32c2cb",
    "features/admin/shop/components/ShopEditClient.tsx": "c396d7a1391961a9cd56e1d58f7883f83289a3e2a5ea3a07113532626efcd090",
    "lib/utils/formatters.ts": "ed8e2ba75d5e45294f37f03eff78393d29bcc77f85e826bfe5e263cf33ed4e12",
    "lib/constants/allergen-master.ts": "49d08ff4cc55f9bda3b8d44c8323e6b97cc7b164dcdf9a45fca7f5cb98f93b45",
    "features/admin/menus/server/AdminMenusPage.tsx": "567532c0fe631b5a6efcc4f4f4ee20428d971e9ee615d3ab1ddd8acffbfa3a40",
    "features/admin/menus/components/MenuListPageClient.tsx": "7f9d8981e53ac534272143879ad472bb28029eb5093d32cfa31beae65c672d56",
    "lib/utils/api-error-message.ts": "42d5d90c48170184cf177dff4b206e004d90c103c67bc7936f2fb91792d98336",
    "lib/allergens.ts": "29da02601f845d918e9515be57da9fe79f6353ec4f8a8386c5f9b718cef1b50f"
  },
  "limits": [
    "In-memory reproduction, not actual PostgreSQL concurrency or durability",
    "Synthetic React state/JSX, not browser/Clerk/Next deployment",
    "Observed negative conditions; app remains unchanged"
  ]
}

```
