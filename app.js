/* GIF FIGHTERS / MOTION CHAIN — playable cinematic branching prototype */
(() => {
  "use strict";
  const graph = window.GF_GRAPH;
  const $ = id => document.getElementById(id);
  const clamp = (v, lo=0, hi=1) => Math.max(lo, Math.min(hi, v));
  const els = {
    title:$("titleOverlay"), result:$("resultOverlay"), pause:$("pauseOverlay"), media:$("mediaOverlay"),
    cinema:$("cinema"), fighters:$("fighters"), video:$("clipVideo"), gif:$("clipGif"),
    sceneName:$("sceneName"), shotNumber:$("shotNumber"), shotTitle:$("shotTitle"), subtitle:$("subtitle"),
    time:$("timeDisplay"), score:$("scoreDisplay"), flow:$("flowFill"), chain:$("chainDisplay"), hp:$("hpDisplay"),
    tell:$("telegraph"), windowBand:$("windowBand"), windowLabel:$("windowLabel"), timingNeedle:$("timingNeedle"),
    timingHint:$("timingHint"), choices:$("choices"), retakes:$("retakeCounter"), retake:$("retakeButton"),
    impact:$("impactText"), ticker:$("ticker"), clipBadge:$("clipBadge"), clipNode:$("clipNode"),
    clipFile:$("clipFile"), assetState:$("assetState"), reel:$("reel")
  };
  if (!graph || !els.title) return;
  const overlays = [els.title,els.result,els.pause,els.media];
  const library = new Map();
  let manifest = {};
  let audioCtx = null;
  let silent = false;
  let currentNode = graph.intro;
  let enteredAt = performance.now();
  let pausedAt = 0;
  let mediaToken = 0;
  let mediaBefore = "title";
  let replayPlan = [];
  let replayIndex = 0;
  let pendingChoice = null; // buffered decision for portrait film shots
  let run = newRun();

  function newRun() {
    return {phase:"title",paused:false,score:0,chain:0,maxChain:0,flow:0,hp:100,retakes:2,
      path:[],outcome:null,cuts:0,lastJudgment:"",lastChoice:""};
  }
  function showOverlay(overlay) {
    overlays.forEach(el => el.classList.toggle("visible",el===overlay));
  }
  function tone(freq=490,seconds=.07,kind="sine") {
    if (silent) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state==="suspended") audioCtx.resume().catch(()=>{});
      const o=audioCtx.createOscillator(),g=audioCtx.createGain(),at=audioCtx.currentTime;
      o.type=kind;o.frequency.setValueAtTime(freq,at);
      o.frequency.exponentialRampToValueAtTime(Math.max(80,freq*.65),at+seconds);
      g.gain.setValueAtTime(.001,at);g.gain.exponentialRampToValueAtTime(.08,at+.006);
      g.gain.exponentialRampToValueAtTime(.001,at+seconds);
      o.connect(g);g.connect(audioCtx.destination);o.start(at);o.stop(at+seconds+.015);
    } catch (_) { /* audio unavailable: play silently */ }
  }
  function flash(word,bad=false) {
    els.impact.textContent=word;
    els.impact.classList.remove("pulse");void els.impact.offsetWidth;els.impact.classList.add("pulse");
    if (bad) {els.ticker.classList.remove("hit");void els.ticker.offsetWidth;els.ticker.classList.add("hit");}
  }
  function isClipVideo(name) { return /\.(mp4|webm|m4v)(?:\?.*)?$/i.test(name) || /^video\//.test(name); }
  function stopMedia() {
    ++mediaToken;
    els.video.pause();
    els.video.classList.remove("active");els.gif.classList.remove("active");
    els.video.removeAttribute("src");els.gif.removeAttribute("src");
    els.video.load();
  }
  function getClip(id) {
    if(library.has(id)) return library.get(id);
    const source=manifest[id];
    if(typeof source==="string" && /^(?:assets\/clips\/)[a-z0-9._/-]+$/i.test(source) && !source.includes("..")) {
      return {url:source,name:source,type:isClipVideo(source)?"video/mp4":"image/gif"};
    }
    return null;
  }
  function loadMedia(node) {
    stopMedia();
    const token=mediaToken;
    const clip=getClip(node.id);
    els.clipBadge.textContent="ANIMATIC · 試作映像";
    if(!clip) return;
    if (isClipVideo(clip.name) || clip.type.startsWith("video/")) {
      els.video.muted=true;els.video.loop=true;els.video.playsInline=true;
      els.video.onplaying=()=>{if(token!==mediaToken)return;els.video.classList.add("active");els.clipBadge.textContent="VIDEO · "+clip.name.slice(0,18);};
      els.video.onerror=()=>{if(token===mediaToken){els.video.classList.remove("active");els.clipBadge.textContent="ANIMATIC · 再生失敗";}};
      els.video.src=clip.url;els.video.load();
      const promise=els.video.play();
      if(promise && promise.catch) promise.catch(()=>{if(token===mediaToken){els.clipBadge.textContent="ANIMATIC · 映像再生制限";els.video.classList.remove("active");}});
    } else {
      els.gif.onload=()=>{if(token!==mediaToken)return;els.gif.classList.add("active");els.clipBadge.textContent="GIF · "+clip.name.slice(0,18);};
      els.gif.onerror=()=>{if(token===mediaToken){els.gif.classList.remove("active");els.clipBadge.textContent="ANIMATIC · 読込失敗";}};
      els.gif.src=clip.url;
    }
  }
  function renderHud() {
    els.score.textContent=String(run.score).padStart(6,"0");
    els.flow.style.width=run.flow+"%";
    els.chain.textContent="×"+String(run.chain).padStart(2,"0");
    els.hp.textContent=run.hp;
    els.hp.style.color=run.hp<40?"#fa8a8d":"";
    els.retakes.textContent=String(run.retakes).padStart(2,"0");
    els.retake.disabled=run.retakes<1 || run.path.length<1 || run.phase!=="playing";
    $("resultRetakeButton").disabled=run.retakes<1 || run.path.length<1;
  }
  function renderChoices(node) {
    els.choices.replaceChildren();
    if (node.terminal) {
      const div=document.createElement("div");
      div.className="end-note";div.textContent="THE LAST CUT · 映像の結末を再生中";
      div.style.cssText="grid-column:1/-1;display:grid;place-items:center;color:#a6d8d2;font-size:12px;letter-spacing:.12em";
      els.choices.append(div);
      els.tell.textContent="FILM COMPLETED";
      els.timingHint.textContent="結果を集計しています…";
      return;
    }
    els.tell.textContent=node.cutAt?"相手の動きを観察する":node.tell;
    node.choices.forEach((choice,index)=>{
      const btn=document.createElement("button");
      btn.type="button";btn.className="choice-btn "+(choice.kind==="risky"?"danger":choice.kind==="safe"?"safe":"");
      btn.setAttribute("aria-label",choice.label+" "+choice.sub);
      const icon=document.createElement("span");icon.className="choice-symbol";icon.textContent=choice.symbol;
      const name=document.createElement("strong");name.textContent=choice.label;
      const sub=document.createElement("small");sub.textContent=choice.sub;
      btn.append(icon,name,sub);
      btn.addEventListener("pointerdown",()=>{btn.style.transform="scale(.97)";},{passive:true});
      btn.addEventListener("pointercancel",()=>{btn.style.transform="";},{passive:true});
      btn.addEventListener("pointerup",()=>{btn.style.transform="";},{passive:true});
      btn.addEventListener("click",()=>choose(choice.id));
      els.choices.append(btn);
    });
  }
  function enterNode(id) {
    currentNode=graph[id] || graph.knockout;
    pendingChoice=null;
    enteredAt=performance.now();
    els.cinema.className="cinema scene-"+currentNode.scene;
    els.fighters.removeAttribute("data-motion");
    void els.fighters.offsetWidth;
    els.fighters.dataset.motion=currentNode.motion;
    els.sceneName.textContent=currentNode.location;
    els.shotNumber.textContent=currentNode.shot;
    els.shotTitle.textContent=currentNode.title;
    els.subtitle.textContent=currentNode.subtitle;
    els.windowBand.style.left=(currentNode.window?.[0]??0)*100+"%";
    els.windowBand.style.width=((currentNode.window?.[1]??1)-(currentNode.window?.[0]??0))*100+"%";
    els.timingNeedle.style.left="0%";
    els.windowLabel.className="window-label";
    els.windowLabel.textContent=currentNode.terminal?"ENDING":"READY";
    els.timingHint.textContent=run.phase==="replay"?"あなたが選んだ映像ルートを再生中":currentNode.cutAt?"予兆を見て、次の動きを選ぼう":"映像を読んで、好機に次の一手を選ぼう";
    renderChoices(currentNode);
    loadMedia(currentNode);
    renderHud();
  }
  function start() {
    run=newRun();run.phase="playing";
    replayPlan=[];replayIndex=0;
    showOverlay(null);
    enterNode("intro");tone(470,.15,"triangle");
  }
  function ratingAt(fraction,node,choice) {
    const [left,right]=node.window;
    if (!choice || fraction < left || fraction > right) return "miss";
    const middle=(left+right)/2;
    return Math.abs(fraction-middle) < .095?"perfect":"good";
  }
  // MOTION BRANCH: a player chooses during the readable cue. The film changes only at a
  // prepared stitch frame, so the choreography continues naturally after tapping.
  function choose(id,timeout=false) {
    if(run.phase!=="playing" || run.paused || currentNode.terminal)return;
    const node=currentNode;
    if(node.cutAt && pendingChoice) return;
    const choice=node.choices.find(item=>item.id===id) || null;
    const fraction=timeout?1:clamp((performance.now()-enteredAt)/node.duration);
    if(node.cutAt && !timeout && choice){
      if(fraction<node.window[0]){
        els.timingHint.textContent="相手の予兆が見えるまで待とう";
        return; // early taps do not damage the player or create surprise QTE failures
      }
      if(fraction<=node.window[1]){
        pendingChoice={choice,fraction};
        els.windowLabel.textContent="LOCKED";
        els.timingHint.textContent="次の動きを選択済み。映像のつなぎ目まで再生します";
        node.choices.forEach((candidate,index)=>{
          const button=els.choices.children[index];
          if(button){
            button.disabled=true;
            if(candidate.id===id)button.classList.add("selected");
          }
        });
        tone(500,.075,"triangle");
        return;
      }
    }
    commitChoice(node,choice,fraction,timeout);
  }
  function commitChoice(node,choice,fraction,timeout=false) {
    const rating=ratingAt(fraction,node,choice);
    const before={score:run.score,chain:run.chain,maxChain:run.maxChain,flow:run.flow,hp:run.hp};
    let next,caption;
    if(rating==="miss") {
      run.hp=Math.max(0,run.hp-24);run.chain=0;run.flow=Math.max(0,run.flow-24);
      next=run.hp<=0 || node.id==="stumble"?"knockout":"stumble";
      caption=timeout?"TIME OUT":"MISSED CUT";
      tone(160,.22,"sawtooth");flash(caption,true);
    } else {
      const multiplier=rating==="perfect"?1.65:1;
      run.score+=Math.round(choice.points*multiplier*(1+run.chain*.13));
      run.flow=Math.min(100,run.flow+Math.round(choice.flow*multiplier));
      run.chain+=1;run.maxChain=Math.max(run.maxChain,run.chain);
      if(choice.kind==="safe")run.hp=Math.min(100,run.hp+3);
      next=choice.next;caption=rating==="perfect"?"PERFECT CUT":"GOOD CUT";
      tone(rating==="perfect"?880:620,rating==="perfect"?.17:.11,"triangle");
      flash(caption,false);
    }
    run.path.push({node:node.id,choice:choice?.id||"timeout",label:choice?.label||"選択なし",
      next,at:node.cutAt&&rating!=="miss"?node.cutAt:fraction,decisionAt:fraction,rating,before});
    run.cuts++;
    run.lastJudgment=rating;run.lastChoice=caption;
    enterNode(next);
  }
  function retake() {
    if(run.retakes<1 || run.path.length<1 || !["playing","result"].includes(run.phase))return;
    const last=run.path.pop(),before=last.before;
    run.retakes--;run.score=before.score;run.chain=before.chain;run.maxChain=before.maxChain;
    run.flow=before.flow;run.hp=before.hp;run.cuts=run.path.length;
    run.phase="playing";run.paused=false;
    showOverlay(null);enterNode(last.node);flash("RETAKE");
    tone(400,.13,"sine");
  }
  function finish(outcome) {
    run.phase="result";run.outcome=outcome;run.paused=false;stopMedia();
    const win=outcome!=="defeat";
    $("resultEyebrow").textContent=win?"FILM WRAPPED":"TAKE FAILED";
    $("resultTitle").textContent=outcome==="victory"?"THAT'S A WRAP.":outcome==="survived"?"SAFE CUT.":"CUT TO BLACK.";
    $("resultMessage").textContent=outcome==="victory"?
      "連続した選択が、一本のアクション映画になった。":
      outcome==="survived"?"最後まで生き残り、静かな決着を選んだ。":"タイミングを見直し、別の未来を撮り直そう。";
    $("finalScore").textContent=String(run.score).padStart(6,"0");
    $("finalChain").textContent=String(run.maxChain).padStart(2,"0");
    $("finalCuts").textContent=String(run.path.length).padStart(2,"0");
    els.reel.replaceChildren();
    run.path.forEach((step,i)=>{
      const row=document.createElement("div");
      row.textContent=String(i+1).padStart(2,"0")+" "+graph[step.node].title+" → "+step.label+" / "+step.rating.toUpperCase();
      els.reel.append(row);
    });
    if(run.path.length===0){const note=document.createElement("div");note.textContent="まだカットがありません";els.reel.append(note);}
    $("replayButton").disabled=run.path.length===0;
    renderHud();showOverlay(els.result);
    if(win)tone(740,.26,"triangle");
    try {
      const best=Number(localStorage.getItem("motion-chain-best")||0);
      if(run.score>best)localStorage.setItem("motion-chain-best",String(run.score));
    }catch(_){}
  }
  function beginReplay() {
    if(run.path.length<1)return;
    replayPlan=run.path.map(x=>({...x}));
    replayIndex=0;run.phase="replay";run.paused=false;showOverlay(null);
    enterNode(replayPlan[0].node);tone(540,.1,"sine");
  }
  function pause() {
    if(!["playing","replay"].includes(run.phase)||run.paused)return;
    run.paused=true;pausedAt=performance.now();els.video.pause();showOverlay(els.pause);
  }
  function resume() {
    if(!run.paused)return;
    const delta=performance.now()-pausedAt;enteredAt+=delta;run.paused=false;
    showOverlay(null);
    if(els.video.src)els.video.play().catch(()=>{});
  }
  function home() {
    run.phase="title";run.paused=false;stopMedia();showOverlay(els.title);
  }
  function openMedia() {
    mediaBefore=run.phase;
    if(["playing","replay"].includes(run.phase) && !run.paused) {
      run.paused=true;pausedAt=performance.now();els.video.pause();
    }
    showOverlay(els.media);updateAssetState();
  }
  function closeMedia() {
    showOverlay(null);
    if(mediaBefore==="title")showOverlay(els.title);
    else if(run.paused && ["playing","replay"].includes(run.phase)) {
      enteredAt+=performance.now()-pausedAt;run.paused=false;
      if(els.video.src)els.video.play().catch(()=>{});
    } else if(mediaBefore==="result")showOverlay(els.result);
  }
  function updateAssetState(){
    const id=els.clipNode.value;
    const asset=getClip(id);
    els.assetState.textContent="現在: "+(asset?asset.name:"試作アニマティック")+
      " / 割当数 "+(Object.keys(manifest).length+library.size);
  }
  function onClipFile() {
    const file=els.clipFile.files?.[0],id=els.clipNode.value;
    if(!file || !id)return;
    if(!/^(video\/(mp4|webm|quicktime)|image\/(gif|webp))$/.test(file.type)) {
      els.assetState.textContent="非対応の形式です。MP4 / WebM / GIF / WebPを選択してください";return;
    }
    if(file.size>120*1024*1024){els.assetState.textContent="ファイルが大きすぎます（120MB以下）";return;}
    const existing=library.get(id);if(existing)URL.revokeObjectURL(existing.url);
    library.set(id,{url:URL.createObjectURL(file),type:file.type,name:file.name});
    els.clipFile.value="";updateAssetState();
    if(currentNode.id===id && ["playing","replay"].includes(run.phase))loadMedia(currentNode);
    tone(700,.09,"triangle");
  }
  function clearClip(){
    const id=els.clipNode.value,old=library.get(id);
    if(old){URL.revokeObjectURL(old.url);library.delete(id);}
    updateAssetState();if(id===currentNode.id && ["playing","replay"].includes(run.phase))loadMedia(currentNode);
  }
  function tick(now) {
    if(["playing","replay"].includes(run.phase) && !run.paused){
      const node=currentNode,elapsed=now-enteredAt,frac=clamp(elapsed/node.duration);
      els.timingNeedle.style.left=(frac*100)+"%";
      els.time.textContent=(elapsed/1000).toFixed(2)+"s";
      if(run.phase==="playing" && !node.terminal) {
        const ready=frac<node.window[0],late=frac>node.window[1];
        const locked=!!pendingChoice;
        els.windowLabel.className="window-label "+(ready?"":late?"late":"open");
        els.windowLabel.textContent=locked?"LOCKED":ready?"WATCH":late?"LATE":node.cutAt?"BRANCH":"CUT NOW";
        if(node.cutAt){
          if(frac >= (node.cueAt ?? 0))els.tell.textContent=node.tell;
          els.timingHint.textContent=locked?"選択した動きへ、自然な接続点で切り替えます":
            ready?"敵の肩・拳・重心を見よう":late?"選択可能時間を過ぎた":"今の動きに合う次の展開を選ぼう";
        }else{
          els.timingHint.textContent=ready?"敵の予兆を見極めよう":late?"好機を逃した！ リテイクも可能":"いま選べば技がつながる！";
        }
      }
      if(run.phase==="playing" && node.cutAt && pendingChoice && frac>=node.cutAt){
        const selected=pendingChoice;
        pendingChoice=null;
        commitChoice(node,selected.choice,selected.fraction,false);
      } else if(run.phase==="playing" && elapsed>=node.duration){
        if(node.terminal)finish(node.terminal);
        else choose(null,true);
      } else if(run.phase==="replay") {
        const next=replayPlan[replayIndex];
        if(next && next.node===node.id && frac>=next.at) {
          flash(next.rating==="perfect"?"PERFECT CUT":next.rating==="miss"?"MISSED CUT":"GOOD CUT",next.rating==="miss");
          replayIndex++;
          enterNode(next.next);
        }else if(node.terminal && elapsed>=node.duration)finish(run.outcome||node.terminal);
        else if(!next && !node.terminal && elapsed>=node.duration)finish(run.outcome||"survived");
      }
    }
    requestAnimationFrame(tick);
  }
  Object.entries(graph).forEach(([id,node])=>{
    const opt=document.createElement("option");opt.value=id;opt.textContent=node.shot+" · "+node.title;
    els.clipNode.append(opt);
  });
  els.clipNode.addEventListener("change",updateAssetState);
  els.clipFile.addEventListener("change",onClipFile);
  $("startButton").addEventListener("click",start);
  $("restartButton").addEventListener("click",start);
  $("replayButton").addEventListener("click",beginReplay);
  $("resultRetakeButton").addEventListener("click",retake);
  els.retake.addEventListener("click",retake);
  $("pauseButton").addEventListener("click",pause);
  $("resumeButton").addEventListener("click",resume);
  $("pauseExitButton").addEventListener("click",home);
  $("libraryButton").addEventListener("click",openMedia);
  $("titleClipsButton").addEventListener("click",openMedia);
  $("closeMediaButton").addEventListener("click",closeMedia);
  $("clearClipButton").addEventListener("click",clearClip);
  $("muteButton").addEventListener("click",()=>{
    silent=!silent;$("muteButton").textContent=silent?"♪̸":"♪";
    $("muteButton").setAttribute("aria-label",silent?"サウンドをオン":"サウンドをオフ");
    if(!silent)tone(560,.08,"sine");
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden && ["playing","replay"].includes(run.phase))pause();
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape") {
      if(els.media.classList.contains("visible"))closeMedia();
      else if(els.pause.classList.contains("visible"))resume();
      else pause();
    }
    if(["playing"].includes(run.phase) && !run.paused && ["1","2","3"].includes(event.key)){
      choose(currentNode.choices?.[Number(event.key)-1]?.id);
    }
  });
  // Optional committed manifest maps node IDs to repository-hosted MP4/GIF files.
  fetch("assets/manifest.json",{cache:"no-cache"}).then(res=>res.ok?res.json():{})
    .then(data=>{if(data && typeof data==="object" && !Array.isArray(data))manifest=data;updateAssetState();})
    .catch(()=>{});
  showOverlay(els.title);renderHud();requestAnimationFrame(tick);
})();
