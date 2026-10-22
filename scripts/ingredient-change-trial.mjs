// One fictional dish; real UI/pure policies; memory-only save adapters.
// Never imports the app server, DB, Clerk or Blob. This is not a food/user study.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const args = process.argv.slice(2);
const usage = "node scripts/ingredient-change-trial.mjs --serve|--check [--assets-root PATH] [--icons-root PATH] [--output PATH] [--minutes 30]";
if (args.length === 0 || args.includes("--help")) {
    console.log(usage);
    console.log("Uses existing app dependencies and built CSS, never runs build/generate/install. Optional icons-root reads an existing material-symbols.css/.woff2 cache; otherwise decorative icons are omitted. Serve binds only 127.0.0.1, defaults to 30 minutes; Ctrl+C stops it and discards all sessions. The startup-only facilitator token is not an app role or OS/browser security boundary; do not share that terminal/history with a respondent. Check requires an existing Playwright and browser via PLAYWRIGHT_MODULE_PATH/BROWSER_EXECUTABLE. No app/DB/auth/Blob or real participant data.");
    process.exit(0);
}
const mode = args.shift();
assert.ok(["--serve", "--check"].includes(mode), usage);
const options = new Map();
while (args.length) {
    const key = args.shift();
    assert.ok(["--assets-root", "--icons-root", "--output", "--minutes"].includes(key) && args.length && !options.has(key), usage);
    options.set(key, args.shift());
}
const minutes = Number(options.get("--minutes") || "30");
assert.ok(Number.isInteger(minutes) && minutes >= 1 && minutes <= 120, "--minutes must be an integer from 1 to 120");
const fixture = mkdtempSync(join(tmpdir(), "clearallergy-ingredient-trial-"));
const output = resolve(options.get("--output") || fixture);
mkdirSync(output, { recursive: true });
const assetsRoot = resolve(options.get("--assets-root") || root);
const cssDirs = [".next/static/chunks", ".next/static/css"];
const cssFiles = cssDirs.flatMap(relative => {
    const directory = join(assetsRoot, relative);
    return existsSync(directory) ? readdirSync(directory).filter(name => name.endsWith(".css")).map(name => join(relative, name)) : [];
});
assert.ok(cssFiles.length, "No existing built CSS found");
const css = cssFiles.map(name => readFileSync(join(assetsRoot, name), "utf8")).join("\n");
const { webpack } = require("next/dist/compiled/webpack/webpack");
writeFileSync(join(fixture, "loader.cjs"), "const ts=require(" + JSON.stringify(require.resolve("typescript")) + ");module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText}", "utf8");
writeFileSync(join(fixture, "link.tsx"), "import React from 'react';export default function Link({prefetch,children,...p}){return <a {...p}>{children}</a>}", "utf8");
writeFileSync(join(fixture, "image.tsx"), "import React from 'react';export default function Image({fill,priority,...p}){return <img {...p}/>}", "utf8");
writeFileSync(join(fixture, "navigation.ts"), "const r={push:p=>location.assign(p),replace:p=>location.replace(p),refresh:()=>window.dispatchEvent(new Event('trial-refresh'))};export function useRouter(){return r}export function useSearchParams(){return new URLSearchParams(location.search)}", "utf8");

