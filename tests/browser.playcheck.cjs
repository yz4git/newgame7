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
      const assertBattleLog=async(label)=>{
        const measured=await page.evaluate(()=>{
          const overlay=document.querySelector('#battleLogOverlay');
          const dock=document.querySelector('#app > .actions');
          const board=document.querySelector('#board');
          const overlayBox=overlay.getBoundingClientRect(),
            dockBox=dock.getBoundingClientRect(),
            boardBox=board.getBoundingClientRect();
          const history=document.querySelector('#historyButton');
          const buttonBox=history.getBoundingClientRect();
          const buttonHit=document.elementFromPoint(
            buttonBox.left+buttonBox.width/2,buttonBox.top+buttonBox.height/2);
          const overlayArea={
            x:boardBox.left+boardBox.width*.25,
            y:Math.max(overlayBox.top,boardBox.top)+Math.min(20,Math.max(0,Math.min(overlayBox.bottom,boardBox.bottom)-Math.max(overlayBox.top,boardBox.top))/2)
          };
          const overlapped=boardBox.bottom>overlayBox.top+14&&boardBox.top<overlayBox.bottom-14;
          const touchTarget=overlapped?document.elementFromPoint(overlayArea.x,overlayArea.y):null;
          return {
            position:getComputedStyle(overlay).position,
            pointerEvents:getComputedStyle(overlay).pointerEvents,
            overlayTop:overlayBox.top,overlayBottom:overlayBox.bottom,
            dockTop:dockBox.top,
            viewportBottom:(window.visualViewport?.offsetTop||0)+(window.visualViewport?.height||window.innerHeight),
            rows:overlay.querySelectorAll('.battle-log-line').length,
            hint:overlay.querySelector('#hint').textContent,
            historyHit:buttonHit===history||history.contains(buttonHit),
            overlapped,touchTargetId:touchTarget?.id||null,
            hasLogText:overlay.querySelector('.battle-log-message')?.textContent.length>0
          };
        });
        assert.equal(measured.position,'fixed',label+' log must be fixed');
        assert.equal(measured.pointerEvents,'none',label+' log layer must be tap-through');
        assert.ok(measured.overlayTop>=0&&measured.overlayBottom<=measured.dockTop+2,
          label+' overlay not above buttons: '+JSON.stringify(measured));
        assert.ok(measured.dockTop<=measured.viewportBottom,
          label+' dock off-screen: '+JSON.stringify(measured));
        assert.ok(measured.rows>=1&&measured.hasLogText,label+' no visible log rows');
        assert.ok(measured.historyHit,label+' log history button untouchable');
        if(measured.overlapped)assert.equal(measured.touchTargetId,'board',
          label+' log must not block touches on map: '+JSON.stringify(measured));
      };
      await assertBattleLog('portrait');

      // Overlay must share the board without stealing touch events; the
      // reduced map may show explored terrain only, never unknown geometry.
      const assertMiniMap=async (caption)=>{
        const m=await page.evaluate(()=>{
          const mini=document.querySelector('#minimapOverlay'),canvas=document.querySelector('#minimapCanvas');
          const frame=document.querySelector('.map-frame'),board=document.querySelector('#board');
          const r=mini.getBoundingClientRect(),f=frame.getBoundingClientRect(),b=board.getBoundingClientRect();
          const spot=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
          const state=window.__deepWeaveTest.getMiniMap(),ctx=canvas.getContext('2d');
          const mul=canvas.width/state.width;
          const alphaAt=(p)=>p?ctx.getImageData(Math.floor((p.x+.5)*5*mul),
            Math.floor((p.y+.5)*5*mul),1,1).data[3]:null;
          const unknownAlpha=alphaAt(state.firstUnknown),playerAlpha=alphaAt(state.player);
          return {
            ...state,width:r.width,height:r.height,
            frameLeft:f.left,frameRight:f.right,frameTop:f.top,
            left:r.left,right:r.right,top:r.top,
            canvasWidth:canvas.width,canvasHeight:canvas.height,
            pointerEvents:getComputedStyle(mini).pointerEvents,
            hit:spot===board||board.contains(spot),
            unknownAlpha,playerAlpha
          };
        });
        assert.equal(m.pointerEvents,'none',caption+' minimap intercepts touches');
        assert.ok(m.hit,caption+' minimap hides game touch targets: '+JSON.stringify(m));
        assert.ok(m.top>=m.frameTop-1&&m.left>=m.frameLeft-1&&m.right<=m.frameRight+1,
          caption+' minimap outside board: '+JSON.stringify(m));
        assert.ok(m.width>=65&&m.width<=110,caption+' minimap wrong size');
        assert.ok(m.explored>0&&m.unknown>0&&m.currentlyVisible>0,
          caption+' player knowledge not represented');
        assert.equal(m.explored+m.unknown,27*29,'minimap omitted map tiles');
        assert.equal(m.unknownAlpha,0,caption+' unexplored location must be fully transparent');
        assert.ok(m.playerAlpha>0,caption+' player marker missing');
        return m;
      };
      const firstMap=await assertMiniMap('portrait');
      const explore=await page.locator('#exploreLabel').innerText();
      assert.match(explore,/探索 1\/\d+部屋/,
        'room exploration counter must be visible: '+explore);
      assert.equal(firstMap.visibleEnemies,await page.evaluate(()=>
        window.__deepWeaveTest.getMiniMap().visibleEnemies));
      const logSurface=await page.evaluate(()=>getComputedStyle(
        document.querySelector('#battleLogOverlay')).backgroundImage);
      assert.ok(logSurface.includes('0.46')&&logSurface.includes('0.29'),
        'log background too opaque: '+logSurface);
      await page.screenshot({path:'playcheck-output/'+name+'-minimap.png',fullPage:true});
      const miniAppearance=await page.evaluate(()=>{
        const m=document.querySelector('#minimapOverlay');
        const style=getComputedStyle(m),rect=m.getBoundingClientRect();
        return {width:rect.width,alpha:style.backgroundColor,
          opacity:Number(style.opacity),interactive:style.pointerEvents};
      });
      assert.ok(miniAppearance.width<110,
        'minimap still covers too much of the battlefield');
      assert.equal(miniAppearance.interactive,'none');

      await page.locator('#historyButton').click();
      assert.equal(await page.getByRole('dialog').isVisible(),true);
      await page.getByRole('button',{name:'冒険に戻る'}).click();
      assert.equal(await page.getByRole('dialog').isVisible(),false);
      assert.equal(await page.evaluate(()=>window.__deepWeaveTest.getState().turn),0,
        'opening log history must not spend a turn');

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
      const overlayRows=await page.locator('#battleLogLines .battle-log-line').allTextContents();
      assert.ok(overlayRows.some(x=>/T[1-9]/.test(x)),
        'action log failed to show new turn: '+JSON.stringify(overlayRows));
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
      await assertBattleLog('short Safari viewport');
      await assertMiniMap('short Safari viewport');
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
      await assertBattleLog('scrolled page');
      await assertMiniMap('scrolled page');
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.waitForTimeout(80);
      await assertDockVisible('scrolled back');
      await assertBattleLog('scrolled back');
      await assertMiniMap('scrolled back');
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
      // Quick skill must never target opponents hidden in fog.
      await page.evaluate(()=>window.__deepWeaveTest.seedRun(2));
      assert.equal((await page.evaluate(()=>window.__deepWeaveTest.getMiniMap())).visibleEnemies,0,
        'hidden monsters must not appear on transparent minimap');
      assert.equal(await page.evaluate(()=>window.__deepWeaveTest.getQuick()),null,
        'quick skill must not detect hidden enemies');
      assert.equal(await page.locator('#skillButton').isDisabled(),true);
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
      const combatText=await page.locator('#battleLogLines').innerText();
      assert.match(combatText,/T1/,'action log turn should match HUD turn');
      assert.match(combatText,/雷連鎖.*マス伝播/,'summary must explain chain size');
      assert.ok(!combatText.includes('T0')||!combatText.includes('雷連鎖'),
        'the cast may not appear under turn zero');
      await page.screenshot({path:'playcheck-output/'+name+'-elemental.png',fullPage:true});
      // Real board taps should navigate through SAFE cells adjacent to known
      // traps, and automatically recalculate when a trap is revealed mid-walk.
      await page.setViewportSize({width:390,height:844});
      const tapDungeonCell=async (x,y)=>{
        await page.locator('#board').scrollIntoViewIfNeeded();
        await page.waitForTimeout(60);
        const where=await page.evaluate(({x,y})=>{
          const rect=document.querySelector('#board').getBoundingClientRect();
          const view=window.__deepWeaveTest.getViewport();
          const px=rect.left+(x-view.cameraX+.5)*rect.width/view.columns;
          const py=rect.top+(y-view.cameraY+.5)*rect.height/view.rows;
          const element=document.elementFromPoint(px,py);
          return {px,py,hitBoard:element?.id==='board'};
        },{x,y});
        assert.ok(where.hitBoard,'board tap blocked by UI overlay: '+JSON.stringify(where));
        await page.mouse.click(where.px,where.py);
      };
      for(const scenario of ['known','discovered']){
        const prepared=await page.evaluate(mode=>
          window.__deepWeaveTest.setupTrapAutoScenario(mode),scenario);
        assert.equal(prepared.trap.known,scenario==='known',
          scenario+' fixture initial discovery state incorrect');
        await tapDungeonCell(14,10);
        await page.waitForFunction(()=>{const s=window.__deepWeaveTest.getAutoState();
          return s.player.x===14&&s.player.y===10&&!s.running;
        },null,{timeout:8000});
        const done=await page.evaluate(()=>window.__deepWeaveTest.getAutoState());
        assert.equal(done.hp,30,scenario+' should not suffer trap damage');
        assert.equal(done.trapUsed,false,scenario+' stepped on known trap');
        assert.equal(done.trapKnown,true,scenario+' did not discover/recognize trap');
        assert.ok(done.turn>=4,scenario+' travel never advanced');
        if(scenario==='discovered')
          assert.ok(done.replans>=1,'newly revealed trap failed to trigger an automatic detour');
        await page.screenshot({path:'playcheck-output/'+name+'-trap-'+scenario+'.png',fullPage:true});
      }

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
