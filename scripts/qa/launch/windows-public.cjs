const fs=require('node:fs'),path=require('node:path');
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const {chromium}=require(config.playwright);
(async()=>{
  const browser=await chromium.launch({executablePath:config.chrome,headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
  const report={at:new Date().toISOString(),browser:browser.version(),method:'actual browser DOM and screenshots; no login/publication',pages:[]};
  try{
    for(const target of [
      {id:'itch-listing',url:'https://hacktivatenation.itch.io/knotzaxxon'},
      {id:'itch-html5-spec',url:'https://itch.io/docs/creators/html5'},
      {id:'itch-image-spec',url:'https://itch.io/docs/creators/getting-started'},
      {id:'pages-entry',url:'https://knotenvy.github.io/KnotzAxxon/'},
    ]){
      const context=await browser.newContext({viewport:{width:1366,height:900}});
      await context.addInitScript(()=>localStorage.setItem('knotzaxxon.settings.v2',JSON.stringify({quality:'low',camera:'classic',shake:0})));
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        const response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:60000});
        if(target.id==='pages-entry')await page.locator('#screen-title.is-active').waitFor({timeout:120000});
        const dom=await page.evaluate(()=>({url:location.href,title:document.title,text:document.body.innerText,
          iframes:[...document.querySelectorAll('iframe')].map(x=>({src:x.src,allow:x.allow,sandbox:x.getAttribute('sandbox')})),
          links:[...document.querySelectorAll('a[href]')].map(x=>({text:x.textContent.trim(),href:x.href})),
          images:[...document.images].map(x=>({src:x.currentSrc||x.src,width:x.naturalWidth,height:x.naturalHeight,alt:x.alt})),
          debugAPI:!!window.KZ,
          hardware:(()=>{const c=document.getElementById('viewport'),g=c?.getContext('webgl2'),e=g?.getExtension('WEBGL_debug_renderer_info');return e?{renderer:g.getParameter(e.UNMASKED_RENDERER_WEBGL),vendor:g.getParameter(e.UNMASKED_VENDOR_WEBGL),canvas:{width:c.width,height:c.height}}:null})()}));
        fs.writeFileSync(path.join(config.out,target.id+'.json'),JSON.stringify(dom,null,2)+'\n');
        fs.writeFileSync(path.join(config.out,target.id+'.html'),await page.content());
        await page.screenshot({path:path.join(config.out,target.id+'.png'),fullPage:target.id==='itch-listing',timeout:120000});
        report.pages.push({id:target.id,url:target.url,status:response?.status(),title:dom.title,iframeCount:dom.iframes.length,hardware:dom.hardware,errors});
      }catch(e){report.pages.push({id:target.id,url:target.url,failure:e.stack,errors});process.exitCode=1;}
      await context.close();
    }
  }finally{await browser.close();fs.writeFileSync(path.join(config.out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