// The adapter intentionally does not reproduce SQL trigger increments/locks.
// Shared pure functions define display/food gates; real transactions are tested elsewhere.
const policyEntry = String.raw`
import {ALLERGEN_MASTER} from '@/lib/constants/allergen-master';
import {foodSnapshot,foodContentChanged,hasUnresolvedFoodIssue} from '@/features/admin/menus/food-review';
import {menuInputSchema} from '@/features/admin/menus/schemas/menu-input';
import {isMenuPublishable,isMenuPublicationCurrent} from '@/lib/allergens';
import {toAdminMenuListRow} from '@/features/admin/menus/server/menu-list-data';
export const master=ALLERGEN_MASTER.map((a,i)=>({...a,sortOrder:i+1}));
export const recipes={A:'【架空 R1】米、きのこ、ソースA（架空 A-1：小麦・大豆使用）、白ごまの飾り',B:'【架空 R2】米、きのこ、ソースB（架空 B-1：小麦・大豆・乳使用）、白ごまの飾り'};
const now=()=>new Date().toISOString();
const status=(milk='FREE')=>Object.fromEntries(master.map(a=>[a.slug,['wheat','soybean','sesame'].includes(a.slug)?'CONTAINS':a.slug==='milk'?milk:'FREE']));
function record(menu,unresolvedIssues=null,evidenceRefs=null){return {id:'synthetic-'+menu.foodVersion+'-'+menu.version,foodVersion:menu.foodVersion,evidenceRefs:evidenceRefs||'架空資料 '+(menu.ingredients===recipes.A?'A-1 / R1':'B-1 / R2')+'（実食品の確認ではない）',scope:'架空の小丼の全構成・マスター全品目。工程の交差接触は未確認',checkedAt:now(),recordedAt:now(),unresolvedIssues,contentSnapshot:foodSnapshot(menu,master,menu.statuses)}}
export function make(scenario='A'){
 const menu={id:'trial-dish-one',shopId:'trial-shop-f',name:'架空・きのこの小丼',description:'一料理・一材料変更の隔離演習',category:'架空の丼',priceYen:700,imageUrl:null,imageFrame:'wide',imageFit:'contain',imagePosition:'center',imageZoom:100,imagePositionX:50,imagePositionY:50,ingredients:recipes.A,precaution:'架空の資料です。工程・共用器具・交差接触はこの資料では確認していません。',version:5,foodVersion:1,reviewedFoodVersion:1,publicationConfirmedFoodVersion:1,isPublished:true,updatedAt:now(),statuses:status(),foodReviews:[]};
 menu.foodReviews=[record(menu)];
 const state={scenario,generation:0,fault:'normal',physical:'A',inventory:'Aのみ。旧新在庫の併存はないという架空条件',providedBatch:'F-01: ソースAを使用（現物相当カード）',menu};
 if(['stale','unknown','B','unresolved'].includes(scenario)) {menu.ingredients=recipes.B;menu.statuses=status('CONTAINS');menu.version=6;menu.foodVersion=2;menu.reviewedFoodVersion=null;menu.publicationConfirmedFoodVersion=null;menu.isPublished=false;state.physical='B';state.inventory='Bのみ。旧Aは残っていないという架空条件';state.providedBatch='F-02: ソースBを使用（現物相当カード）'}
 if(scenario==='B'){menu.publicationConfirmedFoodVersion=2;menu.reviewedFoodVersion=2;menu.isPublished=true;menu.foodReviews.unshift(record(menu))}
 if(scenario==='unknown'){menu.ingredients='【架空 B-?】米、きのこ、ソースB（複合材料の内訳・資料版を確認できない）、白ごま';menu.statuses.milk='UNKNOWN';menu.foodReviews.unshift(record(menu,'Bの複合材料内訳・適用する提供分を確認できない','架空 B-?受領メモのみ。製品仕様の内訳・資料版は未取得'))}
 if(scenario==='unresolved'){state.physical='A/B（提供分の使用ソース不明）';state.inventory='旧A・新Bが併存する架空条件';state.providedBatch='F-03: 旧A/新Bとの対応は不明';menu.foodReviews.unshift(record(menu,'旧新在庫と提供分の対応が確認できない'))}
 if(scenario==='stop')menu.isPublished=false;
 if(scenario==='unreported'){state.physical='B';state.inventory='Bのみ。旧Aは残っていない（進行役の現物相当台帳）';state.providedBatch='F-02: ソースBを使用（現物相当カード）'}
 if(scenario==='missing'){menu.foodReviews=[];menu.publicationConfirmedFoodVersion=null;menu.reviewedFoodVersion=null;menu.isPublished=false}
 return state;
}
const links=menu=>master.map(a=>({allergen:{slug:a.slug},status:menu.statuses[a.slug]??'UNKNOWN'}));
export function publicVisible(menu){const latest=menu.foodReviews[0];return menu.isPublished&&isMenuPublicationCurrent(menu)&&isMenuPublishable({name:menu.name,allergens:master,statusBySlug:menu.statuses})&&!hasUnresolvedFoodIssue(menu.foodVersion,latest)}
export function project(state,facilitator=false){
 const menu=state.menu;
 const a={id:'A-1',title:'A-1 / R1',body:recipes.A+'。この架空資料では乳を原材料として使わないと明示。工程はこの資料の対象外。'};
 const b={id:'B-1',title:'B-1 / R2',body:recipes.B+'。今回の架空資料ではソースの仕様変更を記載。'};
 const partial={id:'B-?',title:'B-? / 受領したメモ',body:'製品Bの受領メモ。複合材料の内訳と資料の版は添付されていません。メモの構成: 米、きのこ、ソースB。提供分F-02に製品Bを使用開始したとの申告。'};
 const mixed={id:'F-03',title:'提供分F-03 / 在庫の記録',body:'旧ソースAの仕込みと新ソースBの在庫が併存。F-03がどちらを使ったか、受領した記録では対応が分かりません。'};
 const assigned=state.scenario==='unknown'?[partial]:state.scenario==='unresolved'?[a,b,mixed]:['stale','B'].includes(state.scenario)?[b]:[a];
 const common={generation:state.generation,menu,master,materials:assigned,publicVisible:publicVisible(menu),listRow:toAdminMenuListRow({...menu,updatedAt:new Date(menu.updatedAt),allergenLinks:links(menu)},master)};
 if(!facilitator)return common;
 return {...common,scenario:state.scenario,fault:state.fault,physical:state.physical,inventory:state.inventory,providedBatch:state.providedBatch,applicationDeclaration:menu.ingredients===recipes.A?'A / R1':menu.ingredients===recipes.B?'B / R2':'保存済み原材料欄を参照',recipes,allMaterials:[a,b,partial,mixed,{id:'answer',title:'B-? / 旧新在庫 / 材料抜け',body:'進行役の期待結果: B-?条件では完全B-1を先に渡さない。最初の受領メモには白ごまの飾りが抜けている。未申告条件では現物相当BとアプリAが異なり、機械だけでは検知不能。アプリは材料テキストの網羅性や現物を自動照合しません。'}],answerNotes:'全資料と期待結果は進行役の手元で管理し、初回回答の前に操作者へ見せない。起動時tokenはこのfixtureの表示・制御を分けるだけで、アプリ認可や同じPC・ブラウザ履歴・開発者ツールからの機密保護を保証しない。'};
}
export function update(state,raw){
 const parsed=menuInputSchema.safeParse(raw);if(!parsed.success)return {status:400,body:{error:'架空入力の形式を確認してください'}};
 const input=parsed.data;const menu=state.menu;
 if(input.expectedVersion===undefined)return {status:428,body:{error:'版が必要です（架空応答）'}};
 if(input.expectedVersion!==menu.version)return {status:409,body:{error:'他の更新があります。入力を保持し、最新内容を確認してください（架空競合）'}};
 const fault=state.fault;state.fault='normal';
 if(fault==='conflict'){menu.version++;return {status:409,body:{error:'他の更新があります。入力を保持し、最新内容を確認してください（架空競合）'}}}
 if(fault==='invalid200')return {status:200,body:{}};
 if(input.imageUrl||input.allergenStatusBySlug&&Object.keys(input.allergenStatusBySlug).some(k=>!master.some(a=>a.slug===k)))return {status:400,body:{error:'この演習では画像追加や対象外の品目登録は扱いません'}};
 if(input.foodReview)return {status:400,body:{error:'旧確認フォームの保存には対応していません'}};
 const next={...menu,statuses:{...menu.statuses,...input.allergenStatusBySlug},foodReviews:[...menu.foodReviews]};
 for(const k of ['name','description','category','ingredients','precaution','imageUrl','imageFrame','imageFit','imagePosition','imageZoom','imagePositionX','imagePositionY'])if(input[k]!==undefined)next[k]=input[k];
 if(input.priceYen!==undefined){const price=input.priceYen===null||input.priceYen===''?null:Number(input.priceYen);if(price!==null&&(!Number.isSafeInteger(price)||price<0))return {status:400,body:{error:'価格を確認してください'}};next.priceYen=price}
 const changed=!!input.foodChangeReported||foodContentChanged(foodSnapshot(menu,master,menu.statuses),foodSnapshot(next,master,next.statuses));
 if(changed){next.foodVersion++;next.reviewedFoodVersion=null;next.publicationConfirmedFoodVersion=null;next.isPublished=false}
 next.version++;next.updatedAt=now();
 if(input.foodIssueResolution){
  const target=input.foodIssueResolution,latest=next.foodReviews[0];
  if(target.foodVersion!==next.foodVersion||target.foodReviewId!==latest?.id||!hasUnresolvedFoodIssue(next.foodVersion,latest))return {status:400,body:{error:'表示した未解決と保存食品版を確認してください'}};
  next.foodReviews=[{...latest,issueResolutions:[{foodVersion:next.foodVersion,resolvedAt:now()}]},...next.foodReviews.slice(1)];
  next.isPublished=false;next.publicationConfirmedFoodVersion=null;
 }else if(input.publicationAction==='publish'){
  if(changed||!isMenuPublishable({name:next.name,allergens:master,statusBySlug:next.statuses})||hasUnresolvedFoodIssue(next.foodVersion,next.foodReviews[0]))return {status:400,body:{error:'保存済みの内容・未設定・未解決事項を確認してください'}};
  next.publicationConfirmedFoodVersion=next.foodVersion;next.isPublished=true;
 }else if(input.publicationAction==='unpublish'||input.isPublished===false)next.isPublished=false;
 else if(input.isPublished===true&&!menu.isPublished)return {status:400,body:{error:'別に公開操作が必要です'}};
 if(!isMenuPublicationCurrent(next)||!isMenuPublishable({name:next.name,allergens:master,statusBySlug:next.statuses}))next.isPublished=false;
 state.menu=next;
 return {status:200,body:{menu:{id:next.id,version:next.version,foodVersion:next.foodVersion,reviewedFoodVersion:next.reviewedFoodVersion,publicationConfirmedFoodVersion:next.publicationConfirmedFoodVersion,isPublished:next.isPublished,imageUrl:null,foodReviews:next.foodReviews},...(fault==='refresh-pending'?{publicRefreshPending:true}:{})}};
}
`;
writeFileSync(join(fixture, "policy.ts"), policyEntry, "utf8");

