/* KAWAII MOTION — interactive dance-film and competitive audience engine */
(() => {
  "use strict";
  const data=window.KAWAII_GRAPH;
  if(!data)return;
  const shots=data.shots;
  const $=id=>document.getElementById(id);
  const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
  const els={
    title:$("titleOverlay"),result:$("resultOverlay"),pause:$("pauseOverlay"),library:$("libraryOverlay"),
    stage:$("stage"),performers:$("performers"),video:$("clipVideo"),gif:$("clipGif"),sceneId:$("sceneId"),
    scenePlace:$("scenePlace"),sceneTitle:$("sceneTitle"),clipBadge:$("clipBadge"),caption:$("sceneCaption"),
    heroFans:$("heroFans"),rivalFans:$("rivalFans"),supportFill:$("supportFill"),round:$("roundBadge"),
    moodIcon:$("moodIcon"),moodText:$("moodText"),rivalStyle:$("rivalStyle"),audienceTell:$("audienceTell"),
    cueLabel:$("cueLabel"),secondsLeft:$("secondsLeft"),rhythmWindow:$("rhythmWindow"),rhythmPointer:$("rhythmPointer"),
    chainText:$("chainText"),choices:$("choices"),hypeFill:$("hypeFill"),hypeText:$("hypeText"),
    hint:$("gameHint"),fanPopup:$("fanPopup"),retakesLeft:$("retakesLeft"),retake:$("retakeBtn"),
    clipNode:$("clipNode"),clipEntry:$("clipEntry"),clipFile:$("clipFile"),assetState:$("assetState"),reel:$("reel")
  };
  const overlays=[els.title,els.result,els.pause,els.library];
  const runtimeMedia=new Map();
  let manifest={},mediaToken=0,enterAt=performance.now(),pauseStarted=0;
  let current=shots.opening,incoming=null,pending=null,libraryReturn="title",replaySteps=[],replayAt=0;
  let audio=null,soundOn=true;
  let run=resetRun();

  function resetRun(){
    return {phase:"title",paused:false,beat:0,heroFans:650,rivalFans:850,hype:18,
      chain:0,bestChain:0,lastStyle:null,stylesUsed:[],score:0,retakes:2,
      path:[],finished:false,ending:null,lastRating:""};
  }
  function snapshot(){
    return {beat:run.beat,heroFans:run.heroFans,rivalFans:run.rivalFans,
      hype:run.hype,chain:run.chain,bestChain:run.bestChain,lastStyle:run.lastStyle,
      stylesUsed:[...run.stylesUsed],score:run.score,finished:run.finished,ending:run.ending};
  }
  function restore(s){
    Object.assign(run,{...s,stylesUsed:[...s.stylesUsed]});
  }
  function show(overlay){
    overlays.forEach(el=>el.classList.toggle("visible",el===overlay));
  }
  function note(freq=550,length=.08,type="sine"){
    if(!soundOn)return;
    try{
      audio ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audio.state==="suspended")audio.resume().catch(()=>{});
      const osc=audio.createOscillator(),gain=audio.createGain(),time=audio.currentTime;
      osc.type=type;osc.frequency.setValueAtTime(freq,time);
      osc.frequency.exponentialRampToValueAtTime(Math.max(150,freq*.74),time+length);
      gain.gain.setValueAtTime(.001,time);
      gain.gain.exponentialRampToValueAtTime(.043,time+.006);
      gain.gain.exponentialRampToValueAtTime(.001,time+length);
      osc.connect(gain);gain.connect(audio.destination);
      osc.start(time);osc.stop(time+length+.01);
    }catch(_){}
  }
  function popup(text){
    els.fanPopup.textContent=text;
    els.fanPopup.classList.remove("visible");
    void els.fanPopup.offsetWidth;
    els.fanPopup.classList.add("visible");
  }
  function readMood(){return data.moods[Math.min(run.beat,data.moods.length-1)];}
  function styleLabel(style){const x=data.styles[style];return x?x.icon+" "+x.label:"—";}
  function display(){
    els.heroFans.textContent=run.heroFans.toLocaleString("ja-JP");
    els.rivalFans.textContent=run.rivalFans.toLocaleString("ja-JP");
    els.supportFill.style.width=(100*run.heroFans/Math.max(1,run.heroFans+run.rivalFans)).toFixed(1)+"%";
    els.stage.classList.toggle("rival-lead",run.rivalFans>run.heroFans);
    els.round.textContent=run.finished?"FINAL SHOW":("BEAT "+String(Math.min(data.maxBeats,run.beat+1)).padStart(2,"0")+" / 05");
    els.chainText.textContent="CHAIN ×"+run.chain;
    els.hypeFill.style.width=run.hype+"%";
    els.hypeText.textContent=run.hype+"%";
    els.retakesLeft.textContent=String(run.retakes).padStart(2,"0");
    els.retake.disabled=run.retakes<1 || run.path.length===0 || run.phase!=="playing";
    $("resultRetakeBtn").disabled=run.retakes<1 || run.path.length===0;
    const mood=readMood();
    els.moodIcon.textContent=mood.icon;
    els.moodText.textContent=mood.label+"を求めている！";
    els.audienceTell.textContent=mood.tell;
    els.rivalStyle.textContent=styleLabel(data.rivalStyles[Math.min(run.beat,data.maxBeats-1)]);
  }
  function isVideo(src,type=""){return /^video\//.test(type)||/\.(mp4|m4v|webm)(?:\?.*)?$/i.test(src);}
  function stopMedia(){
    mediaToken++;
    els.video.pause();
    els.video.classList.remove("active");els.gif.classList.remove("active");
    els.stage.classList.remove("has-media");
    els.video.removeAttribute("src");els.gif.removeAttribute("src");
    els.video.load();
  }
  function mediaFor(node,entry){
    const suffix=entry?entry.from+":"+entry.choice:null;
    const variantKey=suffix?node.id+"@"+suffix:null;
    if(variantKey && runtimeMedia.has(variantKey))return runtimeMedia.get(variantKey);
    if(runtimeMedia.has(node.id))return runtimeMedia.get(node.id);
    let value=manifest[node.id];
    if(value && typeof value==="object" && !Array.isArray(value)){
      value=suffix && value.from && value.from[suffix] || value.default;
    }
    if(typeof value==="string" && /^assets\/clips\/[a-z0-9/_-]+\.(?:mp4|webm|gif|webp)$/i.test(value) && !value.includes("..")){
      return {url:value,name:value.split("/").pop(),type:isVideo(value)?"video/mp4":"image/gif"};
    }
    return null;
  }
  function loadMedia(node){
    stopMedia();
    const ticket=mediaToken,clip=mediaFor(node,incoming);
    els.clipBadge.textContent="ANIMATIC / DEMO";
    if(!clip)return;
    if(isVideo(clip.name,clip.type)){
      els.video.muted=true;els.video.loop=false;els.video.playsInline=true;
      els.video.onplaying=()=>{
        if(ticket!==mediaToken)return;
        els.video.classList.add("active");
        els.stage.classList.add("has-media");
        els.clipBadge.textContent="VIDEO / "+clip.name.slice(0,14);
      };
      els.video.onerror=()=>{if(ticket===mediaToken){els.video.classList.remove("active");els.stage.classList.remove("has-media");els.clipBadge.textContent="ANIMATIC / VIDEO ERROR";}};
      els.video.src=clip.url;
      els.video.load();
      const promise=els.video.play();
      if(promise && promise.catch)promise.catch(()=>{
        if(ticket===mediaToken){els.video.classList.remove("active");els.stage.classList.remove("has-media");els.clipBadge.textContent="ANIMATIC / AUTOPLAY LIMITED";}
      });
    }else{
      els.gif.onload=()=>{if(ticket===mediaToken){els.gif.classList.add("active");els.stage.classList.add("has-media");els.clipBadge.textContent="GIF / "+clip.name.slice(0,14);}};
      els.gif.onerror=()=>{if(ticket===mediaToken){els.gif.classList.remove("active");els.stage.classList.remove("has-media");els.clipBadge.textContent="ANIMATIC / GIF ERROR";}};
      els.gif.src=clip.url;
    }
  }
  function renderChoices(){
    els.choices.replaceChildren();
    if(current.terminal || run.finished || run.phase==="replay"){
      const msg=document.createElement("div");
      msg.className="choice-finished";
      msg.textContent=run.phase==="replay"?"▶ あなたのダンスを再生中":current.terminal?"✦ RESULT SHOW":"✿ ラストパフォーマンス再生中";
      msg.style.cssText="grid-column:1/-1;display:grid;place-items:center;color:#efc8e7;font-size:12px;font-weight:800;letter-spacing:.07em";
      els.choices.append(msg);return;
    }
    for(const action of current.choices){
      const button=document.createElement("button");button.type="button";
      button.className="choice-btn";button.dataset.style=action.style;
      button.setAttribute("aria-label",action.label+"・"+action.description);
      const icon=document.createElement("span");icon.className="symbol";icon.textContent=action.symbol;
      const title=document.createElement("strong");title.textContent=action.label;
      const info=document.createElement("small");info.textContent=action.description;
      button.append(icon,title,info);
      button.addEventListener("click",()=>choose(action.id));
      els.choices.append(button);
    }
  }
  function enter(id,entry=null){
    current=shots[id]||shots.opening;incoming=entry;pending=null;
    enterAt=performance.now();
    els.stage.dataset.scene=current.scene;
    els.stage.dataset.motion="";
    void els.stage.offsetWidth;
    els.stage.dataset.motion=current.motion;
    els.sceneId.textContent="CUT / "+current.id.toUpperCase();
    els.scenePlace.textContent=current.scene.toUpperCase()+" STAGE";
    els.sceneTitle.textContent=current.title;
    els.caption.textContent=current.subtitle;
    els.rhythmWindow.style.left=((current.window?.[0]??0)*100)+"%";
    els.rhythmWindow.style.width=(((current.window?.[1]??1)-(current.window?.[0]??0))*100)+"%";
    els.rhythmPointer.style.left="0%";
    els.cueLabel.textContent=current.terminal?"RESULT":run.finished?"FINAL POSE":"WATCH THE CROWD";
    els.cueLabel.className="";
    els.secondsLeft.textContent=(current.duration/1000).toFixed(1)+"s";
    els.hint.textContent=run.finished?"最後のダンスに注目！":"観客の反応を見て次の演出を決めよう";
    loadMedia(current);renderChoices();display();
  }
  function begin(){
    run=resetRun();replaySteps=[];replayAt=0;run.phase="playing";
    show(null);enter("opening");note(590,.12,"triangle");
  }
  function judge(fraction,node){
    if(fraction<node.window[0] || fraction>node.window[1])return "miss";
    return Math.abs(fraction-(node.window[0]+node.window[1])/2)<.09?"perfect":"good";
  }
  function choose(id){
    if(run.phase!=="playing"||run.paused||run.finished||current.terminal||pending)return;
    const action=current.choices.find(a=>a.id===id);
    if(!action)return;
    const frac=clamp((performance.now()-enterAt)/current.duration,0,1);
    if(frac<current.window[0]){
      els.hint.textContent="観客のサインが揃うまで、もう少し待とう";
      return;
    }
    if(frac>current.window[1]){
      els.hint.textContent="今のカットはもう遅い。次の流れに注目";
      return;
    }
    pending={action,fraction:frac};
    els.cueLabel.className="locked";els.cueLabel.textContent="LOCKED";
    els.hint.textContent="選択完了！ 映像の自然な接続点で切り替わります";
    current.choices.forEach((a,i)=>{
      const b=els.choices.children[i];
      if(b){b.disabled=true;if(a.id===id)b.classList.add("selected");}
    });
    note(690,.07,"sine");
  }
  function finishChoice(action,fraction,timeout=false){
    const node=current;
    const prior=snapshot();
    const mood=readMood(),rival=data.rivalStyles[run.beat];
    const rating=action?judge(fraction,node):"miss";
    let gain=0,transfer=0,match=false,fresh=false,next="freeze",caption="NO APPEAL";
    if(action && rating!=="miss"){
      match=action.style===mood.style;
      fresh=run.lastStyle!==action.style;
      const nextChain=match?(fresh?run.chain+1:Math.max(1,run.chain)):0;
      gain=Math.max(25,Math.round(
        action.base+(match?165:0)+(rating==="perfect"?95:40)
        +(fresh?64:-118)+(match?nextChain*19:0)+run.hype*.23
      ));
      transfer=match?Math.min(run.rivalFans,44+Math.min(3,nextChain)*12):0;
      run.heroFans+=gain+transfer;run.rivalFans=Math.max(0,run.rivalFans-transfer);
      run.chain=nextChain;run.bestChain=Math.max(run.chain,run.bestChain);
      run.hype=clamp(run.hype+(match?19:-9)+(fresh?9:-14)+(rating==="perfect"?7:0));
      run.lastStyle=action.style;
      if(!run.stylesUsed.includes(action.style))run.stylesUsed.push(action.style);
      run.score+=gain+transfer;
      next=action.next;caption=rating==="perfect"?"PERFECT APPEAL":"GREAT APPEAL";
      note(rating==="perfect"?910:680,.14,"triangle");
    }else{
      run.chain=0;run.hype=clamp(run.hype-25);run.lastStyle=null;
      caption=timeout?"NO APPEAL":"MISSED MOMENT";
      note(190,.18,"sawtooth");
    }
    const rivalGain=300+(rival===mood.style?125:55)+(run.beat%2?24:0);
    run.rivalFans+=rivalGain;
    run.beat++;
    if(run.beat>=data.maxBeats){
      const diff=run.heroFans-run.rivalFans;
      run.ending=diff>110?"win":diff< -110?"lose":"tie";
      run.finished=true;
    }
    const after=snapshot();
    run.path.push({node:node.id,choice:action?.id||"timeout",label:action?.label||"見送り",
      next,decisionAt:fraction,at:action && rating!=="miss"?node.cutAt:1,
      rating,match,fresh,gain,transfer,rivalGain,before:prior,after});
    run.lastRating=rating;
    popup(action && rating!=="miss"?"+"+(gain+transfer)+" FANS!":"RIVAL +"+rivalGain);
    enter(next,{from:node.id,choice:action?.id||"timeout"});
  }
  function retake(){
    if(run.retakes<1 || run.path.length===0 || !["playing","result"].includes(run.phase))return;
    const last=run.path.pop();
    run.retakes--;
    restore(last.before);
    run.phase="playing";run.paused=false;run.finished=false;run.ending=null;
    const previous=run.path[run.path.length-1];
    show(null);enter(last.node,previous?{from:previous.node,choice:previous.choice}:null);
    popup("RETAKE ♡");
    note(420,.16,"triangle");
  }
  function renderResult(){
    const end=run.ending;
    const info=end==="win"?{title:"ENCORE!",symbol:"♡",msg:"桜華のファンが逆転！ 会場がアンコールを求めている。"}
      :end==="tie"?{title:"DOUBLE SPOTLIGHT",symbol:"✦",msg:"同じくらいの支持が集まった！ 2人とも大成功。"}
      :{title:"NEXT STAGE!",symbol:"★",msg:"今回はレイナが人気を獲得。次のステージでリベンジ！"};
    $("resultEyebrow").textContent="THE FINAL VOTE";
    $("resultTitle").textContent=info.title;$("resultSymbol").textContent=info.symbol;
    $("resultMessage").textContent=info.msg;
    $("finalHero").textContent=run.heroFans.toLocaleString("ja-JP");
    $("finalRival").textContent=run.rivalFans.toLocaleString("ja-JP");
    $("finalChain").textContent="×"+run.bestChain;
    els.reel.replaceChildren();
    run.path.forEach((step,i)=>{
      const row=document.createElement("div");
      row.textContent=String(i+1).padStart(2,"0")+
        " "+step.label+" / "+step.rating.toUpperCase()+
        (step.match?" ♡ 人気ジャンル！":"")+" +"+(step.gain+step.transfer);
      els.reel.append(row);
    });
    $("replayBtn").disabled=run.path.length===0;
    display();show(els.result);
  }
  function endGame(){
    run.phase="result";run.paused=false;
    stopMedia();renderResult();
    if(run.ending==="win")note(920,.23,"triangle");
    try{
      const best=Number(localStorage.getItem("kawaii-motion-best")||0);
      if(run.heroFans>best)localStorage.setItem("kawaii-motion-best",String(run.heroFans));
    }catch(_){}
  }
  function startReplay(){
    if(run.path.length===0)return;
    replaySteps=run.path.map(s=>({...s,after:{...s.after,stylesUsed:[...s.after.stylesUsed]}}));
    replayAt=0;
    run.phase="replay";run.paused=false;run.finished=false;
    // Keep the recorded ending and immutable route; reset counters for a faithful replay.
    restore(replaySteps[0].before);
    show(null);enter(replaySteps[0].node);note(570,.09,"triangle");
  }
  function pause(){
    if(!["playing","replay"].includes(run.phase)||run.paused)return;
    run.paused=true;pauseStarted=performance.now();
    els.video.pause();show(els.pause);
  }
  function resume(){
    if(!run.paused)return;
    enterAt+=performance.now()-pauseStarted;run.paused=false;
    show(null);
    if(els.video.src)els.video.play().catch(()=>{});
  }
  function home(){
    run.phase="title";run.paused=false;stopMedia();show(els.title);
  }
  function populateEntries(){
    const id=els.clipNode.value;
    els.clipEntry.replaceChildren();
    const opt=document.createElement("option");opt.value="";opt.textContent="共通映像";
    els.clipEntry.append(opt);
    for(const node of Object.values(shots)){
      for(const action of node.choices||[]){
        if(action.next!==id)continue;
        const entry=document.createElement("option");
        entry.value=node.id+":"+action.id;
        entry.textContent=node.title+" → "+action.label;
        els.clipEntry.append(entry);
      }
    }
    els.clipEntry.value="";updateAssetState();
  }
  function chosenMedia(){
    const id=els.clipNode.value,route=els.clipEntry.value;
    const entry=route && route.includes(":")?{
      from:route.slice(0,route.indexOf(":")),choice:route.slice(route.indexOf(":")+1)
    }:null;
    return {id,route,entry,key:route?id+"@"+route:id};
  }
  function updateAssetState(){
    const selection=chosenMedia(),clip=mediaFor(shots[selection.id],selection.entry);
    els.assetState.textContent="現在: "+(clip?clip.name:"未割当（ダンスデモ）")+
      " / 端末内割当 "+runtimeMedia.size+" 本";
  }
  function fileChanged(){
    const file=els.clipFile.files?.[0],selection=chosenMedia();
    if(!file || !selection.id)return;
    if(!/^(video\/(mp4|webm|quicktime)|image\/(gif|webp))$/.test(file.type)){
      els.assetState.textContent="MP4 / WebM / GIF / WebPのみ利用できます";return;
    }
    if(file.size>120*1024*1024){
      els.assetState.textContent="ファイルが大きすぎます（120MB以下）";return;
    }
    const prev=runtimeMedia.get(selection.key);if(prev)URL.revokeObjectURL(prev.url);
    runtimeMedia.set(selection.key,{url:URL.createObjectURL(file),name:file.name,type:file.type});
    els.clipFile.value="";updateAssetState();
    const currentRoute=incoming?incoming.from+":"+incoming.choice:"";
    if(current.id===selection.id && (!selection.route || selection.route===currentRoute)
      && ["playing","replay"].includes(run.phase))loadMedia(current);
    note(710,.08,"sine");
  }
  function clearFile(){
    const selection=chosenMedia(),previous=runtimeMedia.get(selection.key);
    if(previous){URL.revokeObjectURL(previous.url);runtimeMedia.delete(selection.key);}
    updateAssetState();
    const currentRoute=incoming?incoming.from+":"+incoming.choice:"";
    if(current.id===selection.id && (!selection.route || selection.route===currentRoute)
      && ["playing","replay"].includes(run.phase))loadMedia(current);
  }
  function openLibrary(){
    libraryReturn=run.phase;
    if(["playing","replay"].includes(run.phase)&&!run.paused){
      run.paused=true;pauseStarted=performance.now();els.video.pause();
    }
    show(els.library);updateAssetState();
  }
  function closeLibrary(){
    if(libraryReturn==="title"){show(els.title);return;}
    if(libraryReturn==="result"){show(els.result);return;}
    show(null);
    if(run.paused){
      enterAt+=performance.now()-pauseStarted;run.paused=false;
      if(els.video.src)els.video.play().catch(()=>{});
    }
  }
  function tick(now){
    if(["playing","replay"].includes(run.phase)&&!run.paused){
      const elapsed=now-enterAt,node=current,frac=clamp(elapsed/node.duration,0,1);
      els.rhythmPointer.style.left=(frac*100)+"%";
      els.secondsLeft.textContent=(Math.max(0,node.duration-elapsed)/1000).toFixed(1)+"s";
      if(run.phase==="playing" && !run.finished && !node.terminal){
        const open=frac>=node.window[0]&&frac<=node.window[1];
        els.cueLabel.textContent=pending?"LOCKED":open?"APPEAL NOW":frac<node.window[0]?"WATCH THE CROWD":"LAST MOMENT";
        els.cueLabel.className=pending?"locked":open?"open":"";
        if(!pending){
          els.hint.textContent=open?"観客に合ったアピールを選ぼう！":
            frac<node.window[0]?"ペンライトとライバルを観察しよう":"入力できるタイミングを逃した";
        }
        if(frac>=node.cueAt)els.audienceTell.textContent=readMood().tell;
      }
      if(run.phase==="playing"){
        if(node.terminal && elapsed>=node.duration)endGame();
        else if(run.finished && elapsed>=node.duration){
          enter(run.ending,{from:node.id,choice:"final"});
        }else if(!run.finished&&!node.terminal&&pending&&frac>=node.cutAt){
          const selected=pending;pending=null;
          finishChoice(selected.action,selected.fraction);
        }else if(!run.finished&&!node.terminal&&elapsed>=node.duration){
          finishChoice(null,1,true);
        }
      }else if(run.phase==="replay"){
        const step=replaySteps[replayAt];
        if(step&&step.node===node.id&&frac>=step.at){
          restore(step.after);replayAt++;
          enter(step.next,{from:step.node,choice:step.choice});
        }else if(!step && run.finished && !node.terminal && elapsed>=node.duration){
          enter(run.ending,{from:node.id,choice:"final"});
        }else if(node.terminal && elapsed>=node.duration)endGame();
      }
    }
    requestAnimationFrame(tick);
  }
  for(const node of Object.values(shots)){
    const o=document.createElement("option");o.value=node.id;o.textContent=node.title+" / "+node.id;
    els.clipNode.append(o);
  }
  els.clipNode.value="opening";
  els.clipNode.addEventListener("change",populateEntries);
  els.clipEntry.addEventListener("change",updateAssetState);
  els.clipFile.addEventListener("change",fileChanged);
  $("startBtn").addEventListener("click",begin);
  $("restartBtn").addEventListener("click",begin);
  $("replayBtn").addEventListener("click",startReplay);
  $("resultRetakeBtn").addEventListener("click",retake);
  els.retake.addEventListener("click",retake);
  $("pauseBtn").addEventListener("click",pause);
  $("resumeBtn").addEventListener("click",resume);
  $("exitBtn").addEventListener("click",home);
  $("libraryBtn").addEventListener("click",openLibrary);
  $("titleLibraryBtn").addEventListener("click",openLibrary);
  $("closeLibraryBtn").addEventListener("click",closeLibrary);
  $("clearClipBtn").addEventListener("click",clearFile);
  $("soundBtn").addEventListener("click",()=>{
    soundOn=!soundOn;$("soundBtn").textContent=soundOn?"♪":"♩";
    $("soundBtn").setAttribute("aria-label",soundOn?"サウンドをオフ":"サウンドをオン");
    if(soundOn)note(640,.09);
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden&&["playing","replay"].includes(run.phase))pause();
  });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){
      if(els.library.classList.contains("visible"))closeLibrary();
      else if(els.pause.classList.contains("visible"))resume();
      else pause();
    }
    if(run.phase==="playing"&&!run.paused&&/^[123]$/.test(e.key)){
      choose(current.choices?.[Number(e.key)-1]?.id);
    }
  });
  fetch("assets/manifest.json",{cache:"no-cache"})
    .then(r=>r.ok?r.json():{}).then(x=>{
      if(x&&typeof x==="object"&&!Array.isArray(x))manifest=x;
      updateAssetState();
    }).catch(()=>{});
  populateEntries();display();show(els.title);
  requestAnimationFrame(tick);
})();
