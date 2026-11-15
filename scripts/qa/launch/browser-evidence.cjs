// Observational metadata for source diagnostics. Never used by production.
const os=require('node:os');
async function startEvidence(page){
  return page.evaluate(()=>{
    const e=KZ.engine,gl=e.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    const render=e.renderer.render,frame=e.postfx.render;
    const probe=window.__sourceQAEvidence={renderPasses:0,renderedFrames:0,startFrame:e.frame,
      startedAt:performance.now(),webgl2:gl instanceof WebGL2RenderingContext,
      renderer:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),vendor:ext&&gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
      viewport:[innerWidth,innerHeight,devicePixelRatio],canvas:[e.canvas.width,e.canvas.height],settings:{...KZ.settings.values}};
    e.renderer.render=function(...args){const result=render.apply(this,args);probe.renderPasses++;return result};
    e.postfx.render=function(...args){const result=frame.apply(this,args);probe.renderedFrames++;return result};
    return {...probe};
  });
}
async function finishEvidence(page,browser){
  const result=await page.evaluate(()=>{
    const e=KZ.engine;e.renderer.getContext().finish();
    return {...window.__sourceQAEvidence,endFrame:e.frame,endedAt:performance.now(),
      finalCanvas:[e.canvas.width,e.canvas.height],finalSettings:{...KZ.settings.values}};
  });
  return {...result,browser:browser.version(),host:os.hostname(),platform:process.platform};
}
module.exports={startEvidence,finishEvidence};
