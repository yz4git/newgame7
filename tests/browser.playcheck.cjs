/* Browser game-play audit. Runs the actual HTML/CSS/JS in Chromium / WebKit.
   Script executes a full 20-note set with UI pointer events on the actual button DOM. */
const { chromium,webkit }=require("playwright");
const fs=require("node:fs");
const assert=require("node:assert/strict");
const path=require("node:path");
fs.mkdirSync("playcheck-output",{recursive:true});
const variants=[
  {name:"chrome_iphone",engine:chromium,width:390,height:844},
  {name:"webkit_iphone",engine:webkit,width:390,height:844},
  {name:"webkit_compact",engine:webkit,width:375,height:667}
];
const results=[];
async function runVariant(v){
  const browser=await v.engine.launch({headless:true});
  const context=await browser.newContext({
    viewport:{width:v.width,height:v.height},screen:{width:v.width,height:v.height},
    isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:"ja-JP",
    reducedMotion:"no-preference",
    permissions:[]
  });
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push("JS: "+e.message));
  page.on("console",m=>{if(m.type()==="error")errors.push("Console: "+m.text());});
  page.on("requestfailed",r=>errors.push("Request: "+r.url()+" "+r.failure()?.errorText));
  const url=process.env.PLAYCHECK_URL||"http://127.0.0.1:8765/";
  const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
  assert.equal(response.status(),200,"page returns OK");
  await page.waitForSelector("#titleOverlay.visible");
  await page.screenshot({path:"playcheck-output/"+v.name+"-title.png"});
  const layout=await page.evaluate(()=>{
    const ids=["app","stage","noteHighway","choices","control-panel","topbar","score-panel"];
    const info={screen:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]};
    for(const id of ids){
      const e=document.getElementById(id)||document.querySelector("."+id);
      if(e){const r=e.getBoundingClientRect();info[id]={x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};}
    }
    return info;
  });
  assert.ok(layout.app.height<=v.height+2,"app fits viewport height");
  assert.ok(layout.scroll[0]<=v.width+2,"no unwanted horizontal overflow");
  assert.ok(layout.stage.height>=125,"stage video is visible at "+v.height);
  await page.locator("#startBtn").click();
  await page.waitForSelector(".note-token");
  await page.screenshot({path:"playcheck-output/"+v.name+"-game.png"});
  const padRects=await page.locator("#choices .choice-btn").evaluateAll(nodes=>nodes.map(n=>{
    const r=n.getBoundingClientRect();return {width:r.width,height:r.height,bottom:r.bottom};
  }));
  assert.equal(padRects.length,3);
  assert.ok(padRects.every(r=>r.width>85&&r.height>=55&&r.bottom<=v.height),"buttons fit and are large enough");
  const play=await page.evaluate(async ()=>{
    const styles=["cute","cool","surprise"];
    const route=["cute","cool","surprise","cute","cool"];
    const BPM=118,STEP=60000/BPM,FIRST=820;
    const report=[];
    function waitForScene(nextId){
      return new Promise((resolve,reject)=>{
        const title=document.getElementById("sceneTitle");
        if(title.textContent===nextId.text){resolve(performance.now());return;}
        const ob=new MutationObserver(()=>{
          if(title.textContent===nextId.text){ob.disconnect();clearTimeout(timeout);resolve(performance.now());}
        });
        ob.observe(title,{characterData:true,childList:true,subtree:true});
        const timeout=setTimeout(()=>{ob.disconnect();reject(Error("scene transition timeout: "+nextId.text))},7000);
      });
    }
    const nodes=window.KAWAII_GRAPH.shots;
    const core=window.KAWAII_RHYTHM;
    let id="opening";
    for(let round=0;round<5;round++){
      const node=nodes[id];
      const chart=core.chart(node,window.KAWAII_GRAPH.moods[round].style,window.KAWAII_GRAPH.rivalStyles[round],round);
      const sceneStart=Number(document.getElementById("stage").dataset.startedAt);
      const beats=[];
      for(let i=0;i<4;i++){
        const style=chart[i].style||route[round];
        const ms=chart[i].at-(performance.now()-sceneStart);
        if(ms>0)await new Promise(resolve=>setTimeout(resolve,ms));
        const button=document.querySelector(".choice-btn[data-style='"+style+"']");
        if(!button)throw Error("missing note pad for "+style);
        button.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,pointerType:"touch",isPrimary:true,pointerId:17,buttons:1}));
        const text=document.querySelector("#noteFeedback").textContent;
        beats.push({expected:style,ms:Math.round(performance.now()-sceneStart),judgment:text});
      }
      const next=node.choices.find(c=>c.style===route[round]).next;
      await waitForScene({text:nodes[next].title});
      id=next;
      report.push({round:round+1,shots:node.id+" → "+next,beats,
        hero:document.getElementById("heroFans").textContent,
        rival:document.getElementById("rivalFans").textContent,
        combo:document.getElementById("chainText").textContent});
    }
    const last=nodes[id];
    await new Promise(resolve=>setTimeout(resolve,last.duration+100));
    const ending=document.querySelector("#sceneTitle").textContent;
    const endingShot=nodes.win.title===ending?nodes.win:nodes.tie.title===ending?nodes.tie:nodes.lose;
    await new Promise(resolve=>setTimeout(resolve,endingShot.duration+100));
    return {report,ending,finalAccuracy:document.querySelector("#finalAccuracy").textContent,
      resultTitle:document.querySelector("#resultTitle").textContent,
      resultVisible:document.querySelector("#resultOverlay").classList.contains("visible"),
      finalHero:document.querySelector("#finalHero").textContent,
      finalRival:document.querySelector("#finalRival").textContent,
      reelCount:document.querySelector("#reel").children.length};
  });
  await page.screenshot({path:"playcheck-output/"+v.name+"-result.png"});
  assert.ok(play.resultVisible,"result overlay appears");
  assert.equal(play.reelCount,5,"five video branches logged");
  const grades=play.report.flatMap(x=>x.beats.map(y=>y.judgment));
  const misses=grades.filter(x=>!/(PERFECT|GREAT|GOOD)/.test(x));
  assert.equal(misses.length,0,"all 20 auto taps registered; missed="+JSON.stringify(misses));
  assert.ok(play.finalAccuracy.includes("MISS 0"),"accuracy reports 0 misses");
  await page.locator("#replayBtn").click();
  await page.waitForTimeout(2100);
  const replay=await page.evaluate(()=>({
    title:document.getElementById("sceneTitle").textContent,
    hero:document.getElementById("heroFans").textContent,
    hasNotes:document.getElementById("noteContainer").children.length
  }));
  assert.ok(replay.hasNotes===4,"replay visibly displays mapped rhythm notes");
  assert.equal(errors.length,0,"browser errors: "+JSON.stringify(errors));
  await context.close();await browser.close();
  return {...v,engine:v.name,layout,pads:padRects,play,replay,errors};
}
(async()=>{
  for(const v of variants){
    try{
      const result=await runVariant(v);
      results.push(result);
      process.stdout.write("PLAYCHECK SUCCESS "+v.name+": "+JSON.stringify({
        layout:result.layout,grades:result.play.finalAccuracy,
        ending:result.play.resultTitle,pads:result.pads
      })+"\n");
    }catch(e){
      process.stderr.write("PLAYCHECK FAILED "+v.name+" "+(e.stack||String(e))+"\n");
      results.push({engine:v.name,error:String(e)});
    }
  }
  fs.writeFileSync("playcheck-output/report.json",JSON.stringify(results,null,2));
  if(results.some(x=>x.error))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
