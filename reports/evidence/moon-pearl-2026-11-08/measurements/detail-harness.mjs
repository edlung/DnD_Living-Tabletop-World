import {chromium} from '/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/node_modules/@playwright/test/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch();const checks=[];
for (const [path,width,name,selector,print] of [
 ['guide.html',1440,'guide',null,false],
 ['sessions/05.html',768,'theatre','.scene',false],
 ['maps.html',390,'maps','.map',false],
 ['handouts/handout-playbill.html',320,'record-card',null,false],
 ['tokens.html',1440,'tokens-print',null,true],
]) {
 const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();
 await page.goto('http://127.0.0.1:8876/'+path,{waitUntil:'networkidle'});
 if(print)await page.emulateMedia({media:'print'});
 if(selector && await page.locator(selector).count())await page.locator(selector).first().scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/moon-details/'+name+'.png',fullPage:print || path.endsWith('.svg')});
 if(path==='guide.html'){await page.keyboard.press('Tab');checks.push({path,focus:await page.locator(':focus').evaluate(el=>({tag:el.tagName,text:el.textContent,outline:getComputedStyle(el).outline,visible:el.getBoundingClientRect().top>=0}))});}
 await context.close();
}
await writeFile('/tmp/moon-details/keyboard.json',JSON.stringify(checks,null,2));await browser.close();
