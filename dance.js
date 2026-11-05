/* KAWAII MOTION — interactive dance-film and competitive audience engine */
(() => {
  "use strict";
  const data=window.KAWAII_GRAPH;
  if(!data)return;
  const shots=data.shots;
  const rhythm=window.KAWAII_RHYTHM;
  const beatSound=window.KAWAII_BEAT;
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
    clipNode:$("clipNode"),clipEntry:$("clipEntry"),clipFile:$("clipFile"),packFile:$("packFile"),packState:$("packState"),assetState:$("assetState"),reel:$("reel"),
    notes:$("noteContainer"),noteFeedback:$("noteFeedback"),noteHighway:$("noteHighway"),finalAccuracy:$("finalAccuracy")
  };
  const overlays=[els.title,els.result,els.pause,els.library];
  const runtimeMedia=new Map();
  let manifest={},mediaToken=0,enterAt=performance.now(),pauseStarted=0;
  let current=shots.opening,incoming=null,pending=null,libraryReturn="title",replaySteps=[],replayAt=0;
  let audio=null,soundOn=true,sceneRhythm=null,segmentStart=null;
  let run=resetRun();

  function resetRun(){
    return {phase:"title",paused:false,beat:0,heroFans:650,rivalFans:850,hype:18,
      chain:0,bestChain:0,lastStyle:null,stylesUsed:[],score:0,retakes:2,
      path:[],finished:false,ending:null,lastRating:"",accuracy:{perfect:0,great:0,good:0,miss:0},totalNotes:0};
  }
  function snapshot(){
    return {beat:run.beat,heroFans:run.heroFans,rivalFans:run.rivalFans,
      hype:run.hype,chain:run.chain,bestChain:run.bestChain,lastStyle:run.lastStyle,
      stylesUsed:[...run.stylesUsed],score:run.score,finished:run.finished,ending:run.ending,
      accuracy:{...run.accuracy},totalNotes:run.totalNotes};
  }
  function restore(s){
    Object.assign(run,{...s,stylesUsed:[...s.stylesUsed],accuracy:{...s.accuracy}});
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
    els.stage.classList.toggle("fever",run.chain>=8);
    els.round.textContent=run.finished?"FINAL SHOW":("BEAT "+String(Math.min(data.maxBeats,run.beat+1)).padStart(2,"0")+" / 05");
    els.chainText.textContent="COMBO ×"+run.chain;
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
      const promise=run.paused?null:els.video.play();
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
      msg.textContent=run.phase==="replay"?"♫ あなたのリズムをリプレイ中":current.terminal?"✦ RESULT SHOW":"✿ フィナーレ再生中";
      msg.style.cssText="grid-column:1/-1;display:grid;place-items:center;color:#efc8e7;font-size:12px;font-weight:800";
      els.choices.append(msg);return;
    }
    for(const action of current.choices){
      const button=document.createElement("button");button.type="button";
      button.className="choice-btn";button.dataset.style=action.style;
      button.setAttribute("aria-label",action.symbol+" "+action.label+"のリズムレーン");
      const icon=document.createElement("span");icon.className="symbol";icon.textContent=action.symbol;
      const title=document.createElement("strong");title.textContent=action.label;
      const info=document.createElement("small");info.textContent=action.style==="cute"?"CUTE":action.style==="cool"?"COOL":"SURPRISE";
      button.append(icon,title,info);
      let pointerTime=-1e6;
      button.addEventListener("pointerdown",e=>{
        if(e && e.preventDefault)e.preventDefault();
        pointerTime=performance.now();
        choose(action.id);
      });
      button.addEventListener("click",()=>{
        if(performance.now()-pointerTime>420)choose(action.id);
      });
      els.choices.append(button);
    }
  }
  function resetNoteHighway(){
    els.notes.replaceChildren();
    const active=!!(sceneRhythm&&sceneRhythm.notes.length);
    els.noteHighway.style.display=active?"grid":"none";
    if(!active)return;
    for(const n of sceneRhythm.notes){
      const token=document.createElement("div");
      token.className="note-token"+(n.kind==="freestyle"?" freestyle":"");
      if(n.style)token.dataset.style=n.style;
      token.textContent=n.kind==="freestyle"?"★ FREE STYLE — 好きな色！":
        data.styles[n.style].icon;
      n.element=token;
      els.notes.append(token);
    }
  }
  function moveNotes(elapsed){
    if(!sceneRhythm)return;
    for(const n of sceneRhythm.notes){
      if(!n.element)continue;
      const progress=rhythm.progress(n,elapsed);
      n.element.style.top=(10+progress*69)+"%";
      n.element.style.display=n.status!=="waiting"||progress<-.16||progress>1.24?"none":"grid";
    }
  }
  function feedback(label,bad=false){
    els.noteFeedback.textContent=label;
    els.noteFeedback.className="note-feedback"+(bad?" bad":"");
    void els.noteFeedback.offsetWidth;
    els.noteFeedback.classList.add("burst");
  }
  function recordRhythmEvent(kind,n,elapsed,extra={}){
    if(!sceneRhythm)return;
    sceneRhythm.events.push({kind,id:n.id,t:Math.max(0,elapsed),...extra,state:snapshot()});
  }
  function missedNote(n,elapsed,wrong=false){
    run.accuracy.miss++;run.totalNotes++;
    run.chain=0;run.hype=clamp(run.hype-10);
    if(n.element)n.element.classList.add(wrong?"wrong":"miss");
    feedback(wrong?"WRONG LANE":"MISS",true);
    recordRhythmEvent("miss",n,elapsed,{style:wrong?n.chosen:null});
    if(run.phase==="playing")note(180,.09,"triangle");
    display();
  }
  function hitNote(n,style,grade,elapsed){
    const mood=readMood();
    const base={perfect:93,great:68,good:42}[grade]||0;
    const moodBonus=style===mood.style?24:0;
    const freestyleBonus=n.kind==="freestyle"?52:0;
    const fans=base+moodBonus+freestyleBonus+Math.min(54,run.chain*3)+(run.chain>=7?33:0);
    run.heroFans+=fans;run.score+=fans;
    run.accuracy[grade]++;run.totalNotes++;
    run.chain++;run.bestChain=Math.max(run.bestChain,run.chain);
    run.hype=clamp(run.hype+(grade==="perfect"?7:grade==="great"?5:3));
    feedback((run.chain>=8?"FEVER ":"")+(grade==="perfect"?"PERFECT!":grade==="great"?"GREAT!":"GOOD!")+" +"+fans);
    if(n.element)n.element.classList.add("hit");
    if(n.kind==="freestyle"){
      const action=current.choices.find(x=>x.style===style);
      if(action){
        pending={action,fraction:elapsed/current.duration,grade};
        els.cueLabel.textContent="DANCE LOCKED";
        els.cueLabel.className="locked";
        els.hint.textContent=action.label+"へダンスを接続！";
        current.choices.forEach((a,i)=>{
          const b=els.choices.children[i];
          if(b){b.disabled=true;if(a.id===action.id)b.classList.add("selected");}
        });
      }
    }
    recordRhythmEvent("hit",n,elapsed,{style,grade,fans});
    note(grade==="perfect"?880:grade==="great"?690:510,.09,"triangle");
    display();
  }
  function choose(id){
    if(run.phase!=="playing"||run.paused||run.finished||current.terminal||pending||!sceneRhythm)return;
    const action=current.choices.find(a=>a.id===id);
    if(!action)return;
    const elapsed=performance.now()-enterAt;
    const result=rhythm.tap(sceneRhythm.notes,action.style,elapsed);
    if(result.type==="ignored"){
      els.hint.textContent="光るノーツがラインに来たらタップ！";
      return;
    }
    if(result.type==="wrong"){
      missedNote(result.note,elapsed,true);
      return;
    }
    hitNote(result.note,action.style,result.grade,elapsed);
  }
  function resolveRhythm(elapsed){
    if(!sceneRhythm)return;
    let changed=false;
    for(const n of sceneRhythm.notes){
      if(!n.rivalAwarded && elapsed>=n.at){
        n.rivalAwarded=true;
        const rival=data.rivalStyles[Math.min(run.beat,data.maxBeats-1)];
        const value=73+(rival===readMood().style?15:0)+(run.beat%2?6:0);
        run.rivalFans+=value;
        changed=true;
        recordRhythmEvent("rival",n,n.at,{fans:value});
      }
    }
    for(const n of rhythm.expire(sceneRhythm.notes,elapsed))missedNote(n,n.at+rhythm.WINDOW+1);
    if(changed)display();
  }
  function replayRhythm(elapsed){
    if(!sceneRhythm)return;
    const step=replaySteps[replayAt];
    if(!step || step.node!==current.id)return;
    while(sceneRhythm.replayCursor<(step.hits?.length||0)){
      const event=step.hits[sceneRhythm.replayCursor];
      if(event.t>elapsed)break;
      sceneRhythm.replayCursor++;
      const n=sceneRhythm.notes[event.id];
      if(n){n.status=event.kind==="hit"?"hit":event.kind==="miss"?"miss":n.status;}
      restore(event.state);
      if(event.kind==="hit")feedback((event.grade||"good").toUpperCase()+"!");
      if(event.kind==="miss")feedback("MISS",true);
      display();
    }
  }
  function enter(id,entry=null){
    current=shots[id]||shots.opening;incoming=entry;pending=null;
    enterAt=performance.now();
    segmentStart=run.phase==="playing"&&!run.finished&&!current.terminal?snapshot():null;
    sceneRhythm=!current.terminal&&!run.finished?
      {notes:rhythm.chart(current,readMood().style,data.rivalStyles[Math.min(run.beat,data.maxBeats-1)],run.beat),events:[],replayCursor:0}:null;
    beatSound.start();
    resetNoteHighway();
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
    els.hint.textContent=run.finished?"最後のダンスに注目！":"ノーツと同じ色のボタンをリズムでタップ！ 虹色は自由選択";
    loadMedia(current);renderChoices();display();
  }
  function begin(){
    run=resetRun();replaySteps=[];replayAt=0;run.phase="playing";
    beatSound.setEnabled(soundOn);
    show(null);enter("opening");note(590,.12,"triangle");
  }
  function finishChoice(action,fraction,timeout=false){
    const node=current;
    const prior=segmentStart||snapshot();
    const mood=readMood(),rival=data.rivalStyles[Math.min(run.beat,data.maxBeats-1)];
    const rating=action?(pending?.grade||"good"):"miss";
    let gain=0,transfer=0,match=false,fresh=false,next="freeze";
    if(action&&rating!=="miss"){
      match=action.style===mood.style;
      fresh=run.lastStyle!==action.style;
      const goodHits=sceneRhythm?.notes.filter(n=>n.status==="hit").length||0;
      gain=Math.max(20,Math.round(
        action.base*.67+(match?135:0)+(fresh?65:-70)
        +Math.min(72,goodHits*17)+run.hype*.25
      ));
      transfer=match?Math.min(run.rivalFans,45+Math.min(100,run.chain*3)):0;
      run.heroFans+=gain+transfer;
      run.rivalFans=Math.max(0,run.rivalFans-transfer);
      run.score+=gain+transfer;
      run.hype=clamp(run.hype+(match?13:-8)+(fresh?6:-10));
      run.lastStyle=action.style;
      if(!run.stylesUsed.includes(action.style))run.stylesUsed.push(action.style);
      next=action.next;
      note(rating==="perfect"?970:700,.15,"triangle");
    }else{
      run.chain=0;run.hype=clamp(run.hype-15);run.lastStyle=null;
      note(175,.16,"triangle");
    }
    const rivalGain=86+(rival===mood.style?23:0)+(run.beat%2?8:0);
    run.rivalFans+=rivalGain;
    run.beat++;
    if(run.beat>=data.maxBeats){
      const diff=run.heroFans-run.rivalFans;
      run.ending=diff>110?"win":diff< -110?"lose":"tie";
      run.finished=true;
    }
    const after=snapshot();
    run.path.push({node:node.id,choice:action?.id||"timeout",
      label:action?.label||"フィニッシュ失敗",next,decisionAt:fraction,
      at:action?node.cutAt:1,rating,match,fresh,gain,transfer,rivalGain,
      hits:sceneRhythm?.events.map(e=>({...e,state:{...e.state,accuracy:{...e.state.accuracy},stylesUsed:[...e.state.stylesUsed]}}))||[],
      before:prior,after});
    run.lastRating=rating;
    popup(action?"+"+(gain+transfer)+" FANS!":"NO FINISH");
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
    els.finalAccuracy.textContent="PERFECT "+run.accuracy.perfect+" · GREAT "+run.accuracy.great+" · GOOD "+run.accuracy.good+" · MISS "+run.accuracy.miss;
    els.reel.replaceChildren();
    run.path.forEach((step,i)=>{
      const row=document.createElement("div");
      row.textContent=String(i+1).padStart(2,"0")+" "+step.label+
        " / "+(step.hits?.filter(e=>e.kind==="hit").length||0)+" HIT"+
        (step.match?" ♡ 応援ボーナス":"")+" +"+(step.gain+step.transfer);
      els.reel.append(row);
    });
    $("replayBtn").disabled=run.path.length===0;
    display();show(els.result);
  }
  function endGame(){
    run.phase="result";run.paused=false;
    stopMedia();beatSound.suspend();renderResult();
    if(run.ending==="win")note(920,.23,"triangle");
    try{
      const best=Number(localStorage.getItem("kawaii-motion-best")||0);
      if(run.heroFans>best)localStorage.setItem("kawaii-motion-best",String(run.heroFans));
    }catch(_){}
  }
  function startReplay(){
    if(run.path.length===0)return;
    replaySteps=run.path.map(s=>({...s,after:{...s.after,accuracy:{...s.after.accuracy},stylesUsed:[...s.after.stylesUsed]},hits:(s.hits||[]).map(e=>({...e,state:{...e.state,accuracy:{...e.state.accuracy},stylesUsed:[...e.state.stylesUsed]}}))}));
    replayAt=0;
    run.phase="replay";run.paused=false;run.finished=false;
    // Keep the recorded ending and immutable route; reset counters for a faithful replay.
    restore(replaySteps[0].before);
    show(null);enter(replaySteps[0].node);note(570,.09,"triangle");
  }
  function pause(){
    if(!["playing","replay"].includes(run.phase)||run.paused)return;
    run.paused=true;pauseStarted=performance.now();
    els.video.pause();beatSound.suspend();show(els.pause);
  }
  function resume(){
    if(!run.paused)return;
    enterAt+=performance.now()-pauseStarted;run.paused=false;
    beatSound.resume();show(null);
    if(els.video.src)els.video.play().catch(()=>{});
  }
  function home(){
    run.phase="title";run.paused=false;stopMedia();beatSound.suspend();show(els.title);
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
  async function packChanged(){
    const input=els.packFile,file=input.files?.[0];
    if(!file)return;
    els.packState.textContent="クリップを読み込み中…";
    try{
      if(!window.KAWAII_CLIP_PACK)throw Error("パック読込機能がありません");
      if(file.size>150*1024*1024)throw Error("パックが大きすぎます（150MB以下）");
      const clips=await window.KAWAII_CLIP_PACK.readPack(await file.arrayBuffer());
      let loaded=0,ignored=0;
      for(const clip of clips){
        if(!shots[clip.node]){ignored++;continue;}
        if(clip.entry){
          const parts=clip.entry.split(":");
          if(parts.length!==2||!shots[parts[0]]?.choices?.some(x=>x.id===parts[1]&&x.next===clip.node)){
            ignored++;continue;
          }
        }
        const key=clip.node+(clip.entry?"@"+clip.entry:""),old=runtimeMedia.get(key);
        if(old)URL.revokeObjectURL(old.url);
        runtimeMedia.set(key,{url:URL.createObjectURL(clip.blob),name:clip.name,type:clip.type});
        loaded++;
      }
      if(!loaded)throw Error("シーン名に一致するクリップがありません");
      els.packState.textContent=loaded+" 本の映像を読み込みました。"+(ignored?" （未対応 "+ignored+" 本）":"");
      updateAssetState();
      if(["playing","replay"].includes(run.phase))loadMedia(current);
      note(780,.12,"triangle");
    }catch(err){
      els.packState.textContent="読み込み失敗: "+(err?.message||"ZIPを確認してください");
    }finally{input.value="";}
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
      run.paused=true;pauseStarted=performance.now();els.video.pause();beatSound.suspend();
    }
    show(els.library);updateAssetState();
  }
  function closeLibrary(){
    if(libraryReturn==="title"){show(els.title);return;}
    if(libraryReturn==="result"){show(els.result);return;}
    show(null);
    if(run.paused){
      enterAt+=performance.now()-pauseStarted;run.paused=false;beatSound.resume();
      if(els.video.src)els.video.play().catch(()=>{});
    }
  }
  function tick(now){
    if(["playing","replay"].includes(run.phase)&&!run.paused){
      const elapsed=now-enterAt,node=current,frac=clamp(elapsed/node.duration,0,1);
      els.rhythmPointer.style.left=(frac*100)+"%";
      els.secondsLeft.textContent=(Math.max(0,node.duration-elapsed)/1000).toFixed(1)+"s";
      beatSound.schedule(elapsed);
      moveNotes(elapsed);
      if(!run.finished&&!node.terminal){
        if(run.phase==="playing")resolveRhythm(elapsed);
        else replayRhythm(elapsed);
        const next=sceneRhythm?.notes.find(n=>n.status==="waiting");
        const requested=next?.kind==="freestyle"?"★ FREE STYLE!":
          next?.style?data.styles[next.style].icon+" TAP ON BEAT":"FINISH";
        els.cueLabel.textContent=pending?"DANCE LOCKED":requested;
        els.cueLabel.className=pending?"locked":next?"open":"";
        if(!pending)els.hint.textContent=next?.kind==="freestyle"?
          "虹色ノーツは自由！次のダンスを好きなボタンで選ぼう":
          "レーンを流れるノーツが光る線に来たら同じ色をタップ";
      }
      if(run.phase==="playing"){
        if(node.terminal && elapsed>=node.duration)endGame();
        else if(run.finished && elapsed>=node.duration){
          enter(run.ending,{from:node.id,choice:"final"});
        }else if(!run.finished&&!node.terminal&&pending&&frac>=node.cutAt){
          const selected=pending;
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
  els.packFile.addEventListener("change",packChanged);
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
    beatSound.setEnabled(soundOn);
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
      // If the audience starts immediately before the manifest arrives,
      // swap the placeholder into its bundled clip as soon as assets are known.
      if(["playing","replay"].includes(run.phase) && !run.paused && !els.video.classList.contains("active")
        && !els.gif.classList.contains("active") && mediaFor(current,incoming))loadMedia(current);
    }).catch(()=>{});
  populateEntries();display();show(els.title);
  requestAnimationFrame(tick);
})();
