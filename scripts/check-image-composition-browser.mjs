// Isolated real component fixture: no Clerk, DB, upload, or app route changes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const ts = require("typescript");
const { webpack } = require("next/dist/compiled/webpack/webpack");
const sharp = require("sharp");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const fixture = mkdtempSync(join(tmpdir(), "clearallergy-composition-"));
const output = process.env.CLEARALLERGY_BROWSER_OUTPUT || fixture;
mkdirSync(output, { recursive: true });
function compile(source, fileName) {
    return ts.transpileModule(source, { fileName, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
}
writeFileSync(join(fixture, "Editor.js"), compile(readFileSync(join(root, "features/admin/menus/components/ImageCompositionEditor.tsx"), "utf8"), "Editor.tsx"), "utf8");
writeFileSync(join(fixture, "geometry.js"), compile(readFileSync(join(root, "lib/utils/menu-image-display.ts"), "utf8"), "geometry.ts"), "utf8");
const entry = [
    "import React from 'react'; import {createRoot} from 'react-dom/client'; import Editor from './Editor.js';",
    "const image = URL.createObjectURL(new Blob(['<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"400\"><rect width=\"800\" height=\"400\" fill=\"white\"/><text x=\"40\" y=\"180\" font-size=\"36\">LEFT</text><text x=\"650\" y=\"180\" font-size=\"36\">RIGHT</text><rect x=\"376\" y=\"176\" width=\"48\" height=\"48\" fill=\"#ef2020\"/></svg>'], {type:'image/svg+xml'}));",
    "function App(){ const [v,setV]=React.useState({imageFrame:'wide',imageFit:'contain',imagePosition:'center',imageZoom:100,imagePositionX:50,imagePositionY:50}); const [subject,setSubject]=React.useState('shop'); const change=n=>setV(p=>({...p,...n})); return <><h1>画像ドラッグ回帰用の架空プレビュー</h1><div><label>テスト対象<select aria-label='テスト対象' value={subject} onChange={e=>setSubject(e.target.value)}><option>shop</option><option>menu</option></select></label><label>テストfit<select aria-label='テストfit' value={v.imageFit} onChange={e=>change({imageFit:e.target.value})}><option>contain</option><option>cover</option></select></label><label>テストzoom<input aria-label='テストzoom' type='number' value={v.imageZoom} onChange={e=>change({imageZoom:Number(e.target.value)})}/></label><button onClick={()=>change({imagePositionX:50,imagePositionY:50})}>テスト中央</button></div><output id='values'>{JSON.stringify(v)}</output><div style={{width:600,maxWidth:'100%'}}><Editor imageSrc={image} imageAlt='架空の左右と赤い目印' subjectName='ドラッグ方向の検証' subjectKind={subject} values={v} onChange={change}/></div></>}; createRoot(document.getElementById('root')).render(<App/>);",
].join("\n");
writeFileSync(join(fixture, "entry.js"), compile(entry, "entry.tsx"), "utf8");
const compiler = webpack({ mode: "production", target: "web", entry: join(fixture, "entry.js"),
    output: { path: fixture, filename: "bundle.js" }, optimization: { minimize: false },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({NODE_ENV:"production"}) })],
    resolve: { modules: [join(root, "node_modules")], alias: { "@/lib/utils/menu-image-display": join(fixture, "geometry.js") } },
});
await new Promise((resolveBuild, reject) => compiler.run((error, stats) => compiler.close(closeError => {
    if (error || closeError || stats?.hasErrors()) reject(error || closeError || new Error(stats.toString({all:false,errors:true})));
    else resolveBuild();
})));
const chunks = join(root, ".next/static/chunks");
const css = readdirSync(chunks).filter(name => name.endsWith(".css")).map(name => readFileSync(join(chunks, name), "utf8")).join("\n");
const assets = new Map([
    ["/", ["text/html", '<!doctype html><html lang="ja"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body style="padding:20px"><div id="root"></div><script src="/bundle.js"></script></body></html>']],
    ["/style.css", ["text/css", css]], ["/bundle.js", ["text/javascript", readFileSync(join(fixture, "bundle.js"))]],
]);
const server = createServer((request, response) => {
    const asset = assets.get(request.url);
    response.writeHead(asset ? 200 : 404, { "Content-Type": asset?.[0] || "text/plain" });
    response.end(asset?.[1] || "Not found");
});
let browser;
let groups = 0;
const pass = message => {groups++; console.log(`PASS: ${message}`);};
try {
    await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({headless:true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
    const context = await browser.newContext({viewport:{width:1024,height:1000},hasTouch:true});
    await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => { errors.push(error.message); console.error(`Fixture exception: ${error.message}`); });
    await page.goto(base);
    const image = page.getByAltText("架空の左右と赤い目印", {exact:true});
    await image.waitFor();
    await page.waitForFunction(() => document.querySelector('img')?.naturalWidth === 800);
    const frame = image.locator("..");
    async function values() {return JSON.parse(await page.locator("#values").innerText());}
    async function marker() {
        const {data, info} = await sharp(await frame.screenshot()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        let xTotal=0, yTotal=0, count=0;
        for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
            const offset=(y*info.width+x)*info.channels;
            if(data[offset]>200 && data[offset+1]<80 && data[offset+2]<80) {xTotal+=x;yTotal+=y;count++;}
        }
        assert.ok(count>0, "Red marker remains visible");
        return {x:xTotal/count,y:yTotal/count};
    }
    async function drag(dx,dy) {
        const box=await frame.boundingBox();
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
        await page.mouse.down();
        await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:5});
        await page.mouse.up();
    }
    async function setup(subject,fit,zoom) {
        await page.getByLabel("テスト対象",{exact:true}).selectOption(subject);
        await page.getByLabel("テストfit",{exact:true}).selectOption(fit);
        await page.getByLabel("テストzoom",{exact:true}).fill(String(zoom));
        await page.getByRole("button",{name:"テスト中央",exact:true}).click();
        const details=page.getByRole("button",{name:/詳細調整/});
        if(await details.getAttribute("aria-expanded")!=="true") await details.click();
        await page.getByRole("button",{name:subject==="menu"?"正方形":"横長",exact:true}).click();
    }
    for (const subject of ["shop","menu"]) for(const fit of ["contain","cover"]) for(const zoom of [50,100,150,250]) {
        await setup(subject,fit,zoom);
        for (const [dx,dy,axis] of [[20,0,"x"],[0,20,"y"],[-20,0,"x"],[0,-20,"y"]]) {
            const start=await marker(); await drag(dx,dy); const end=await marker();
            const movement=end[axis]-start[axis];
            const direction=Math.sign(dx || dy);
            assert.ok(movement*direction>=-1, `${subject} ${fit} ${zoom}% must not move backward on ${axis}: ${movement}`);
            // Only a perfectly fitted axis can remain stationary.
            const v=await values(); const box=await frame.boundingBox();
            const scale=(fit==="contain"?Math.min:Math.max)(box.width/800,box.height/400)*zoom/100;
            const travel=(axis==="x"?box.width-800*scale:box.height-400*scale);
            if(Math.abs(travel)>1) assert.ok(Math.abs(movement-direction*20)<Math.abs(travel)/200+2, `Marker follows pointer distance: ${movement}`);
            assert.ok(v.imagePositionX>=0 && v.imagePositionX<=100 && v.imagePositionY>=0 && v.imagePositionY<=100);
            await page.getByRole("button",{name:"テスト中央",exact:true}).click();
        }
        pass(`${subject} ${fit} ${zoom}%: actual image pixels follow pointer on both axes`);
    }
    await setup("shop","contain",100);
    await page.screenshot({path:join(output,"composition-before.png"),fullPage:true});
    await frame.screenshot({path:join(output,"composition-frame-before.png")});
    await drag(0,25);
    await page.screenshot({path:join(output,"composition-after.png"),fullPage:true});
    await frame.screenshot({path:join(output,"composition-frame-after.png")});
    await page.getByRole("button",{name:"詳細ページ",exact:true}).click();
    const before=await marker(); await drag(0,15); const after=await marker();
    assert.ok(after.y>before.y, "Detail preview also follows pointer");
    pass("Detail preview and saved position range");
    await page.getByRole("button",{name:"元画像と比較",exact:true}).click();
    assert.equal(await frame.getByText("元画像を表示中",{exact:true}).count(),1);
    const originalValues=await values(); await drag(20,20);
    await frame.dblclick();
    await frame.hover(); await page.mouse.wheel(0,-100);
    assert.deepEqual(await values(),originalValues);
    pass("Original comparison does not modify hidden composition");
    await page.getByRole("button",{name:"元画像と比較",exact:true}).click();
    await setup("shop","cover",250);
    await drag(1000,1000);
    const bounded=await values();
    assert.equal(bounded.imagePositionX,0); assert.equal(bounded.imagePositionY,0);
    pass("Large drag stays at existing position bounds");
    await setup("shop","cover",150);
    await page.getByRole("slider",{name:/横位置/}).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal((await values()).imagePositionX,51);
    await frame.dblclick();
    assert.equal((await values()).imagePositionX,50);
    await frame.hover(); await page.mouse.wheel(0,-100);
    await page.waitForFunction(()=>JSON.parse(document.querySelector('#values').textContent).imageZoom===155);
    pass("Keyboard position, deliberate double click reset and wheel zoom remain available");

    await page.setViewportSize({width:390,height:1100});
    const cdp=await context.newCDPSession(page);
    async function touchDrag(dx,dy) {
        await frame.scrollIntoViewIfNeeded();
        const box=await frame.boundingBox();
        const x=box.x+box.width/2,y=box.y+box.height/2;
        const previous=JSON.stringify(await values());
        await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:1}]});
        await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x+dx,y:y+dy,id:1}]});
        await page.waitForFunction(previous=>document.querySelector('#values').textContent!==previous,previous);
        await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    }
    for(const fit of ["contain","cover"]) {
        await setup("shop",fit,150);
        const start=await marker(); await touchDrag(8,8); const end=await marker();
        assert.ok(end.x>start.x && end.y>start.y, `Touch image follows finger: ${JSON.stringify({fit,start,end,values:await values()})}`);
        pass(`390px ${fit}: native touch drag follows finger`);
    }
    await setup("shop","contain",100);
    await frame.scrollIntoViewIfNeeded();
    const pinchBox=await frame.boundingBox();
    await cdp.send("Input.synthesizePinchGesture",{x:pinchBox.x+pinchBox.width/2,y:pinchBox.y+pinchBox.height/2,scaleFactor:1.5,gestureSourceType:"touch"});
    await page.waitForFunction(()=>JSON.parse(document.querySelector('#values').textContent).imageZoom>100);
    const pinchStart=await marker(); await touchDrag(0,5); const pinchEnd=await marker();
    assert.ok(pinchEnd.y>pinchStart.y, "Drag geometry refreshes after pinch");
    await page.screenshot({path:join(output,"composition-touch-mobile.png"),fullPage:true});
    // Keep one finger down when ending the pinch; this rebases drag geometry.
    await setup("shop","cover",100);
    await frame.scrollIntoViewIfNeeded();
    const box=await frame.boundingBox();
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x-45,y,id:1},{x:x+45,y,id:2}]});
    await page.waitForFunction(()=>JSON.parse(document.querySelector('#values').textContent).imageZoom===150);
    await frame.evaluate(el=>{
        el.dataset.fingerReleased="false";
        el.addEventListener("pointerup",()=>{el.dataset.fingerReleased="true";},{once:true});
    });
    // Use the released finger's id and verify Chromium emitted its pointerup.
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[{x:x+45,y,id:2}]});
    await page.waitForFunction(()=>document.querySelector('img').parentElement.dataset.fingerReleased==="true");
    const remainingStart=await marker();
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x-35,y:y+10,id:1}]});
    await page.waitForFunction(()=>JSON.parse(document.querySelector('#values').textContent).imagePositionX<50);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    const remainingEnd=await marker();
    assert.ok(remainingEnd.x>remainingStart.x && remainingEnd.y>remainingStart.y,"Remaining finger continues dragging in its direction");
    pass("Pinch to one remaining finger refreshes drag geometry");
    await cdp.detach();
    pass("Pinch zoom followed by one-finger drag keeps direction");
    assert.deepEqual(errors,[]);
    console.log(`Completed: ${groups} image composition groups passed. Component fixture only; real admin save is not tested.`);
} finally {
    if(browser) await browser.close();
    await new Promise(resolveClose=>server.close(resolveClose));
}