const appEntry = String.raw`
import React from 'react';import {createRoot} from 'react-dom/client';
import MenuList from '@/features/admin/menus/components/MenuListPageClient';
import Edit from '@/features/admin/menus/components/MenuEditClient';
import PublicList from '@/features/public/shops/components/ShopMenuListClient';
import PublicDetail from '@/features/public/shops/components/PublicMenuDetailBodyClient';
import {buildAllergenRows,buildAllergenDisplayItems} from '@/lib/allergens';
import {formatPriceYen} from '@/lib/utils/formatters';
const dish='/admin/menus/trial-dish-one/edit',pub='/shops/trial-shop-f',detail=pub+'/menus/trial-dish-one';
async function json(path,body){const key=new URLSearchParams(location.search).get('facilitator');const r=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',...(key?{'X-Trial-Facilitator':key}:{})},body:JSON.stringify(body)});if(!r.ok)throw new Error('演習状態の操作を確認できません');return r.json()}
function App(){const facilitatorKey=new URLSearchParams(location.search).get('facilitator');const facilitator=!!facilitatorKey;const [data,setData]=React.useState(null),[error,setError]=React.useState('');const refresh=()=>json('/__trial__/state'+(facilitator?'?facilitator='+encodeURIComponent(facilitatorKey):'')).then(setData).catch(()=>setError('演習状態を読み込めません。ページを読み直してください'));
 React.useEffect(()=>{refresh();window.addEventListener('trial-refresh',refresh);return()=>window.removeEventListener('trial-refresh',refresh)},[]);
 const [scenario,setScenario]=React.useState('A'),[fault,setFault]=React.useState('normal');
 const path=location.pathname;
 if(error)return <p role='alert'>{error}</p>;if(!data)return <p role='status'>架空の演習を準備中</p>;
 const m=data.menu,master=data.master,links=master.map(a=>({allergen:{slug:a.slug},status:m.statuses[a.slug]??'UNKNOWN'}));
 const card={id:m.id,name:m.name,description:m.description,category:m.category,priceYen:m.priceYen,precaution:m.precaution,updatedAt:m.updatedAt,allergenLinks:links};
 return <><header><h1>一料理の材料変更を試す</h1><p className='trial-boundary'>架空データの隔離演習。実UIを使いますが、保存・公開・食品確認記録はこのプロセスのメモリ内だけの再現です。実サーバー・DB・Clerk・Blobには接続しません。実際の飲食判断には使わないでください。</p><nav aria-label='演習の画面'><a href='/'>管理一覧</a><a href={dish}>料理編集</a><a href={pub}>公開一覧</a><a href={detail}>公開詳細</a><a href={facilitator?'/materials?facilitator='+encodeURIComponent(facilitatorKey):'/materials'}>{facilitator?'進行役の全資料':'割当てられた資料'}</a>{facilitator&&<a href={'/?facilitator='+encodeURIComponent(facilitatorKey)}>進行役</a>}</nav></header>
 {facilitator&&<section className='trial-panel' aria-label='進行役の制御'><h2>進行役の条件設定（回答前に見せない）</h2><label htmlFor='trial-scenario'>進行条件</label><select id='trial-scenario' value={scenario} onChange={e=>setScenario(e.target.value)}><option value='A'>S0 A確認済み</option><option value='stale'>S1 食品変更・旧確認</option><option value='unknown'>S2 複合材料未確認</option><option value='B'>S3 B確認済み</option><option value='stop'>S4 通常STOP・確認は現行</option><option value='unreported'>S5 未申告変更・検知不能</option><option value='unresolved'>S6 最新記録に未解決</option><option value='missing'>S7 確認記録なし</option></select><button onClick={()=>{if(confirm('このセッションの入力・架空保存を捨てて条件をリセットしますか？'))json('/__trial__/scenario',{scenario}).then(refresh)}}>この条件にリセット</button><label htmlFor='trial-fault'>次の料理保存の合成応答</label><select id='trial-fault' value={fault} onChange={e=>setFault(e.target.value)}><option value='normal'>正常</option><option value='conflict'>競合409</option><option value='invalid200'>不正200・更新しない</option><option value='refresh-pending'>保存済み・公開反映未完了</option></select><button onClick={()=>json('/__trial__/fault',{fault}).then(refresh)}>次回の応答を設定</button><p>現在条件: {data.scenario} / 食品確認: {data.listRow.foodReviewState} / 物理相当カード: {data.physical} / {data.inventory}</p>{data.scenario==='unreported'&&<p role='status'>機械で検知不能：進行役の台帳ではBを使用、アプリには変更イベントを渡していません。旧表示が残る運用上の限界を観察します。</p>}<p>食品版の加算・記録・CASは簡略化したメモリモデルです。SQLトリガーや実認証、同時実DB保存の証拠ではありません。#73の店舗基本情報保存は別の検証です。</p></section>}
 {facilitator&&<section className='trial-panel' aria-label='進行役の現物と申告の照合'><h2>現物相当の台帳とアプリ申告を分ける</h2><p>対象提供分: {data.providedBatch}</p><p>アプリ申告: {data.applicationDeclaration}</p><p>{data.answerNotes}</p></section>}
 <section aria-label='演習の操作画面' className='trial-screen'>
 {path==='/'&&<MenuList key={data.generation+':'+m.version} initialMenus={[data.listRow]} totalAllergenCount={master.length} readOnly readOnlyEditHrefBase='/admin/menus'/>}
 {path===dish&&<Edit key={data.generation} menuId={m.id} initialVersion={m.version} initialFoodVersion={m.foodVersion} initialReviewedFoodVersion={m.reviewedFoodVersion} initialPublicationConfirmedFoodVersion={m.publicationConfirmedFoodVersion} initialFoodReviews={m.foodReviews} initialName={m.name} initialDescription={m.description} initialPriceYen={m.priceYen} initialCategory={m.category} initialIngredients={m.ingredients} initialPrecaution={m.precaution} initialImageUrl={null} initialImageFrame='wide' initialImageFit='contain' initialImagePosition='center' initialImageZoom={100} initialImagePositionX={50} initialImagePositionY={50} initialIsPublished={m.isPublished} allergens={master} initialStatusBySlug={m.statuses}/>}
 {(path===pub||path===detail)&&!data.publicVisible&&<div role='status' data-trial-public='excluded'><h2>この演習では公開対象外です</h2><p>保存済みの公開フラグ・全品目・公開の版対応・未解決事項の条件で表示から外しています。これはfixtureの説明で、実アプリの訂正案内やHTTP not-foundを再現するものではありません。</p><p>既に開いたタブ・紙・画像へ訂正が届く保証はありません。通常の停止だけでは何が訂正されたか分からない場合があります。</p></div>}
 {path===pub&&data.publicVisible&&<PublicList shopId={m.shopId} menus={[card]} allergenMaster={master} storeHandledAllergenSlugs={[]}/>}
 {path===detail&&data.publicVisible&&<PublicDetail shopId={m.shopId} shopName='演習店 F' menuName={m.name} description={m.description} category={m.category} priceText={formatPriceYen(m.priceYen)} updatedAtText={new Date(m.updatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} safeImageUrl={null} imageFrame='wide' imageFit='contain' imagePosition='center' imageZoom={100} imagePositionX={50} imagePositionY={50} ingredients={m.ingredients} precaution={m.precaution} allergensForClient={master} statusBySlugForClient={m.statuses} rows={buildAllergenDisplayItems(buildAllergenRows(master,links),new Set())} storeHandledAllergenSlugs={[]}/>}
 {path==='/materials'&&<div><h2>{facilitator?'進行役の全資料・期待結果（操作者へ先に見せない）':'今回割当てられた架空資料'}</h2>{(facilitator?data.allMaterials:data.materials).map(card=><section key={card.id} className='trial-panel' data-trial-material={card.id}><h3>{card.title}</h3><p>{card.body}</p></section>)}</div>}
 </section><footer className='trial-panel'>予行・画面動作の結果と、人の理解・実店舗の工数は別です。ここでの操作は、全25試験合格、安全性、時短、誤認防止の証明ではありません。進行台本と匿名記録票を併用してください。保存データはサーバー終了で消えます。</footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
writeFileSync(join(fixture, "entry.tsx"), appEntry, "utf8");
const modules = new Set();
async function compile(entry, filename, target) {
    const compiler = webpack({ mode: "production", target, entry: join(fixture, entry),
        output: { path: fixture, filename, ...(target === "node" ? { library: { type: "commonjs2" } } : {}) },
        optimization: { minimize: false }, module: { rules: [{ test: /\.tsx?$/, use: join(fixture, "loader.cjs") }] },
        plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "production" }) })],
        resolve: { extensions: [".tsx", ".ts", ".js"], modules: [join(root, "node_modules")], alias: {
            "@": root, "next/link": join(fixture, "link.tsx"), "next/navigation": join(fixture, "navigation.ts"), "next/image": join(fixture, "image.tsx"),
        } },
    });
    await new Promise((done, reject) => compiler.run((error, stats) => compiler.close(closeError => {
        if (error || closeError || stats?.hasErrors()) return reject(error || closeError || new Error(stats.toString({ all: false, errors: true })));
        for (const item of stats.compilation.modules) modules.add(item.resource || item.identifier());
        done();
    })));
}
await compile("policy.ts", "policy.cjs", "node");
await compile("entry.tsx", "bundle.js", "web");
assert.ok(![...modules].some(name => /(?:lib[\\/]db\.|@clerk[\\/]|@prisma[\\/]client|@vercel[\\/]blob)/.test(name)), "Forbidden app-service import in fixture bundle");
const policy = require(join(fixture, "policy.cjs"));
const assets = new Map([["/style.css", ["text/css; charset=utf-8", css]], ["/bundle.js", ["text/javascript; charset=utf-8", readFileSync(join(fixture, "bundle.js"))]]]);
const media = join(assetsRoot, ".next/static/media");
if (existsSync(media)) for (const name of readdirSync(media)) if (name.endsWith(".woff2")) {
    for (const prefix of ["/media/", "/_next/static/media/"]) assets.set(prefix + name, ["font/woff2", readFileSync(join(media, name))]);
}
const customCss = "body{margin:0;background:#f7f8f5;color:#111827;font-family:Arial,sans-serif}main{max-width:1152px;margin:auto;padding:16px}header>h1{font-size:1.6rem;font-weight:800;margin:0 0 12px}nav{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}nav a,.trial-panel button{display:inline-flex;align-items:center;min-height:44px;padding:8px 12px;border:1px solid #64748b;border-radius:8px;background:white;color:#0f172a}.trial-boundary,.trial-panel{border:1px solid #d1d5db;background:white;padding:16px;border-radius:12px;margin:16px 0;overflow-wrap:anywhere}.trial-panel label{display:block;margin:10px 0}.trial-panel select{max-width:100%;margin:4px 0;padding:8px;border:1px solid #64748b;border-radius:8px}.trial-panel h2,.trial-panel h3{font-weight:bold;margin:4px 0 8px}.trial-panel p{margin:8px 0}.trial-screen{min-width:0}a:focus-visible,button:focus-visible,select:focus-visible{outline:3px solid #0f4c2f;outline-offset:3px}";
// RootLayout's icon font is external. Reuse an operator-supplied local cache,
// or omit decorative glyphs while preserving the component's labels/controls.
let icons = { mode: "decorative glyphs omitted; no external font requested" };
if (options.has("--icons-root")) {
    const iconRoot = resolve(options.get("--icons-root"));
    const iconCss = readFileSync(join(iconRoot, "material-symbols.css"), "utf8");
    const iconFont = readFileSync(join(iconRoot, "material-symbols.woff2"));
    const urls = [...iconCss.matchAll(/url\(([^)]+)\)/g)].map(item => item[1].trim().replace(/^['"]|['"]$/g, ""));
    assert.ok(urls.length && urls.every(url => url === "/material-symbols.woff2") && !/@import/i.test(iconCss), "Icon cache CSS must reference only /material-symbols.woff2 and no imports");
    assets.set("/material-symbols.css", ["text/css; charset=utf-8", iconCss]);
    assets.set("/material-symbols.woff2", ["font/woff2", iconFont]);
    icons = { mode: "existing local font cache; this script performs no download", cssSha256: createHash("sha256").update(iconCss).digest("hex"), fontSha256: createHash("sha256").update(iconFont).digest("hex") };
}
assets.set("/trial.css", ["text/css; charset=utf-8", customCss + "body{font-family:'Noto Sans JP',sans-serif}" + (options.has("--icons-root") ? "" : ".material-symbols-outlined{display:none!important}")]);
const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>一料理の材料変更・隔離演習</title><link rel="stylesheet" href="/style.css">' + (options.has("--icons-root") ? '<link rel="stylesheet" href="/material-symbols.css">' : '') + '<link rel="stylesheet" href="/trial.css"></head><body><main><div id="root"></div></main><script src="/bundle.js"></script></body></html>';
const pages = new Set(["/", "/materials", "/admin/menus/trial-dish-one/edit", "/shops/trial-shop-f", "/shops/trial-shop-f/menus/trial-dish-one"]);
const scenarios = new Set(["A", "stale", "unknown", "B", "stop", "unreported", "unresolved", "missing"]);
const faults = new Set(["normal", "conflict", "invalid200", "refresh-pending"]);
const sessions = new Map();
const facilitatorToken = randomUUID();
let origin, server;
const counters = { requests: 0, foreignOriginRejected: 0, blockedExternalBrowserRequests: 0 };
function send(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
}
async function bodyJson(req) {
    let size = 0;
    const pieces = [];
    for await (const piece of req) { size += piece.length; if (size > 32768) throw new Error("body_limit"); pieces.push(piece); }
    return JSON.parse(Buffer.concat(pieces).toString("utf8"));
}
server = createServer(async (req, res) => {
    counters.requests++;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'");
    if (req.headers.host !== new URL(origin).host) return send(res, 403, { error: "loopback_host_required" });
    if (!["GET", "HEAD"].includes(req.method) && req.headers.origin !== origin) { counters.foreignOriginRejected++; return send(res, 403, { error: "same_origin_required" }); }
    const url = new URL(req.url, origin), path = url.pathname;
    const requestedFacilitator = url.searchParams.get("facilitator");
    if (requestedFacilitator !== null && requestedFacilitator !== facilitatorToken) return send(res, 403, { error: "fixture_facilitator_token_required" });
    if (["/__trial__/scenario", "/__trial__/fault"].includes(path) && req.headers["x-trial-facilitator"] !== facilitatorToken) return send(res, 403, { error: "fixture_facilitator_token_required" });
    const asset = assets.get(path);
    if (asset && req.method === "GET") { res.writeHead(200, { "Content-Type": asset[0] }); return res.end(asset[1]); }
    let id = /(?:^|;\s*)ca_trial=([a-f0-9-]{36})(?:;|$)/.exec(req.headers.cookie || "")?.[1];
    if (!id || !sessions.has(id)) {
        if (sessions.size >= 16) return send(res, 429, { error: "session_limit_restart_fixture" });
        id = randomUUID(); sessions.set(id, policy.make()); res.setHeader("Set-Cookie", `ca_trial=${id}; HttpOnly; SameSite=Strict; Path=/`);
    }
    const state = sessions.get(id);
    try {
        if (pages.has(path) && req.method === "GET") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(html); }
        if (path === "/__trial__/state" && req.method === "GET") return send(res, 200, policy.project(state, requestedFacilitator === facilitatorToken));
        if (path === "/__trial__/scenario" && req.method === "POST") {
            const { scenario } = await bodyJson(req); if (!scenarios.has(scenario)) return send(res, 400, { error: "unknown_scenario" });
            const next = policy.make(scenario); next.generation = state.generation + 1; sessions.set(id, next); return send(res, 200, { ok: true });
        }
        if (path === "/__trial__/fault" && req.method === "POST") {
            const { fault } = await bodyJson(req); if (!faults.has(fault)) return send(res, 400, { error: "unknown_fault" });
            state.fault = fault; return send(res, 200, { ok: true });
        }
        if (path === "/api/admin/menus/trial-dish-one" && req.method === "PUT") {
            const result = policy.update(state, await bodyJson(req));
            return send(res, result.status, result.body);
        }
        if (path === "/api/admin/menus/trial-dish-one/stop" && req.method === "POST") {
            state.menu.isPublished = false; state.menu.version++; state.menu.updatedAt = new Date().toISOString();
            return send(res, 200, { ok: true, menu: { id: state.menu.id, isPublished: false, version: state.menu.version } });
        }
        return send(res, 404, { error: "unsupported_in_isolated_trial" });
    } catch { return send(res, 400, { error: "invalid_trial_request" }); }
});
await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
origin = `http://127.0.0.1:${server.address().port}`;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const sourceFiles = ["scripts/ingredient-change-trial.mjs", "features/admin/menus/components/MenuListPageClient.tsx", "features/admin/menus/components/MenuEditClient.tsx", "features/admin/menus/components/MenuFoodReviewHistory.tsx", "features/admin/menus/components/MenuSaveOutcomeNotice.tsx", "features/admin/menus/menu-save-plan.ts", "features/admin/menus/menu-list.ts", "features/admin/menus/server/menu-list-data.ts", "features/admin/menus/food-review.ts", "features/admin/menus/schemas/menu-input.ts", "features/admin/menus/schemas/menu-response.ts", "features/public/shops/components/ShopMenuListClient.tsx", "features/public/shops/components/PublicMenuDetailBodyClient.tsx", "lib/allergens.ts", "lib/constants/allergen-master.ts", "lib/utils/formatters.ts"];
const manifest = { createdAt: new Date().toISOString(), mode, sourceHead: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).stdout.trim(), node: process.version, sourceFiles: Object.fromEntries(sourceFiles.map(name => [name, sha256(readFileSync(join(root, name)))])), assetsRoot, cssFiles: Object.fromEntries(cssFiles.map(name => [name, sha256(readFileSync(join(assetsRoot, name)))])), icons, transport: "127.0.0.1 only; memory sessions; same-origin mutations; startup-only facilitator token; CSP self-only; Next/save adapters", limits: ["No real server/DB/auth/Blob", "No trigger/transaction/concurrency proof", "No participant or timing study", "No food/clinical/safety validation", "No unreported physical-change detection", "No delivery of corrections into existing tabs/paper/images", "No claim that all 25 research tests passed", "Facilitator token separates this fixture's presentation/controls; no OS, shared-PC, browser-history or developer-tools confidentiality guarantee", "Facilitator screenshots and R3 truth-card evidence must not be shown before an unprompted response"] };
writeFileSync(join(output, "trial-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
let browser;
const screenshots = [], groups = [], reviewRegressions = [];
async function close() { if (browser) await browser.close(); await new Promise(done => server.close(done)); sessions.clear(); }
if (mode === "--serve") {
    console.log(`Fictional trial: ${origin}`);
    console.log(`Facilitator (keep private; valid only this run): ${origin}/?facilitator=${facilitatorToken}`);
    console.log(`Memory only; auto-stop in ${minutes} minute(s). Ctrl+C stops this server and discards all sessions. No responses or participant data are logged. Manifest: ${join(output, "trial-manifest.json")}`);
    await new Promise(done => { const stop = () => { clearTimeout(timer); done(); }; const timer = setTimeout(stop, minutes * 60000); process.once("SIGINT", stop); process.once("SIGTERM", stop); });
    await close();
} else {
    try {
        const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
        browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
        context.setDefaultTimeout(15000);
        await context.route("**/*", route => { if (new URL(route.request().url()).origin === origin) return route.continue(); counters.blockedExternalBrowserRequests++; return route.abort(); });
        const page = await context.newPage(), errors = [];
        page.on("pageerror", e => errors.push(e.message));
        page.on("dialog", dialog => dialog.accept()); // Dedicated fictional context only.
        const pass = text => { groups.push(text); console.log("PASS: " + text); };
        const facilitatorPath = path => path + "?facilitator=" + encodeURIComponent(facilitatorToken);
        const post = async (path, data) => { const r = await context.request.post(origin + path, { data, headers: { Origin: origin, "X-Trial-Facilitator": facilitatorToken } }); assert.equal(r.status(), 200); return r.json(); };
        const current = async () => (await context.request.get(origin + facilitatorPath("/__trial__/state"))).json();
        const go = async path => { await page.goto(origin + path); await page.getByRole("heading", { name: "一料理の材料変更を試す", exact: true }).waitFor(); await page.locator(".trial-screen").waitFor(); };
        const reset = async scenario => { await post("/__trial__/scenario", { scenario }); };
        const savedStatus = page.getByRole("status").filter({ hasText: /^保存しました。公開状態：/ });
        const confirmSaved = async (published, reviewCurrent) => {
            await savedStatus.waitFor();
            assert.equal((await savedStatus.innerText()).replace(/\s/g, ""),
                `保存しました。公開状態：${published ? "公開" : "非公開"}。公開操作：${reviewCurrent ? "保存済みの食品内容に対応" : "保存済み内容から別に公開が必要"}。`);
        };
        const capture = async name => { await page.screenshot({ path: join(output, name + ".png"), fullPage: true }); screenshots.push(name + ".png"); };
        const regression = async (id, description, check) => {
            try { const details = await check(); reviewRegressions.push({ id, status: "PASS", ...(details ? { details } : {}) }); pass(description); }
            catch (error) { const failure = error.message.replaceAll(facilitatorToken, "[fixture-token]"); reviewRegressions.push({ id, status: "FAIL", failure }); console.log("RED " + id + ": " + failure); }
        };
        await regression("R1", "Operator navigation/data show only assigned cards; full sources and answers stay on the explicit facilitator view", async () => {
            await reset("unknown"); await go("/");
            assert.equal(await page.locator('a[href*="facilitator"]').count(), 0, "Operator navigation must not expose facilitator controls");
            await go("/materials");
            let materialText = await page.locator(".trial-screen").innerText();
            assert.match(materialText, /B-\?/); assert.doesNotMatch(materialText, /B-1|白ごま|材料抜け|機械で検知不能/);
            await capture("04-operator-assigned-partial-materials-390");
            const operatorState = await page.evaluate(() => fetch("/__trial__/state").then(response => response.json()));
            for (const key of ["recipes", "physical", "inventory", "providedBatch", "scenario", "answerNotes"]) assert.equal(key in operatorState, false, "Operator projection must omit " + key);
            for (const path of ["/materials?facilitator=1", "/__trial__/state?facilitator=1"]) assert.equal((await context.request.get(origin + path)).status(), 403, "Guessed/direct participant URL must not expose facilitator data");
            assert.equal((await context.request.post(origin + "/__trial__/scenario", { data: { scenario: "B" }, headers: { Origin: origin } })).status(), 403, "Operator cannot reset the study condition without facilitator token");
            await go(facilitatorPath("/materials"));
            await page.getByRole("heading", { name: "B-1 / R2", exact: true }).waitFor();
            await page.getByRole("heading", { name: "B-? / 旧新在庫 / 材料抜け", exact: true }).waitFor();
            await capture("05-facilitator-only-complete-materials-390");
            await reset("unreported"); await go("/materials");
            materialText = await page.locator(".trial-screen").innerText();
            assert.match(materialText, /A-1/); assert.doesNotMatch(materialText, /B-1|検知不能|変更イベント|進行役台帳/);
            return { operatorStateKeys: Object.keys(operatorState), operatorAssignedCardIds: operatorState.materials.map(card => card.id), unreportedAssignedCardIds: (await page.evaluate(() => fetch("/__trial__/state").then(response => response.json()))).materials.map(card => card.id), guessedFacilitatorDocumentStatus: 403, guessedFacilitatorStateStatus: 403, noTokenControlStatus: 403 };
        });
        await regression("R2", "Real price edits agree with public detail for 710 yen and unset price", async () => {
            await reset("A"); await go("/admin/menus/trial-dish-one/edit");
            await page.getByLabel("価格（税込・円）", { exact: true }).fill("710");
            await page.getByRole("button", { name: "保存する", exact: true }).click();
            await confirmSaved(true, true);
            assert.equal((await current()).menu.priceYen, 710);
            await go("/shops/trial-shop-f/menus/trial-dish-one");
            assert.equal(await page.getByText("¥710", { exact: true }).count(), 1, "Public detail must use saved 710 yen");
            await capture("06-saved-price-710-detail-390");
            await go("/admin/menus/trial-dish-one/edit"); await page.getByLabel("価格（税込・円）", { exact: true }).fill("");
            await page.getByRole("button", { name: "保存する", exact: true }).click(); await confirmSaved(true, true);
            assert.equal((await current()).menu.priceYen, null);
            await go("/shops/trial-shop-f/menus/trial-dish-one"); assert.equal(await page.getByText("価格未設定", { exact: true }).count(), 1);
            return { savedPrices: [710, null], checkedDetailLabels: ["¥710", "価格未設定"] };
        });
        await regression("R3", "Scenario inventory and provided batches match physical cards while application declarations remain separate", async () => {
            const truthCards = [];
            const collect = state => truthCards.push({ scenario: state.scenario, physical: state.physical, inventory: state.inventory, providedBatch: state.providedBatch, applicationDeclaration: state.applicationDeclaration });
            for (const scenario of ["stale", "unknown", "B"]) {
                await reset(scenario); const state = await current();
                assert.equal(state.physical, "B"); assert.match(state.inventory, /Bのみ/, scenario + " must show B inventory");
                assert.match(state.providedBatch, /F-02.*B/); assert.doesNotMatch(state.inventory, /Aのみ/);
                collect(state);
            }
            await reset("unresolved"); let state = await current(); assert.match(state.physical, /A.*B/); assert.match(state.inventory, /併存/); assert.match(state.providedBatch, /対応.*不明/); collect(state);
            await reset("unreported"); state = await current(); assert.equal(state.physical, "B"); assert.match(state.providedBatch, /F-02.*B/); assert.equal(state.menu.ingredients, policy.recipes.A); collect(state);
            await reset("A"); state = await current(); assert.equal(state.physical, "A"); assert.match(state.inventory, /Aのみ/); assert.match(state.providedBatch, /F-01.*A/); collect(state);
            return { facilitatorOnlyTruthCards: truthCards };
        });
        assert.deepEqual(reviewRegressions.filter(item => item.status === "FAIL").map(item => item.id), [], "Independent-review regressions must pass before the broader fixture checks");
        await go(facilitatorPath("/"));
        await page.getByLabel("進行条件", { exact: true }).selectOption("stale");
        await page.getByRole("button", { name: "この条件にリセット", exact: true }).click();
        await page.getByText("公開前：保存済み内容の確認待ち", { exact: true }).waitFor();
        assert.equal((await current()).listRow.foodReviewState, "outdated");
        pass("Facilitator controls reset the one dish; real list exposes the outdated-food review queue");
        await capture("01-review-queue-390");
        for (const scenario of ["unknown", "unresolved", "missing"]) {
            await reset(scenario); await go("/");
            await page.getByRole("button", { name: /^公開前の確認待ち/ }).click();
            assert.equal(await page.locator("article").count(), 1);
            await go("/shops/trial-shop-f"); await page.locator('[data-trial-public="excluded"]').waitFor();
            assert.equal(await page.getByRole("link", { name: /架空・きのこの小丼/ }).count(), 0);
        }
        pass("Unknown, unresolved and missing-review states remain discoverable in admin and excluded from public props");
        await reset("unresolved"); await go("/admin/menus/trial-dish-one/edit");
        const oldIssue=(await current()).menu.foodReviews[0];
        assert.equal(await page.getByRole("button", { name: "公開する", exact: true }).isDisabled(), true);
        await page.getByRole("button", { name: "この内容は解消した", exact: true }).click();
        await page.getByText("未解決事項の解消を記録しました。保存済み内容を見直して、別に公開してください。", { exact: true }).waitFor();
        assert.equal((await current()).publicVisible,false);
        assert.equal((await current()).menu.foodReviews[0].unresolvedIssues,oldIssue.unresolvedIssues);
        assert.equal((await current()).menu.foodReviews[0].checkedAt,oldIssue.checkedAt);
        await page.getByRole("button", { name: "公開する", exact: true }).click(); await confirmSaved(true,true);
        assert.equal((await current()).publicVisible,true);
        pass("Explicit issue resolution preserves the old issue and date, stays unpublished, then separate publication works");
        await reset("stop"); await go("/");
        await page.getByText("食品内容の版対応あり", { exact: true }).waitFor();
        await page.getByRole("button", { name: /^公開前の確認待ち/ }).click();
        assert.equal(await page.locator("article").count(), 0);
        pass("Normal STOP keeps its food review current and is not a stale-review item");
        await reset("unreported"); await go(facilitatorPath("/"));
        await page.getByText(/機械で検知不能：/).waitFor();
        const unreported = await current(); assert.equal(unreported.physical, "B"); assert.equal(unreported.menu.statuses.milk, "FREE"); assert.equal(unreported.publicVisible, true);
        pass("Unreported physical B leaves old A visible; the independent facilitator card records the detection limit");
        await reset("A"); await go("/admin/menus/trial-dish-one/edit");
        await page.getByLabel("🧺 原材料名", { exact: true }).fill(policy.recipes.B);
        await page.getByRole("group", { name: "乳", exact: true }).getByRole("button", { name: "含む", exact: true }).click();
        await page.getByRole("button", { name: "保存する", exact: true }).click();
        await confirmSaved(false, false);
        let snapshot = await current(); assert.equal(snapshot.menu.statuses.milk, "CONTAINS"); assert.equal(snapshot.menu.isPublished, false); assert.equal(snapshot.listRow.foodReviewState, "outdated");
        await go("/"); await page.getByRole("link", { name: "架空・きのこの小丼：保存済み内容を見直す", exact: true }).click();
        assert.equal(await page.getByLabel("根拠資料・製品識別・資料の版", { exact: true }).count(), 0);
        const priorReviews=(await current()).menu.foodReviews;
        await page.getByRole("button", { name: "公開する", exact: true }).click();
        await confirmSaved(true, true);
        snapshot = await current(); assert.equal(snapshot.menu.isPublished, true); assert.equal(snapshot.listRow.foodReviewState, "current");
        assert.deepEqual(snapshot.menu.foodReviews, priorReviews, "Publication must not fabricate food evidence");
        await go("/shops/trial-shop-f/menus/trial-dish-one");
        await page.getByRole("heading", { name: "架空・きのこの小丼", exact: true }).waitFor();
        assert.match(await page.locator("body").innerText(), /乳使用/);
        await capture("02-reviewed-B-detail-390");
        pass("Actual edit inputs save fictional B, invalidate old review, then separately publish the saved milk-CONTAINS dish without new food evidence");
        const oldTab = await context.newPage(); await oldTab.goto(origin + "/shops/trial-shop-f/menus/trial-dish-one");
        await oldTab.getByRole("heading", { name: "架空・きのこの小丼", exact: true }).waitFor();
        await go("/admin/menus/trial-dish-one/edit");
        await page.getByLabel("🧺 原材料名", { exact: true }).fill("保存しない架空の未完成入力");
        await page.getByRole("button", { name: "公開を停止する", exact: true }).click();
        await page.getByText("公開停止を保存しました。編集を続ける前に最新内容を確認してください。", { exact: true }).waitFor();
        assert.equal(await page.getByLabel("🧺 原材料名", { exact: true }).inputValue(), "保存しない架空の未完成入力");
        snapshot = await current(); assert.equal(snapshot.menu.ingredients, policy.recipes.B); assert.equal(snapshot.menu.isPublished, false); assert.equal(snapshot.listRow.foodReviewState, "current");
        assert.equal(await oldTab.getByRole("heading", { name: "架空・きのこの小丼", exact: true }).count(), 1);
        await oldTab.reload(); await oldTab.locator('[data-trial-public="excluded"]').waitFor(); await oldTab.close();
        pass("Real STOP control preserves unsaved inputs/current review; existing tab keeps old content until reload, which excludes it");
        for (const fault of ["conflict", "invalid200", "refresh-pending"]) {
            await reset("A"); await go("/admin/menus/trial-dish-one/edit"); await post("/__trial__/fault", { fault });
            await page.getByLabel("価格（税込・円）", { exact: true }).fill("710");
            await page.getByRole("button", { name: "保存する", exact: true }).click();
            if (fault === "refresh-pending") { await page.getByText(/保存は完了しましたが、公開表示の更新処理が未完了です/).waitFor(); await confirmSaved(true, true); }
            else { await page.locator("#edit-menu-error").waitFor(); assert.equal(await savedStatus.count(), 0); assert.equal(await page.getByLabel("価格（税込・円）", { exact: true }).inputValue(), "710"); }
        }
        pass("Synthetic conflict/invalid-200 retain inputs without success; synthetic post-save refresh pending is a separate notice");
        await reset("unknown"); await go("/admin/menus/trial-dish-one/edit");
        assert.equal(await page.getByRole("button", { name: "公開する", exact: true }).isDisabled(), true); assert.equal((await current()).publicVisible, false);
        await page.getByLabel("注意書き", { exact: true }).focus(); await page.keyboard.press("Shift+Tab");
        assert.equal(await page.evaluate(() => document.activeElement?.id), "edit-menu-field-5");
        assert.equal(await page.evaluate(() => document.activeElement.matches(":focus-visible") && getComputedStyle(document.activeElement).outlineStyle !== "none"), true);
        pass("Unknown state cannot be toggled public through the real edit control; labelled inputs are keyboard reachable");
        await reset("stale");
        for (const width of [320, 390, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            await go("/"); await page.locator("article").waitFor();
            await page.evaluate(async () => { await document.fonts.ready; });
            if (options.has("--icons-root")) {
                assert.equal(await page.evaluate(() => [...document.fonts].some(font => font.family.includes("Material Symbols") && font.status === "loaded")), true);
                const link = page.getByRole("link", { name: "架空・きのこの小丼：保存済み内容を見直す", exact: true });
                assert.equal(await link.evaluate(element => {
                    const box = element.getBoundingClientRect(), text = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
                    if (!text) return false;
                    const range = document.createRange(); range.selectNodeContents(text);
                    return [...range.getClientRects()].every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1);
                }), true, width + "px edit label must stay inside its control");
            }
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, width + "px list overflow");
            await capture("03-list-" + width);
        }
        await go(facilitatorPath("/materials")); await page.getByRole("heading", { name: "B-? / 旧新在庫 / 材料抜け", exact: true }).waitFor();
        assert.match(await page.locator("body").innerText(), /自動照合しません/);
        pass("320/390/1440px list remains within viewport; fictional source/inventory/missing-material cards are available");
        const rejected = await context.request.post(origin + "/__trial__/scenario", { data: { scenario: "B" }, headers: { Origin: "https://example.invalid" } });
        assert.equal(rejected.status(), 403); assert.equal((await current()).scenario, "stale");
        const networkControl = await context.newPage();
        let blocked = false;
        try { await networkControl.goto("https://example.invalid"); } catch { blocked = true; }
        assert.equal(blocked, true); assert.equal(counters.blockedExternalBrowserRequests, 1); await networkControl.close();
        assert.deepEqual(errors, []);
        pass("Foreign-origin mutation is rejected and real component pages produce no browser exceptions");
        writeFileSync(join(output, "trial-check.json"), JSON.stringify({ ...manifest, completedAt: new Date().toISOString(), status: "PASS", playwright: require(join(process.env.PLAYWRIGHT_MODULE_PATH || require.resolve("playwright/package.json").replace(/[\\/]package\.json$/, ""), "package.json")).version, browserVersion: browser.version(), groups, reviewRegressions, screenshots, counters, clarification: "These groups validate only the isolated UI/adapter. They are not the 25 research tests, human comprehension, real store effort or production evidence." }, null, 2) + "\n", "utf8");
        console.log(`PASS: ${groups.length} isolated trial groups. Evidence: ${join(output, "trial-check.json")}`);
    } catch (error) {
        error.message = error.message.replaceAll(facilitatorToken, "[fixture-token]");
        if (error.stack) error.stack = error.stack.replaceAll(facilitatorToken, "[fixture-token]");
        const lastPage = browser?.contexts()[0]?.pages()[0];
        if (lastPage) { try { await lastPage.screenshot({ path: join(output, "failure.png"), fullPage: true }); } catch { /* Preserve the original failure. */ } }
        writeFileSync(join(output, "trial-check.json"), JSON.stringify({ ...manifest, completedAt: new Date().toISOString(), status: "FAIL", groups, reviewRegressions, screenshots, counters, failure: error.message }, null, 2) + "\n", "utf8");
        throw error;
    } finally { await close(); }
}
