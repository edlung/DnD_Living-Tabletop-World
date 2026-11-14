import {chromium} from '/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch();
try {
 for(const [path,width,name,heading] of [
  ['sessions/10.html',1440,'light-desktop','Три моря в одном окне'],
  ['handouts/handout-wave.html',768,'light-card-tablet',null],
  ['sessions/11.html',390,'festival-phone','Новая строка, если вы хотите'],
  ['handouts/handout-wave.html',320,'light-card-narrow',null],
 ]){
  const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();
  await page.goto('http://127.0.0.1:8876/'+path,{waitUntil:'networkidle'});
  await page.locator('html').evaluate(el=>el.style.scrollBehavior='auto');
  if(heading)await page.getByRole('heading',{name:heading,exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));
  await page.screenshot({path:'/tmp/moon-a12-details/'+name+'.png'});await context.close();
 }
} finally {await browser.close();}
