import {chromium} from '/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/node_modules/@playwright/test/index.mjs';
import AxeBuilder from '/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/node_modules/@axe-core/playwright/dist/index.mjs';
import {auditPage,auditTitles} from '/Users/oleksandr/.agents/skills/ui-layout-audit/audit.mjs';
import {mkdir,writeFile,readdir} from 'node:fs/promises';
const root='/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/campaigns/acorn-express';
const out=process.env.LTW_BOOK_AUDIT_OUT || '/tmp/acorn-revision-audit';await mkdir(out,{recursive:true});
const paths=(await readdir(root,{recursive:true})).filter(p=>p.endsWith('.html') && (!process.env.LTW_BOOK_AUDIT_PATHS || process.env.LTW_BOOK_AUDIT_PATHS.split(',').includes(p))).sort();
const browser=await chromium.launch();const reports=[],titles={};
for(const path of paths){
 for(const width of [1440,768,390,320]){
  const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();
  await page.goto('http://127.0.0.1:8877/'+path,{waitUntil:'networkidle'});
  await page.evaluate(async()=>{document.querySelectorAll('details').forEach(el=>el.open=true);await Promise.all([...document.images].map(async img=>{img.loading='eager';try{await img.decode()}catch{}}));});
  const findings=await auditPage(page);const axe=(await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));
  titles[path]=await page.title();
  await page.screenshot({path:`${out}/${path.replaceAll('/','-')}-${width}.png`,fullPage:true});
  reports.push({path,width,findings,axe});
  console.log(path,width,JSON.stringify({findings:findings.filter(f=>f.level!=='info'),axe}));
  await context.close();
 }
}
reports.push({titles:auditTitles(titles)});await writeFile(out+'/results.json',JSON.stringify(reports,null,2));await browser.close();
