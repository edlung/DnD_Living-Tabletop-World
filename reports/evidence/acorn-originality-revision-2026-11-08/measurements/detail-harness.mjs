import {chromium} from '/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch();
const cases=[
 ['guide.html',1440,'guide-top',null],
 ['sessions/06.html',768,'experiment','Лента, корень и неверная подпись'],
 ['sessions/11.html',390,'ending','Он сворачивает не к ленточке'],
 ['handouts/handout-correction.html',320,'early-letter',null],
 ['handouts/handout-futures.html',1440,'walking-card',null],
];
for(const [path,width,name,heading] of cases){
 const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();
 await page.goto('http://127.0.0.1:8877/'+path,{waitUntil:'networkidle'});
 if(heading)await page.getByRole('heading',{name:heading,exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/acorn-revision-details/'+name+'.png'});await context.close();
}
const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();await page.goto('http://127.0.0.1:8877/tokens.html',{waitUntil:'networkidle'});await page.emulateMedia({media:'print'});await page.screenshot({path:'/tmp/acorn-revision-details/tokens-print.png',fullPage:true});await context.close();await browser.close();
