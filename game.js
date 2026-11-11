(() => {
  'use strict';
  const {Game,MONSTERS,ITEM,W,H}=window.DeepWeave;
  const VIEW_W=9,VIEW_H=11,STORE='deep-weave-run-v2';
  const $=id=>document.getElementById(id);
  const board=$('board'),ctx=board.getContext('2d',{alpha:false});
  const minimap=$('minimapCanvas'),miniCtx=minimap.getContext('2d');
  const floorLabel=$('floorLabel'),floorName=$('floorName'),hpText=$('hpText'),hpBar=$('hpBar');
  const atkText=$('atkText'),turnText=$('turnText'),scoreText=$('scoreText');
  const recent=$('recent'),bag=$('bag'),tooltip=$('tooltip'),toastEl=$('toast'),sheet=$('sheet'),modal=$('modal'),hint=$('hint');
  let game,camX=0,camY=0,scale=1,lastFrame=0,aim=-1,selection=null,autoTimer=0,autoTarget=null,gesture=null,pressTimer=0,toastTimer=0,modalMode='';
  let soundEnabled=false,audioContext=null;
  let particles=[],armedTrap=null,flashUntil=0,quickSuggestion=null;
  let lastEffectSeq=0,activeVfx=[],quickPreview=new Set();
  function load(){
    try{const raw=localStorage.getItem(STORE);if(raw){game=Game.restore(raw);return true;}}catch(e){console.warn('Save unavailable',e);}
    game=new Game();return false;
  }
  function save(){try{localStorage.setItem(STORE,game.serialize());}catch(e){}}
  function clearSave(){try{localStorage.removeItem(STORE);}catch(e){}}
  function sound(freq=360,dur=.09){
    if(!soundEnabled)return;
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
      audioContext=audioContext||new Ctx();
      if(audioContext.state==='suspended')audioContext.resume();
      const t=audioContext.currentTime,osc=audioContext.createOscillator(),gain=audioContext.createGain();
      osc.type='triangle';osc.frequency.setValueAtTime(freq,t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(100,freq*.55),t+dur);
      gain.gain.setValueAtTime(.07,t);gain.gain.exponentialRampToValueAtTime(.0001,t+dur);
      osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+dur);
    }catch(e){}
  }
  function showToast(message){
    toastEl.textContent=message;toastEl.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),2200);
  }
  // Fixed HUD projection of the existing run log. It does not consume a turn,
  // allocate gameplay state or intercept gestures on the canvas beneath it.
  function renderBattleLog(){
    const parent=$('battleLogLines');
    const events=game.log.length?game.log.slice(0,3):[{turn:game.turn,text:'影の底へ進もう。'}];
    const fragment=document.createDocumentFragment();
    for(let i=0;i<events.length;i++){
      const event=events[i];
      const line=document.createElement('div');line.className='battle-log-line'+(i===0?' newest':'');
      const turn=document.createElement('span');turn.className='battle-log-turn';turn.textContent='T'+event.turn;
      const msg=document.createElement('span');msg.className='battle-log-message';msg.textContent=event.text;
      line.append(turn,msg);fragment.appendChild(line);
    }
    parent.replaceChildren(fragment);
  }
  // Draw only knowledge the player has earned. Unknown tiles stay transparent,
  // and monsters/items appear solely in the CURRENT field of vision.
  function drawMiniMap(){
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const cell=5,logicalW=W*cell,logicalH=H*cell;
    const newWidth=Math.round(logicalW*dpr),newHeight=Math.round(logicalH*dpr);
    if(minimap.width!==newWidth||minimap.height!==newHeight){
      minimap.width=newWidth;minimap.height=newHeight;
    }
    miniCtx.setTransform(dpr,0,0,dpr,0,0);
    miniCtx.clearRect(0,0,logicalW,logicalH);
    const tiles={
      floor:'rgba(170,221,233,.66)',water:'rgba(97,193,231,.69)',
      ice:'rgba(184,242,255,.77)',oil:'rgba(186,151,228,.66)',
      bush:'rgba(138,217,155,.66)'
    };
    let explored=0,currentlyVisible=0,unknown=0,visibleEnemies=0,firstUnknown=null;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const tile=game.tile(x,y),left=x*cell,top=y*cell;
      if(!tile.seen){unknown++;if(!firstUnknown)firstUnknown={x,y};continue;}
      explored++;
      if(tile.lit)currentlyVisible++;
      if(tile.t==='wall'){
        // Walls provide silhouettes; walkable passages stay distinctly bright.
        miniCtx.fillStyle='rgba(122,151,164,.29)';
        miniCtx.fillRect(left,top,cell,cell);
      }else{
        miniCtx.fillStyle=tiles[tile.t]||tiles.floor;
        miniCtx.fillRect(left+.45,top+.45,cell-.9,cell-.9);
        // Keep the exploration map useful even after leaving a chamber.
        if(!tile.lit){
          miniCtx.fillStyle='rgba(4,17,27,.20)';
          miniCtx.fillRect(left+.45,top+.45,cell-.9,cell-.9);
        }
      }
    }
    // Landmarks only once explored.
    if(game.tile(game.stairs.x,game.stairs.y)?.seen){
      miniCtx.fillStyle='#ffc46d';
      miniCtx.fillRect((game.stairs.x+.05)*cell,(game.stairs.y+.05)*cell,cell*.9,cell*.9);
    }
    for(const obj of game.items){
      if(!game.tile(obj.x,obj.y)?.lit)continue;
      miniCtx.fillStyle='#d3a4ff';
      miniCtx.fillRect((obj.x+.25)*cell,(obj.y+.25)*cell,cell*.5,cell*.5);
    }
    for(const trap of game.traps){
      if(!trap.known||trap.used||!game.tile(trap.x,trap.y)?.lit)continue;
      miniCtx.fillStyle='#ffad6d';
      miniCtx.fillRect((trap.x+.32)*cell,(trap.y+.32)*cell,cell*.36,cell*.36);
    }
    for(const enemy of game.enemies){
      if(enemy.hp<=0||!game.tile(enemy.x,enemy.y)?.lit)continue;
      visibleEnemies++;
      miniCtx.fillStyle='#ff655d';
      miniCtx.beginPath();
      miniCtx.arc((enemy.x+.5)*cell,(enemy.y+.5)*cell,cell*.65,0,Math.PI*2);
      miniCtx.fill();
    }
    // Bright hero dot + dark ring remains legible against water or ice.
    const px=(game.player.x+.5)*cell,py=(game.player.y+.5)*cell;
    miniCtx.strokeStyle='rgba(3,21,29,.95)';miniCtx.lineWidth=1.8;
    miniCtx.fillStyle='#ffe792';
    miniCtx.beginPath();miniCtx.arc(px,py,cell*.93,0,Math.PI*2);
    miniCtx.fill();miniCtx.stroke();
    $('minimapFloor').textContent='B'+game.floor;
    return {explored,currentlyVisible,unknown,visibleEnemies,firstUnknown,
      width:logicalW,height:logicalH,player:{...game.player}};
  }
  function refresh(){
    const s=game.status();
    floorLabel.textContent='B'+s.floor+' / '+s.maxFloor;
    floorName.textContent=s.theme;
    hpText.textContent=s.hp+' / '+s.maxHp;
    hpBar.style.width=(100*s.hp/s.maxHp)+'%';
    hpBar.classList.toggle('low',s.hp/s.maxHp<.35);
    atkText.textContent=s.attack;turnText.textContent=s.turn;scoreText.textContent=s.score;
    const last=game.log[0];recent.textContent=last?last.text:'影の底へ進もう。';
    renderBattleLog();
    bag.textContent=game.inventory.length+'/8';
    drawMiniMap();
    quickSuggestion=game.suggestSkill();
    quickPreview=new Set();
    if(quickSuggestion&&quickSuggestion.type==='spark'){
      for(const point of game.conductor(quickSuggestion.x,quickSuggestion.y)){
        if(game.tile(point.x,point.y)?.lit)quickPreview.add(point.x+','+point.y);
      }
    }
    const quick=$('skillButton');
    quick.disabled=!quickSuggestion||aim>=0||!s.alive||s.won;
    quick.classList.toggle('ready',!quick.disabled);
    const quickType=quickSuggestion?ITEM[quickSuggestion.type]:null;
    $('skillGlyph').textContent=quickType?quickType.glyph:'✦';
    $('skillGlyph').style.color=quickType?quickType.color:'';
    $('skillLabel').textContent=quickSuggestion?quickSuggestion.name:'属性技';
    $('skillInfo').textContent=quickSuggestion?
      (quickPreview.size>1?'見える連鎖 '+quickPreview.size+'マス':'1タップ発動'):'敵を発見で発動';
    quick.setAttribute('aria-label',quickSuggestion?'属性技を発動：'+quickSuggestion.name:'発動可能な属性技はありません');
    const warning=game.enemies.find(e=>game.tile(e.x,e.y)?.lit&&(e.cast||e.windup));
    hint.textContent=aim>=0?'使う場所や敵をタップ · ✕ で解除':
      warning?(warning.windup?'⚠ 重装獣の強攻撃を回避！':
        warning.cast==='arrow'?'⚠ 射手が狙っている！壁・煙の陰へ':'⚠ 火術の詠唱中！退避しよう'):
      autoTarget?'自動移動中 · 敵・罠を見つけると停止':
      quickSuggestion?'✦ '+quickSuggestion.name+'が発動可能 · 属性技をタップ':
      'タップで進む · スワイプで1歩 · 長押しで調べる';
    $('cancelAim').hidden=aim<0;
    $('cancelAim').classList.toggle('active',aim>=0);
    $('soundButton').textContent=soundEnabled?'♪':'♫̸';
    $('soundButton').setAttribute('aria-label',soundEnabled?'音を消す':'音を出す');
    if((!s.alive||s.won)&&modal.hidden)showEnding();
    updateInfo();
    save();
  }
  function startNew(){
    stopAuto();aim=-1;selection=null;armedTrap=null;
    game=new Game();lastEffectSeq=0;activeVfx=[];quickPreview=new Set();quickSuggestion=null;
    clearSave();save();hideSheet();hideModal();refresh();showToast('新たな探索が始まった');
  }
  function hideModal(){modal.hidden=true;modalMode='';}
  function showModal(title,html,buttons){
    hideSheet();modalMode=title;
    $('modalTitle').textContent=title;$('modalBody').innerHTML=html;
    const bar=$('modalActions');bar.innerHTML='';
    for(const b of buttons){
      const button=document.createElement('button');
      button.textContent=b.label;button.className='modal-button '+(b.primary?'primary':'');
      button.addEventListener('click',b.click);bar.appendChild(button);
    }
    modal.hidden=false;
  }
  function showIntro(returning){
    showModal('深界の織り手',
      '<div class="intro-emblem">✧</div><p><strong>指一本で挑む、12層の深淵。</strong></p>'+
      '<p>毎回姿を変える地下遺跡から「星の核」を持ち帰ろう。動かなければ敵も動かない。水・電気・炎・風を使い、道を切り開く。</p>'+
      '<div class="intro-keys"><span>タップ　移動・攻撃</span><span>スワイプ　1歩</span><span>長押し　調べる</span><span>✦ 属性技　1タップ</span></div>',
      [{label:returning?'冒険を再開':'探索を始める',primary:true,click:()=>{hideModal();refresh();}},
       {label:'操作説明',click:()=>showHelp()}]
    );
  }
  function showHelp(){
    stopAuto();
    showModal('探索の手引き',
      '<p><b>タップ</b>：床なら移動。離れた床は安全な範囲で経路をたどる。敵なら接近・攻撃。階段に乗ると次の層。</p>'+
      '<p><b>スワイプ</b>：8方向へ1歩。隣の敵に向かってスワイプすると近接攻撃。危険な敵のそばではこちらが確実。</p>'+
      '<p><b>長押し</b>：敵・地形・道具の情報。長押ししてドラッグすると経路指定。</p>'+
      '<p><b>✦ 属性技</b>：現在見えている敵だけをもとに技と目標を提案。未発見の敵を自動検知しない。光ったら1タップ発動・道具1個消費。</p>'+
      '<p><b>道具</b>：鞄から道具を選んで好きな場所に使うこともできる。薬はすぐ使用。</p>'+
      '<p><b>連鎖</b>：水・氷の接続全体を雷が走る。起点から遠いほど弱まり、石の衛兵は雷に強く、水精は弱い。氷結・延焼・突風も活用。</p>'+
      '<p><b>技の補充</b>：4体倒すごとに属性技を1つ、階層移動でも1つ補充（道具袋に空きがある場合）。</p>'+
      '<p><b>自分の技は安全</b>：自分の火種から生じた炎ではダメージを受けない。敵が作った炎は危険。</p>'+
      '<p><b>ターン</b>：移動、攻撃、道具使用、待機でのみ敵が動く。長押しやメニューでは進まない。死亡で探索終了。</p>',
      [{label:'図鑑を見る',click:()=>showLegend('terrain')},
       {label:'戻る',primary:true,click:()=>{hideModal();refresh();}}]
    );
  }

  // The atlas is rendered by the SAME tile/sprite functions as the live game,
  // so descriptions always match what is shown on the board.
  const LEGEND_TERRAIN=[
    {name:'自分',desc:'水色の冒険者。タップした場所まで移動する。',tile:'floor',feature:'player'},
    {name:'下り階段',desc:'金色の入口。踏むと次の階層へ。12階層の奥に星の核がある。',tile:'floor',feature:'stairs'},
    {name:'岩壁',desc:'通れない。敵の視線や飛び道具も遮る。',tile:'wall'},
    {name:'石床',desc:'歩ける通常の床。',tile:'floor'},
    {name:'未探索',desc:'まだ見えていない暗闇。近づいて明らかにしよう。',tile:'floor',unseen:true},
    {name:'水脈',desc:'接続している水・氷の全域に雷が伝播。遠いほどダメージと足止めが弱まる。',tile:'water'},
    {name:'氷床',desc:'水を凍らせた床。雷も水と氷を連鎖して流れる。',tile:'ice'},
    {name:'油溜まり',desc:'暗い紫の床。炎に触れると燃え広がる。',tile:'oil'},
    {name:'茂み',desc:'緑の草。油と同じく炎が燃え移る。',tile:'bush'},
    {name:'炎',desc:'敵の炎は毎ターン3ダメージ。自分の火種・伝播炎は自分に無害。',tile:'floor',fire:3},
    {name:'煙',desc:'煙玉で発生。敵の射線を遮る。',tile:'floor',smoke:4},
    {name:'針の罠',desc:'周囲2マスで発見。自動移動は避け、手動操作では2回確認。敵を押し込める。',tile:'floor',feature:'trap'}
  ];
  function legendEntries(section){
    if(section==='enemies')return Object.entries(MONSTERS).map(([type,d])=>({
      name:d.name,desc:'HP '+d.hp+' ・攻撃 '+d.atk+'。'+
        ({sprout:'標準的な近接型。',runner:'身軽な近接型。',archer:'4マス以内から矢を射る。',guard:'頑丈でダメージが通りにくい。',eel:'水中の相手には追加ダメージ。',witch:'足元に火を放つ。',brute:'強攻撃の前に予備動作がある。'}[type]||''),
      tile:'floor',enemy:type}));
    if(section==='items')return Object.entries(ITEM).map(([type,d])=>({name:d.name,desc:d.desc,tile:'floor',item:type}));
    return LEGEND_TERRAIN;
  }
  function renderLegendSample(canvas,entry){
    const side=72;canvas.width=side;canvas.height=side;
    const c=canvas.getContext('2d',{alpha:false});
    if(!c)return;
    c.fillStyle='#152831';c.fillRect(0,0,side,side);
    drawTile(-200,-200,0,0,600,c,side,{
      t:entry.tile,seen:!entry.unseen,lit:!entry.unseen,
      fire:entry.fire||0,smoke:entry.smoke||0,
      feature:entry.feature||null,item:entry.item||null,enemy:entry.enemy||null
    });
  }
  function showLegend(section='terrain'){
    stopAuto();aim=-1;tooltip.hidden=true;
    const sections=[['terrain','地形・記号'],['enemies','敵'],['items','道具']];
    const valid=sections.some(([id])=>id===section)?section:'terrain';
    const entries=legendEntries(valid);
    const tabs=sections.map(([id,title])=>
      '<button type="button" role="tab" aria-selected="'+(id===valid)+
      '" class="atlas-tab'+(id===valid?' selected':'')+'" data-tab="'+id+'">'+title+'</button>').join('');
    const rows=entries.map((item,i)=>
      '<div class="atlas-item"><canvas width="72" height="72" class="atlas-art" data-example="'+i+
      '" role="img" aria-label="'+item.name+'のゲーム内の見た目"></canvas>'+
      '<div class="atlas-copy"><strong>'+item.name+'</strong><span>'+item.desc+'</span></div></div>').join('');
    showModal('絵と記号の図鑑',
      '<p class="atlas-intro">実際のゲーム画面と同じ描画で、見た目と意味を確認できます。</p>'+
      '<nav class="atlas-tabs" role="tablist" aria-label="図鑑の種類">'+tabs+'</nav>'+
      '<div class="atlas-list">'+rows+'</div>'+
      '<p class="atlas-foot">ゲーム中もマスを長押しすると、その場の名前と効果が分かります。図鑑はターンを消費しません。</p>',
      [{label:'ゲームに戻る',primary:true,click:()=>{hideModal();refresh();}}]);
    const box=$('modalBody');
    box.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>showLegend(el.dataset.tab)));
    box.querySelectorAll('canvas[data-example]').forEach(el=>{
      const entry=entries[Number(el.dataset.example)];if(entry)renderLegendSample(el,entry);
    });
    refresh();
  }
  function showEnding(){
    stopAuto();
    const win=game.won;
    showModal(win?'深淵を踏破！':'冒険の終わり',
      '<div class="intro-emblem">'+(win?'✦':'◈')+'</div>'+
      '<p>'+(win?'星の核を取り戻した。おめでとう！':'この冒険はここまで。次はどんな道が開けるだろう。')+'</p>'+
      '<div class="end-stats"><span>到達 B'+game.floor+'</span><span>歩数 '+game.turn+'</span><span>撃破 '+game.kills+'</span><span>得点 '+game.score+'</span></div>',
      [{label:'新しい冒険',primary:true,click:()=>startNew()}]
    );
  }
  function openBag(){
    stopAuto();aim=-1;refresh();
    const entries=game.inventory.map((it,index)=>{
      const d=ITEM[it.type];
      return '<button class="item-row" data-index="'+index+'"><span class="item-glyph" style="color:'+d.color+'">'+d.glyph+'</span>'+
        '<span class="item-copy"><strong>'+d.name+'</strong><small>'+d.desc+'</small></span><span class="item-next">›</span></button>';
    }).join('');
    sheet.innerHTML='<div class="sheet-head"><span>道具袋 <small>'+game.inventory.length+' / 8</small></span><button id="closeSheet" aria-label="閉じる">×</button></div>'+
      (entries||'<p class="empty">道具がない。探索して拾おう。</p>')+
      '<p class="sheet-note">道具の使用も1ターンを消費する。拾うのは無料。</p>';
    sheet.hidden=false;$('closeSheet').onclick=hideSheet;
    sheet.querySelectorAll('.item-row').forEach(el=>el.onclick=()=>chooseItem(Number(el.dataset.index)));
  }
  function hideSheet(){sheet.hidden=true;}
  function chooseItem(index){
    const it=game.inventory[index];if(!it)return;
    hideSheet();
    if(it.type==='heal'){
      const oldTurn=game.turn;const res=game.useItem(index,game.player.x,game.player.y);
      if(!res.ok){showToast('HPが満タンなので使えない');return;}
      sound(570);afterAction(oldTurn);return;
    }
    aim=index;selection=null;
    showToast(ITEM[it.type].name+'：対象をタップ');refresh();
  }
  function stopAuto(){if(autoTimer){clearTimeout(autoTimer);autoTimer=0;}autoTarget=null;selection=null;}
  function afterAction(oldTurn){
    if(game.turn!==oldTurn && /ダメージ|倒した|命中|攻撃/.test(game.log[0]?.text||''))flashUntil=performance.now()+180;
    if(game.turn!==oldTurn){sound(game.log[0]?.text.includes('ダメージ')?190:410,.055);}
    if(!game.alive||game.won)stopAuto();
    refresh();
  }
  function step(dx,dy){
    stopAuto();aim=-1;
    const x=game.player.x+dx,y=game.player.y+dy;
    const trap=game.trapAt(x,y);
    if(trap?.known){
      if(!armedTrap||armedTrap.x!==x||armedTrap.y!==y){
        armedTrap={x,y};showTile(x,y);
        showToast('針の罠！ もう一度同じ方向で踏む／回り道を選択');
        refresh();return;
      }
    }
    armedTrap=null;
    const old=game.turn,r=game.move(dx,dy);
    if(!r.ok&&r.reason==='wall'){
      sound(120,.055);
      const corner=dx&&dy&&game.walkable(x,y)&&game.blockedDiagonal(game.player.x,game.player.y,x,y);
      showToast(corner?'壁の角で斜めに進めない。迂回しよう':'そこには進めない');
    }else if(r.ok)afterAction(old);
    refresh();
  }
  function beginPath(x,y,enemyTarget){
    stopAuto();armedTrap=null;
    if(x===game.player.x&&y===game.player.y){return;}
    const path=game.pathTo(x,y,!!enemyTarget);
    if(!path.length){showToast(enemyTarget?'攻撃できる位置への道がない':'そこへ続く道がない');return;}
    autoTarget={x,y,enemyId:enemyTarget?enemyTarget.id:null,path};
    selection={x,y};
    // Safe traversal stops when an enemy becomes a visible immediate threat.
    const advancePath=()=>{
      autoTimer=0;if(!autoTarget||!game.alive||game.won)return;
      const target=autoTarget,next=target.path.shift();
      if(!next){finishAuto();return;}
      if(game.enemyAt(next.x,next.y)){stopAuto();showToast('敵が道を塞いでいる');refresh();return;}
      if(game.trapAt(next.x,next.y)?.known||game.tile(next.x,next.y)?.fire>0){
        stopAuto();showToast('危険な床を発見。自動移動を停止した');refresh();return;
      }
      const old=game.turn,dx=next.x-game.player.x,dy=next.y-game.player.y;
      const wasDanger=game.canSeeDanger();
      const r=game.move(dx,dy);
      if(!r.ok){stopAuto();refresh();return;}
      afterAction(old);
      if(!game.alive||game.won||r.descended){stopAuto();return;}
      if(game.canSeeDanger()||wasDanger){stopAuto();showToast('敵や危険を察知。自動移動を停止');refresh();return;}
      if(target.path.length)autoTimer=setTimeout(advancePath,125);
      else finishAuto();
    };
    const finishAuto=()=>{
      if(!autoTarget)return;
      const id=autoTarget.enemyId;stopAuto();
      if(id&&game.enemies.some(e=>e.id===id))
        showToast('敵の前で停止。タップで攻撃（危険なら距離を取ろう）');
      refresh();
    };
    autoTimer=setTimeout(advancePath,75);refresh();
  }
  function chooseCell(x,y){
    if(modal.hidden===false||sheet.hidden===false)return;
    if(autoTarget){stopAuto();refresh();return;}
    if(!game.inside(x,y))return;
    if(aim>=0){
      const old=game.turn,it=game.inventory[aim];
      if(!it){aim=-1;refresh();return;}
      const res=game.useItem(aim,x,y);
      if(res.ok){aim=-1;sound(740,.17);afterAction(old);}
      else showToast(res.reason==='range'?'射程外・壁や煙で狙えない':res.reason==='target'?(it.type==='ember'?'燃やせる床を選んで':'吹き飛ばす敵を選んで'):'使用できない');
      refresh();return;
    }
    const t=game.tile(x,y);if(!t||!t.seen){showToast('まだ見えない場所');return;}
    const enemy=t.lit?game.enemyAt(x,y):null;
    const dx=x-game.player.x,dy=y-game.player.y;
    if(enemy&&Math.max(Math.abs(dx),Math.abs(dy))===1){
      if(game.blockedDiagonal(game.player.x,game.player.y,x,y)){
        showToast('角越しには攻撃できない。回り込み経路を確認');
        beginPath(x,y,enemy);return;
      }
      step(dx,dy);return;
    }
    if(Math.max(Math.abs(dx),Math.abs(dy))===1){step(dx,dy);return;}
    if(dx===0&&dy===0){showTile(x,y);return;}
    beginPath(x,y,enemy);
  }
  function showTile(x,y){
    const info=game.inspect(x,y);
    tooltip.innerHTML='<strong>'+info.name+'</strong><span>'+info.desc+'</span>';
    tooltip.hidden=false;clearTimeout(tooltip._timer);
    tooltip._timer=setTimeout(()=>tooltip.hidden=true,3200);
    selection={x,y};
  }
  function screenCell(clientX,clientY){
    const r=board.getBoundingClientRect();
    const col=Math.floor((clientX-r.left)/r.width*VIEW_W);
    const row=Math.floor((clientY-r.top)/r.height*VIEW_H);
    if(col<0||col>=VIEW_W||row<0||row>=VIEW_H)return null;
    return {x:camX+col,y:camY+row};
  }
  board.addEventListener('pointerdown',e=>{
    if(!modal.hidden||!sheet.hidden)return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault();stopAuto();board.setPointerCapture(e.pointerId);
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,at:performance.now(),long:false};
    clearTimeout(pressTimer);
    pressTimer=setTimeout(()=>{
      if(!gesture||gesture.id!==e.pointerId)return;
      if(Math.hypot(gesture.x-e.clientX,gesture.y-e.clientY)>30)return;
      gesture.long=true;const p=screenCell(gesture.x,gesture.y);
      if(p)showTile(p.x,p.y);
      if(navigator.vibrate)navigator.vibrate(12);
    },460);
  },{passive:false});
  board.addEventListener('pointermove',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;
    if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>22&&!gesture.long)clearTimeout(pressTimer);
    if(gesture.long){const p=screenCell(e.clientX,e.clientY);if(p)selection=p;}
  });
  board.addEventListener('pointerup',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;
    e.preventDefault();clearTimeout(pressTimer);
    const g=gesture;gesture=null;
    const dx=e.clientX-g.x,dy=e.clientY-g.y,travel=Math.hypot(dx,dy);
    if(g.long){if(travel>30){const p=screenCell(e.clientX,e.clientY);if(p)chooseCell(p.x,p.y);}return;}
    if(travel>26){
      const mx=Math.abs(dx),my=Math.abs(dy);
      const sx=mx>=my*.38?Math.sign(dx):0,sy=my>=mx*.38?Math.sign(dy):0;
      if(sx||sy)step(sx,sy);
      return;
    }
    const p=screenCell(e.clientX,e.clientY);if(p)chooseCell(p.x,p.y);
  },{passive:false});
  board.addEventListener('pointercancel',()=>{gesture=null;clearTimeout(pressTimer);});
  board.addEventListener('contextmenu',e=>e.preventDefault());
  board.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
  document.addEventListener('keydown',e=>{
    if(!modal.hidden){if(e.key==='Escape'){hideModal();refresh();}return;}
    if(!sheet.hidden){if(e.key==='Escape')hideSheet();return;}
    if(e.key==='Escape'){aim=-1;stopAuto();refresh();return;}
    const dirs={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0],w:[0,-1],s:[0,1],a:[-1,0],d:[1,0],q:[-1,-1],e:[1,-1],z:[-1,1],c:[1,1]};
    const dir=dirs[e.key];if(dir){e.preventDefault();step(...dir);}
    else if(e.key===' '){e.preventDefault();const old=game.turn;game.wait();afterAction(old);}
    else if(e.key==='i')openBag();
  });
  $('bagButton').onclick=openBag;
  $('legendButton').onclick=()=>showLegend('terrain');
  $('historyButton').addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();$('historyButton').click();}
  });
  $('historyButton').addEventListener('click',()=>{
    const messages=game.log.map(e=>'<div class="log-entry"><span>TURN '+e.turn+'</span> '+e.text+'</div>').join('');
    showModal('冒険の記録',messages||'<p>まだ記録がありません。</p>',
      [{label:'冒険に戻る',primary:true,click:()=>{hideModal();refresh();}}]);
  });
  $('skillButton').onclick=()=>{
    if(!game.alive||game.won||!modal.hidden||!sheet.hidden)return;
    stopAuto();aim=-1;selection=null;
    // Recompute to avoid a stale target after enemy movement.
    const suggestion=game.suggestSkill();
    if(!suggestion){showToast('いま使える属性連鎖がない');refresh();return;}
    const old=game.turn;
    const result=game.useItem(suggestion.index,suggestion.x,suggestion.y);
    if(result.ok){
      sound(suggestion.type==='spark'?900:suggestion.type==='ember'?480:650,.18);
      showToast(ITEM[suggestion.type].glyph+' '+suggestion.name+'！');
      afterAction(old);
    }else showToast('属性技の発動条件を満たしていない');
    refresh();
  };
  $('waitButton').onclick=()=>{stopAuto();const old=game.turn;game.wait();afterAction(old);};
  $('helpButton').onclick=showHelp;
  $('soundButton').onclick=()=>{soundEnabled=!soundEnabled;sound(500);refresh();};
  $('cancelAim').onclick=()=>{aim=-1;refresh();};
  $('newButton').onclick=()=>showModal('冒険をやり直す？',
    '<p>今の冒険の進行は失われます。死亡時と同じく、前の冒険には戻れません。</p>',
    [{label:'続ける',primary:true,click:hideModal},{label:'新しい冒険',click:startNew}]);
  $('sheetBackdrop').onclick=hideSheet;
  function updateInfo(){
    $('viewFloor').textContent='B'+game.floor;
    $('viewTurn').textContent='TURN '+game.turn;
  }
  function resize(){
    const r=board.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    board.width=Math.max(1,Math.round(r.width*dpr));board.height=Math.max(1,Math.round(r.height*dpr));
    scale=r.width/VIEW_W;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  const hash=(x,y)=>{let n=(x*73856093^y*19349663^game.seed)>>>0;n^=n>>>13;n=Math.imul(n,1274126177);return (n>>>0)/4294967295;};
  function sprite(x,y,t,c=ctx,cell=scale){
    const s=cell,px=x*s,py=y*s,cx=px+s/2,cy=py+s/2;
    const rim=(color)=>{c.strokeStyle=color;c.lineWidth=1.15;};
    if(t==='player'){
      c.shadowColor='#72d8ff';c.shadowBlur=10;
      c.fillStyle='#f7dba6';c.beginPath();c.arc(cx,py+s*.4,s*.17,0,Math.PI*2);c.fill();
      c.fillStyle='#5ba9b8';c.beginPath();c.moveTo(cx,py+s*.42);c.lineTo(cx-s*.25,py+s*.8);c.lineTo(cx+s*.24,py+s*.8);c.closePath();c.fill();
      c.shadowBlur=0;c.fillStyle='#e8faff';c.fillRect(cx+s*.13,py+s*.36,s*.07,s*.43);
      c.fillStyle='#16394d';c.fillRect(cx-s*.12,py+s*.38,s*.055,s*.045);
      return;
    }
    if(t in MONSTERS){
      const d=MONSTERS[t],tone=d.color;
      c.shadowColor=tone;c.shadowBlur=5;
      c.fillStyle=tone;c.beginPath();
      if(t==='eel'){c.ellipse(cx,cy,s*.3,s*.18,.5,0,Math.PI*2);}
      else{c.ellipse(cx,cy+s*.07,t==='brute'?s*.35:s*.27,t==='guard'?s*.33:s*.26,0,0,Math.PI*2);}
      c.fill();c.shadowBlur=0;
      c.fillStyle='#15232a';c.fillRect(cx-s*.13,cy-s*.07,s*.08,s*.07);c.fillRect(cx+s*.065,cy-s*.07,s*.08,s*.07);
      if(t==='guard'||t==='brute'){rim('#e8e4d2');c.beginPath();c.moveTo(cx-s*.24,cy-s*.13);c.lineTo(cx-s*.15,cy-s*.35);c.moveTo(cx+s*.24,cy-s*.13);c.lineTo(cx+s*.15,cy-s*.35);c.stroke();}
      return;
    }
  }
  function drawTile(x,y,col,row,time,c=ctx,cell=scale,override=null){
    const t=override || game.tile(x,y);if(!t)return;
    const s=cell,px=col*s,py=row*s,v=hash(x,y),theme=game.theme();
    if(!t.seen){
      c.fillStyle='#08121a';c.fillRect(px,py,s+.5,s+.5);
      if(v>.78){c.fillStyle='rgba(91,134,141,.07)';c.fillRect(px+s*.34,py+s*.27,2,2);}
      return;
    }
    if(t.t==='wall'){
      c.fillStyle=theme.wall;c.fillRect(px,py,s+.8,s+.8);
      c.fillStyle='rgba(218,227,218,.09)';c.fillRect(px+2,py+2,s-3,2);
      c.fillStyle='rgba(1,10,17,.24)';c.fillRect(px+s-4,py+4,3,s-4);c.fillRect(px+3,py+s-5,s-5,3);
      c.strokeStyle='rgba(15,30,38,.37)';c.lineWidth=1;c.strokeRect(px+2.5,py+2.5,s-4,s-4);
      if(v>.5){c.fillStyle='rgba(0,0,0,.16)';c.fillRect(px+s*.14,py+s*.5,s*.42,1);}
    }else{
      c.fillStyle=theme.floor;c.fillRect(px,py,s+.7,s+.7);
      c.fillStyle='rgba(16,27,30,.16)';c.fillRect(px+2,py+1,s-3,1);c.fillRect(px+s-2,py+2,1,s-3);
      c.fillStyle='rgba(206,196,153,.10)';
      if(v>.36)c.fillRect(px+3+v*s*.35,py+3+v*s*.55,2,2);
      if(v>.74)c.fillRect(px+s*.66,py+s*.2,3,1);
      if(t.t==='water'){
        c.fillStyle='#255772';c.fillRect(px+1,py+1,s-2,s-2);
        c.strokeStyle='rgba(137,221,232,.5)';c.lineWidth=1.4;
        const wave=Math.sin(time*.0017+x*.8+y*1.4)*s*.08;
        c.beginPath();c.moveTo(px+3,py+s*.35+wave);c.quadraticCurveTo(px+s*.48,py+s*.2+wave,px+s-3,py+s*.4+wave);c.stroke();
      }
      if(t.t==='oil'){
        c.fillStyle='#26263c';c.fillRect(px+2,py+2,s-4,s-4);
        c.strokeStyle='rgba(163,117,171,.5)';c.beginPath();c.arc(px+s*.52,py+s*.5,s*.25,0,Math.PI*1.6);c.stroke();
      }
      if(t.t==='bush'){
        c.fillStyle='#355c48';
        for(let j=0;j<5;j++){const r=s*(.12+j*.09);c.beginPath();c.arc(px+s*(.26+(j%3)*.24),py+s*(.3+(j%2)*.34),r*.55,0,Math.PI*2);c.fill();}
        c.fillStyle='#82ac68';c.fillRect(px+s*.34,py+s*.29,2,3);
      }
      if(t.t==='ice'){
        c.fillStyle='#76bdcd';c.fillRect(px+1,py+1,s-2,s-2);
        c.strokeStyle='rgba(232,255,255,.65)';c.lineWidth=1.5;c.beginPath();
        c.moveTo(px+s*.18,py+s*.75);c.lineTo(px+s*.58,py+s*.16);c.lineTo(px+s*.83,py+s*.4);c.stroke();
      }
      // Distinguish elemental territories by their borders, not by
      // repeating the same isolated tile sprite. The bright stroke shows
      // where chains change material, while fine patterns retain depth.
      if(!override&&['water','oil','bush','ice'].includes(t.t)){
        const materialColor={
          water:'rgba(110,219,246,.74)',ice:'rgba(240,255,255,.85)',
          oil:'rgba(190,134,225,.73)',bush:'rgba(156,222,116,.66)'
        }[t.t];
        c.strokeStyle=materialColor;c.lineWidth=Math.max(1.4,s*.043);
        const top=game.tile(x,y-1),left=game.tile(x-1,y);
        const right=game.tile(x+1,y),bottom=game.tile(x,y+1);
        c.beginPath();
        if(top?.t!==t.t){c.moveTo(px+1,py+1.5);c.lineTo(px+s-1,py+1.5);}
        if(left?.t!==t.t){c.moveTo(px+1.5,py+1);c.lineTo(px+1.5,py+s-1);}
        if(right?.t!==t.t){c.moveTo(px+s-1.5,py+1);c.lineTo(px+s-1.5,py+s-1);}
        if(bottom?.t!==t.t){c.moveTo(px+1,py+s-1.5);c.lineTo(px+s-1,py+s-1.5);}
        c.stroke();
        c.fillStyle=materialColor;
        if(t.t==='water'){
          const f=.18+.08*Math.sin(time*.002+v*12);
          c.globalAlpha=f;c.fillRect(px+s*(.16+.19*v),py+s*.67,s*.34,1.3);c.globalAlpha=1;
        }else if(t.t==='oil'){
          c.globalAlpha=.26;c.fillRect(px+s*.24,py+s*.28,s*(.12+.18*v),1.1);c.globalAlpha=1;
        }else if(t.t==='bush'){
          c.globalAlpha=.55;
          c.fillRect(px+s*.18,py+s*.63,s*.09,s*.15);c.fillRect(px+s*.75,py+s*.41,s*.07,s*.18);
          c.globalAlpha=1;
        }else{
          c.globalAlpha=.4;c.fillRect(px+s*.26,py+s*.2,s*.35,1.3);c.globalAlpha=1;
        }
      }
      if(t.fire>0){
        const friendly=t.fireOwner==='player';
        c.fillStyle=friendly?'rgba(255,209,90,.21)':'rgba(255,71,44,.27)';
        c.fillRect(px,py,s,s);
        c.shadowColor=friendly?'#ffe397':'#ff643b';c.shadowBlur=9;
        c.fillStyle=friendly?'#fff0a3':'#ff8a56';
        const sway=Math.sin(time*.006+x*2+y)*s*.09;
        c.beginPath();c.moveTo(px+s*.35,py+s*.78);c.quadraticCurveTo(px+s*.2+sway,py+s*.35,px+s*.57,py+s*.12);
        c.quadraticCurveTo(px+s*.48+sway,py+s*.53,px+s*.7,py+s*.72);c.closePath();c.fill();c.shadowBlur=0;
        if(friendly){
          c.fillStyle='#fff5c1';c.font='bold '+Math.round(s*.23)+'px sans-serif';
          c.fillText('✦',px+s*.19,py+s*.21);
        }
      }
      if(t.smoke>0){
        c.fillStyle='rgba(169,157,184,.23)';c.beginPath();c.arc(px+s*.4,py+s*.48,s*.3,0,Math.PI*2);c.arc(px+s*.65,py+s*.45,s*.24,0,Math.PI*2);c.fill();
      }
    }
    const trap=override?(override.feature==='trap'?{known:true}:null):game.trapAt(x,y);
    if(trap&&trap.known){
      c.fillStyle='rgba(249,174,84,.18)';c.fillRect(px+1,py+1,s-2,s-2);
      c.strokeStyle='#ffbc65';c.lineWidth=2.3;c.beginPath();
      c.moveTo(px+s*.23,py+s*.72);c.lineTo(px+s*.5,py+s*.24);
      c.lineTo(px+s*.77,py+s*.72);c.closePath();c.stroke();
      c.fillStyle='#ffe0a0';c.fillRect(px+s*.48,py+s*.43,s*.05,s*.16);
      c.fillRect(px+s*.48,py+s*.64,s*.05,s*.05);
    }
    if(override?.feature==='stairs'||(!override&&x===game.stairs.x&&y===game.stairs.y)){
      c.shadowColor='#f0c674';c.shadowBlur=13;c.strokeStyle='#efc67d';c.lineWidth=2;
      c.strokeRect(px+s*.25,py+s*.24,s*.5,s*.52);
      c.beginPath();c.moveTo(px+s*.36,py+s*.5);c.lineTo(px+s*.5,py+s*.66);c.lineTo(px+s*.65,py+s*.5);c.stroke();c.shadowBlur=0;
    }
    if(t.lit){
      const item=override?(override.item?{type:override.item}:null):game.itemAt(x,y);
      if(item){
        const d=ITEM[item.type];c.font='bold '+Math.round(s*.58)+'px system-ui';c.textAlign='center';c.textBaseline='middle';
        c.shadowColor=d.color;c.shadowBlur=8;c.fillStyle=d.color;c.fillText(d.glyph,px+s*.5,py+s*.51);c.shadowBlur=0;
      }
      const e=override?(override.enemy?{type:override.enemy,hp:MONSTERS[override.enemy].hp,maxHp:MONSTERS[override.enemy].hp,windup:false}:null):game.enemyAt(x,y);if(e){
        sprite(col,row,e.type,c,cell);
        if(e.windup||e.cast){
          const glyph=e.cast==='arrow'?'➶':e.cast==='fire'?'✹':'!';
          c.fillStyle='#ffe6a8';c.font='bold '+Math.round(s*.43)+'px sans-serif';
          c.fillText(glyph,px+s*.75,py+s*.23);
          c.strokeStyle='#f5bc69';c.lineWidth=2;c.strokeRect(px+2,py+2,s-4,s-4);
        }
        const f=Math.max(0,e.hp/e.maxHp);
        c.fillStyle='#172a2c';c.fillRect(px+s*.16,py+s*.85,s*.68,3);
        c.fillStyle=f>.4?'#f8a176':'#eb565b';c.fillRect(px+s*.16,py+s*.85,s*.68*f,3);
      }
    }
    if(override?.feature==='player')sprite(col,row,'player',c,cell);
    if(!t.lit){c.fillStyle='rgba(5,13,20,.67)';c.fillRect(px,py,s+.7,s+.7);}
  }
  function drawElementEffects(time){
    // The effect event is generated by the engine's actual flood-fill.
    // A wave travels through those exact cells, not a pre-recorded effect.
    for(const event of game.effects||[]){
      if(event.id<=lastEffectSeq)continue;
      lastEffectSeq=event.id;
      const maxStep=Math.max(0,...event.points.map(p=>p.step||0));
      const duration=Math.min(2100,Math.max(960,maxStep*26+520));
      activeVfx.push({...event,started:time,maxStep,duration});
    }
    activeVfx=activeVfx.filter(e=>time-e.started<e.duration).slice(-6);
    if(!activeVfx.length)return;
    const colors={spark:'#a6f6ff',frost:'#c8f9ff',ember:'#ffa14a',
      spread:'#ffad57',gust:'#bcffd5',smoke:'#d7c9ef',heal:'#a0ffd1'};
    for(const effect of activeVfx){
      const elapsed=time-effect.started;
      const color=colors[effect.type]||'#f8dc98';
      const graph=new Map(effect.points.map(p=>[p.x+','+p.y,p]));
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      // Show cast direction before the surface reaction begins.
      if(elapsed<400&&effect.points.length){
        const p=effect.points[0],a=effect.from;
        const x1=(a.x-camX+.5)*scale,y1=(a.y-camY+.5)*scale,
          x2=(p.x-camX+.5)*scale,y2=(p.y-camY+.5)*scale;
        if(Math.max(Math.abs(x2-x1),Math.abs(y2-y1))<scale*9){
          ctx.globalAlpha=Math.max(0,1-elapsed/400)*.75;
          ctx.shadowColor=color;ctx.shadowBlur=13;ctx.strokeStyle=color;ctx.lineWidth=3;
          ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
        }
      }
      for(const point of effect.points){
        const delay=effect.maxStep>0?(point.step/effect.maxStep)*(effect.duration-470):0;
        const phase=elapsed-delay;
        if(phase<0||phase>470)continue;
        const tile=game.tile(point.x,point.y);
        if(!tile?.seen)continue;
        const col=point.x-camX,row=point.y-camY;
        if(col<0||col>=VIEW_W||row<0||row>=VIEW_H)continue;
        const alpha=Math.sin(Math.PI*Math.min(1,phase/470));
        const px=col*scale,py=row*scale;
        ctx.globalAlpha=alpha*.37;ctx.fillStyle=color;
        ctx.fillRect(px+1,py+1,scale-2,scale-2);
        ctx.globalAlpha=alpha*.95;
        ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=12;
        ctx.lineWidth=effect.type==='spark'?3.1:2.2;
        const inset=scale*(.1+.2*(phase/470));
        ctx.strokeRect(px+inset,py+inset,scale-2*inset,scale-2*inset);
        if(effect.type==='spark'){
          // Arc only between electrically connected preceding wave cells.
          const previous=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>
            graph.get((point.x+dx)+','+(point.y+dy))).find(q=>q&&q.step===point.step-1);
          if(previous){
            const midx=(point.x-camX+.5)*scale,midy=(point.y-camY+.5)*scale;
            const fromx=(previous.x-camX+.5)*scale,fromy=(previous.y-camY+.5)*scale;
            ctx.beginPath();ctx.moveTo(fromx,fromy);
            ctx.lineTo((fromx+midx)/2+Math.sin(time*.038+point.x)*scale*.1,
              (fromy+midy)/2+Math.cos(time*.04+point.y)*scale*.1);
            ctx.lineTo(midx,midy);ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }
  function draw(time){
    requestAnimationFrame(draw);
    if(time-lastFrame<28)return;
    lastFrame=time;
    if(!scale)return;
    camX=clamp(game.player.x-Math.floor(VIEW_W/2),0,W-VIEW_W);
    camY=clamp(game.player.y-Math.floor(VIEW_H/2),0,H-VIEW_H);
    const r=board.getBoundingClientRect(),cw=r.width,ch=r.height,s=scale;
    ctx.fillStyle='#08131a';ctx.fillRect(0,0,cw,ch);
    for(let y=0;y<VIEW_H;y++)for(let x=0;x<VIEW_W;x++)drawTile(camX+x,camY+y,x,y,time);
    // Preview only the currently visible conductive cells of the proposed
    // quick cast. Nothing outside player vision is highlighted.
    if(quickPreview.size&&aim<0&&modal.hidden&&sheet.hidden){
      ctx.save();ctx.strokeStyle='rgba(181,247,255,.56)';ctx.lineWidth=1.2;
      for(let y=0;y<VIEW_H;y++)for(let x=0;x<VIEW_W;x++){
        const xx=camX+x,yy=camY+y;
        if(!quickPreview.has(xx+','+yy))continue;
        const tile=game.tile(xx,yy);if(!tile?.lit)continue;
        ctx.strokeRect(x*s+4,y*s+4,s-8,s-8);
      }
      ctx.restore();
    }
    const px=(game.player.x-camX)*s,py=(game.player.y-camY)*s;
    // A subtle focus ring signals the player even under low light.
    ctx.strokeStyle='rgba(144,230,240,.62)';ctx.lineWidth=1.3;ctx.strokeRect(px+1,py+1,s-2,s-2);
    sprite(game.player.x-camX,game.player.y-camY,'player');
    if(selection&&game.inside(selection.x,selection.y)){
      const sx=(selection.x-camX)*s,sy=(selection.y-camY)*s;
      ctx.strokeStyle=aim>=0?'#efbe75':'#82cdd8';ctx.lineWidth=2;
      ctx.strokeRect(sx+2,sy+2,s-4,s-4);
    }
    if(quickSuggestion&&aim<0&&modal.hidden&&sheet.hidden){
      const x=quickSuggestion.x-camX,y=quickSuggestion.y-camY;
      if(x>=0&&x<VIEW_W&&y>=0&&y<VIEW_H){
        ctx.save();
        ctx.strokeStyle=ITEM[quickSuggestion.type].color;ctx.lineWidth=2;
        ctx.shadowBlur=8;ctx.shadowColor=ITEM[quickSuggestion.type].color;
        const pulse=.12+.035*Math.sin(time*.006);
        const pad=scale*pulse;
        ctx.strokeRect(x*s+pad,y*s+pad,s-2*pad,s-2*pad);
        ctx.restore();
      }
    }
    if(aim>=0){
      ctx.fillStyle='rgba(211,165,83,.12)';ctx.fillRect(0,0,cw,ch);
      const stroke='#ffdc99';ctx.strokeStyle=stroke;ctx.lineWidth=2;
      ctx.strokeRect(px+2,py+2,s-4,s-4);
    }
    drawElementEffects(time);
    if(time<flashUntil){
      ctx.strokeStyle='rgba(255,158,98,.75)';ctx.lineWidth=5;ctx.strokeRect(2,2,cw-4,ch-4);
    }
    const vignette=ctx.createRadialGradient(cw/2,ch/2,cw*.14,cw/2,ch/2,ch*.69);
    vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(1,7,12,.38)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,cw,ch);
  }
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  const returning=load();lastEffectSeq=game.effectSeq||0;
  resize();window.addEventListener('resize',resize);
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(board);
  window.addEventListener('pagehide',save);
  window.addEventListener('visibilitychange',()=>{if(document.hidden){stopAuto();save();}});
  refresh();showIntro(returning);requestAnimationFrame(draw);
  // Minimal debug surface for deterministic browser playchecks, never changes the game.
  window.__deepWeaveTest={getMiniMap:()=>drawMiniMap(),getQuick:()=>game.suggestSkill(),getVfx:()=>({active:activeVfx.length,latest:lastEffectSeq}),seedRun:(seed)=>{game=new Game(seed);lastEffectSeq=0;activeVfx=[];quickPreview=new Set();hideModal();refresh();},getViewport:()=>({columns:VIEW_W,rows:VIEW_H,tileCssPixels:board.getBoundingClientRect().width/VIEW_W}),getState:()=>({floor:game.floor,turn:game.turn,hp:game.hp,alive:game.alive,player:{...game.player},inventory:game.inventory.length}),step:(dx,dy)=>step(dx,dy)};
})();
