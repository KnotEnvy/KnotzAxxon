// Production-only observational probe. Does not expose or use the development API.
const os=require('node:os');
async function installProductionEvidence(context){
  await context.addInitScript(()=>{
    const state=new WeakMap();
    const probe=window.__productionQAEvidence={engineCallbacks:0,drawCalls:0,presentationDraws:0};
    const raf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>raf(time=>{
      if(callback.name==='bound _loop')probe.engineCallbacks++;
      callback(time);
    });
    const proto=WebGL2RenderingContext.prototype,bind=proto.bindFramebuffer;
    proto.bindFramebuffer=function(target,buffer){
      const result=bind.call(this,target,buffer);
      if(target===this.FRAMEBUFFER||target===this.DRAW_FRAMEBUFFER)state.set(this,buffer);
      return result;
    };
    for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
      const original=proto[name];
      proto[name]=function(...args){
        const result=original.apply(this,args);
        if(this.canvas.id==='viewport'){
          probe.drawCalls++;
          // The shipped composer ends with one composite draw to the canvas.
          if(!state.get(this))probe.presentationDraws++;
        }
        return result;
      };
    }
  });
}
async function productionEvidence(page,browser){
  const rendering=await page.evaluate(()=>{
    const canvas=document.getElementById('viewport'),gl=canvas.getContext('webgl2');
    gl.finish();
    const ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {...window.__productionQAEvidence,webgl2:gl instanceof WebGL2RenderingContext,
      renderer:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),vendor:ext&&gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
      userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight,devicePixelRatio],canvas:[canvas.width,canvas.height],
      configuredSettings:JSON.parse(localStorage.getItem('knotzaxxon.settings.v2')),
      countingLaw:'Successful viewport-context draws; presentationDraws target the default framebuffer (one final composer draw per frame).'};
  });
  return {...rendering,browser:browser.version(),host:os.hostname(),platform:process.platform};
}
module.exports={installProductionEvidence,productionEvidence};
