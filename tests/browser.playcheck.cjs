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
      const edge=await page.evaluate(()=>{
        const v=window.innerWidth,r=document.querySelector('#board').getBoundingClientRect();
        return {viewport:v,board:r.width,left:r.left,right:v-r.right};
      });
      assert.ok(edge.board>=edge.viewport*.975,'map is not edge-to-edge: '+JSON.stringify(edge));
      assert.ok(edge.left<=6 && edge.right<=6,'side margins too large: '+JSON.stringify(edge));
      const mapView=await page.evaluate(()=>window.__deepWeaveTest.getViewport());
      assert.equal(mapView.columns,9);assert.equal(mapView.rows,11);
      assert.ok(mapView.tileCssPixels>=35,'touch cell too small: '+JSON.stringify(mapView));
      // Legend cards must show exactly the symbols seen on the live board.
      await page.getByRole('button',{name:'絵と記号の図鑑'}).click();
      assert.equal(await page.getByRole('dialog').isVisible(),true);
      assert.equal(await page.locator('.atlas-item').count(),12);
      assert.ok(await page.getByText('水脈',{exact:true}).isVisible());
      await page.screenshot({path:'playcheck-output/'+name+'-atlas.png',fullPage:true});
      await page.getByRole('tab',{name:'敵'}).click();
      assert.equal(await page.locator('.atlas-item').count(),7);
      await page.getByRole('tab',{name:'道具'}).click();
      assert.equal(await page.locator('.atlas-item').count(),8);
      const atlasPaint=await page.locator('.atlas-art').first().evaluate(c=>{
        const data=c.getContext('2d').getImageData(32,32,1,1).data;
        return Array.from(data).slice(0,3).reduce((n,x)=>n+x,0);
      });
      assert.ok(atlasPaint>0,'atlas icon has no drawing');
      await page.getByRole('button',{name:'ゲームに戻る'}).click();
      assert.equal(await page.getByRole('dialog').isVisible(),false);
      const notConsumed=await page.evaluate(()=>window.__deepWeaveTest.getState());
      assert.equal(notConsumed.turn,0,'atlas consumed a turn');
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
      // A short viewport must not shrink the game horizontally.
      await page.setViewportSize({width:390,height:700});
      await page.waitForTimeout(100);
      const short=await page.evaluate(()=>{
        const v=window.innerWidth,r=document.querySelector('#board').getBoundingClientRect();
        return {viewport:v,board:r.width,left:r.left,right:v-r.right,doc:document.documentElement.scrollWidth};
      });
      assert.ok(short.board>=short.viewport*.975,'short mobile viewport shrank horizontally: '+JSON.stringify(short));
      assert.ok(short.left<=6&&short.right<=6,'short viewport side margins: '+JSON.stringify(short));
      assert.ok(short.doc<=short.viewport+1,'short viewport horizontal scroll: '+JSON.stringify(short));
      await page.screenshot({path:'playcheck-output/'+name+'-compact.png',fullPage:true});
      assert.deepEqual(errors,[],'browser errors');
      await context.close();console.log(name+' OK: turn '+after.turn+', hp '+after.hp+', canvas '+layout.canvas);
    }finally{await browser.close();}
  }
}
run().catch(e=>{console.error(e);process.exit(1);});
