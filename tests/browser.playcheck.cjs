'use strict';
const {chromium,webkit,devices}=require('playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
async function run(){
  fs.mkdirSync('playcheck-output',{recursive:true});
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});
    try{
      const context=await browser.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},deviceScaleFactor:3});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      await page.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle'});
      assert.match(await page.title(),/DEEP WEAVE/);
      await page.getByRole('button',{name:'探索を始める'}).click();
      await page.locator('#board').waitFor();
      const before=await page.evaluate(()=>window.__deepWeaveTest.getState());
      assert.equal(before.turn,0);
      const box=await page.locator('#board').boundingBox();assert.ok(box&&box.width>200);
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2,{steps:6});await page.mouse.up();
      await page.getByRole('button',{name:/道具を使う/}).click();
      assert.equal(await page.locator('#sheet').isVisible(),true);
      await page.locator('#closeSheet').click();
      await page.getByRole('button',{name:/1ターン待つ/}).click();
      const after=await page.evaluate(()=>window.__deepWeaveTest.getState());
      assert.ok(after.turn>=1);
      const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:window.innerWidth,canvas:document.querySelector('#board').width}));
      assert.ok(layout.width<=layout.viewport+1,'horizontal overflow '+JSON.stringify(layout));
      assert.ok(layout.canvas>0);
      await page.screenshot({path:'playcheck-output/'+name+'-iphone.png',fullPage:true});
      assert.deepEqual(errors,[],'browser errors');
      await context.close();console.log(name+' OK: turn '+after.turn+', hp '+after.hp+', canvas '+layout.canvas);
    }finally{await browser.close();}
  }
}
run().catch(e=>{console.error(e);process.exit(1);});
