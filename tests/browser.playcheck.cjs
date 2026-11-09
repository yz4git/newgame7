'use strict';
const {chromium,webkit,devices}=require('playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
async function run(){
  fs.mkdirSync('playcheck-output',{recursive:true});
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});
    try{
      const context=await browser.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},deviceScaleFactor:3});
      const page=await context.newPage(),errors=[],versionRequests=[];
      page.on('pageerror',e=>errors.push(String(e)));
      page.on('request',request=>{
        if(new URL(request.url()).pathname.endsWith('/version.json'))versionRequests.push(request.url());
      });
      await page.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle'});
      const boot=await page.evaluate(()=>window.__deepWeaveBoot);
      assert.equal(boot.checked,true,'boot check did not run');
      assert.equal(boot.ready,true,'game scripts did not load');
      assert.equal(boot.servedVersion,'__DW_BUILD__','local release fallback mismatch');
      assert.equal(boot.redirected,false);
      assert.equal(versionRequests.length,1,'version should be fetched exactly once on startup');
      const assetUrls=await page.evaluate(()=>Array.from(document.scripts).map(x=>x.src).filter(Boolean));
      assert.ok(assetUrls.some(url=>url.includes('engine.js?v=__DW_BUILD__')));
      assert.ok(assetUrls.some(url=>url.includes('game.js?v=__DW_BUILD__')));
      assert.match(await page.title(),/DEEP WEAVE/);
      await page.getByRole('button',{name:'探索を始める'}).click();
      await page.locator('#board').waitFor();
      // Verify that the three primary actions never fall under browser chrome.
      const assertDockVisible = async (caption) => {
        const measurements=await page.evaluate(()=>{
          const vv=window.visualViewport;
          const visibleBottom=vv ? vv.offsetTop+vv.height : window.innerHeight;
          const dock=document.querySelector('#app > .actions');
          const buttons=[...dock.querySelectorAll('.action')];
          const r=dock.getBoundingClientRect();
          return {
            position:getComputedStyle(dock).position,
            visualBottom:visibleBottom,
            dockBottom:r.bottom,
            dockTop:r.top,
            touchable:buttons.map(btn=>{
              const rect=btn.getBoundingClientRect();
              const pointX=rect.left+rect.width/2,pointY=rect.top+rect.height/2;
              const top=document.elementFromPoint(pointX,pointY);
              return {height:rect.height,bottom:rect.bottom,
                hit:top===btn||btn.contains(top)};
            })
          };
        });
        assert.equal(measurements.position,'fixed',caption+' dock is not fixed');
        assert.ok(measurements.dockBottom<=measurements.visualBottom+2,
          caption+' dock below visible viewport: '+JSON.stringify(measurements));
        assert.ok(measurements.touchable.every(b=>b.hit&&b.height>=44&&b.bottom<=measurements.visualBottom+1),
          caption+' bottom buttons not accessible: '+JSON.stringify(measurements));
      };
      await assertDockVisible('iPhone portrait');
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
      await page.getByText('周囲2マスで発見',{exact:false}).waitFor();
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
      await page.locator('#historyButton').click();
      await page.getByRole('dialog').getByText('冒険の記録').waitFor();
      await page.getByRole('button',{name:'冒険に戻る'}).click();
      const after=await page.evaluate(()=>window.__deepWeaveTest.getState());
      assert.ok(after.turn>=1);
      const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:window.innerWidth,canvas:document.querySelector('#board').width}));
      assert.ok(layout.width<=layout.viewport+1,'horizontal overflow '+JSON.stringify(layout));
      assert.ok(layout.canvas>0);
      await page.screenshot({path:'playcheck-output/'+name+'-iphone.png',fullPage:true});
      // A short viewport must not shrink the game horizontally.
      await page.setViewportSize({width:390,height:700});
      await page.waitForTimeout(100);
      await assertDockVisible('short Safari viewport');
      const short=await page.evaluate(()=>{
        const v=window.innerWidth,r=document.querySelector('#board').getBoundingClientRect();
        return {viewport:v,board:r.width,left:r.left,right:v-r.right,doc:document.documentElement.scrollWidth};
      });
      assert.ok(short.board>=short.viewport*.975,'short mobile viewport shrank horizontally: '+JSON.stringify(short));
      assert.ok(short.left<=6&&short.right<=6,'short viewport side margins: '+JSON.stringify(short));
      assert.ok(short.doc<=short.viewport+1,'short viewport horizontal scroll: '+JSON.stringify(short));
      await page.screenshot({path:'playcheck-output/'+name+'-compact.png',fullPage:true});
      // The dock must remain operable even after scrolling the dungeon.
      await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
      await page.waitForTimeout(80);
      await assertDockVisible('scrolled page');
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.waitForTimeout(80);
      await assertDockVisible('scrolled back');
      assert.equal(versionRequests.length,1,'version polling happened during play');
      // Simulate the release endpoint advancing while the app is open.
      // The game must NEVER reload or interrupt the existing run.
      await page.route('**/version.json?*', route=>route.fulfill({
        status:200,contentType:'application/json',body:JSON.stringify({version:'simulated-upgrade'})
      }));
      await page.getByRole('button',{name:/1ターン待つ/}).click();
      await page.waitForTimeout(250);
      assert.equal(versionRequests.length,1,'release check should only happen at boot');
      assert.equal(await page.evaluate(()=>window.__deepWeaveTest.getState().turn),after.turn+1);
      // Elemental quick-skill is a single visible touch button and consumes
      // exactly one action and one inventory item. The actual propagated
      // engine wave must also be visible on the Canvas.
      await page.evaluate(()=>window.__deepWeaveTest.seedRun(998));
      const recommended=await page.evaluate(()=>window.__deepWeaveTest.getQuick());
      assert.ok(recommended&&recommended.index>=0,'no elemental technique recommended');
      const skillButton=page.locator('#skillButton');
      assert.equal(await skillButton.isEnabled(),true);
      assert.match(await skillButton.getAttribute('aria-label'),/属性技を発動/);
      const original=await page.evaluate(()=>window.__deepWeaveTest.getState());
      await skillButton.click();
      await page.waitForFunction(()=>window.__deepWeaveTest.getState().turn===1);
      await page.waitForFunction(()=>window.__deepWeaveTest.getVfx().active>0);
      const elemental=await page.evaluate(()=>({
        state:window.__deepWeaveTest.getState(),
        visual:window.__deepWeaveTest.getVfx()
      }));
      assert.equal(elemental.state.turn,original.turn+1);
      assert.equal(elemental.state.inventory,original.inventory-1);
      assert.ok(elemental.visual.latest>0&&elemental.visual.active>0,
        'no animated elemental propagation: '+JSON.stringify(elemental));
      await page.screenshot({path:'playcheck-output/'+name+'-elemental.png',fullPage:true});
      assert.deepEqual(errors,[],'browser errors');
      // Different release only at a new launch: stale shell redirects once
      // and then loads the versioned assets, without an infinite loop.
      const second=await context.newPage();
      const navigations=[];
      second.on('framenavigated',frame=>{if(frame===second.mainFrame())navigations.push(frame.url());});
      await second.route('**/version.json?*',route=>route.fulfill({
        status:200,contentType:'application/json',body:JSON.stringify({version:'new-build-001'})
      }));
      await second.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle'});
      await second.waitForFunction(()=>window.__deepWeaveBoot?.ready===true);
      assert.ok(new URL(second.url()).searchParams.get('dwv')==='new-build-001',
        'startup must bypass stale HTML using versioned document URL');
      assert.ok(navigations.length<=2,'reload loop detected: '+JSON.stringify(navigations));
      const latest=await second.evaluate(()=>window.__deepWeaveBoot);
      assert.equal(latest.servedVersion,'new-build-001');
      assert.equal(latest.ready,true);
      await second.close();
      await context.close();console.log(name+' OK: boot-only check, update redirect, no game interruptions, turn '+after.turn+', canvas '+layout.canvas);
    }finally{await browser.close();}
  }
}
run().catch(e=>{console.error(e);process.exit(1);});
