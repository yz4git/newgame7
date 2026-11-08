(() => {
  'use strict';
  const {Game,MONSTERS,ITEM,W,H}=window.DeepWeave;
  const VIEW_W=11,VIEW_H=13,STORE='deep-weave-run-v2';
  const $=id=>document.getElementById(id);
  const board=$('board'),ctx=board.getContext('2d',{alpha:false});
  const floorLabel=$('floorLabel'),floorName=$('floorName'),hpText=$('hpText'),hpBar=$('hpBar');
  const atkText=$('atkText'),turnText=$('turnText'),scoreText=$('scoreText');
  const recent=$('recent'),bag=$('bag'),tooltip=$('tooltip'),toastEl=$('toast'),sheet=$('sheet'),modal=$('modal'),hint=$('hint');
  let game,camX=0,camY=0,scale=1,lastFrame=0,aim=-1,selection=null,autoTimer=0,autoTarget=null,gesture=null,pressTimer=0,toastTimer=0,modalMode='';
  let soundEnabled=false,audioContext=null;
  let particles=[];
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
  function refresh(){
    const s=game.status();
    floorLabel.textContent='B'+s.floor+' / '+s.maxFloor;
    floorName.textContent=s.theme;
    hpText.textContent=s.hp+' / '+s.maxHp;
    hpBar.style.width=(100*s.hp/s.maxHp)+'%';
    hpBar.classList.toggle('low',s.hp/s.maxHp<.35);
    atkText.textContent=s.attack;turnText.textContent=s.turn;scoreText.textContent=s.score;
    const last=game.log[0];recent.textContent=last?last.text:'影の底へ進もう。';
    bag.textContent=game.inventory.length+'/8';
    hint.textContent=aim>=0?'使う場所や敵をタップ · ✕ で解除':autoTarget?'自動移動中 · 画面をタップして停止':'タップで進む · スワイプで1歩 · 長押しで調べる';
    $('cancelAim').hidden=aim<0;
    $('cancelAim').classList.toggle('active',aim>=0);
    $('soundButton').textContent=soundEnabled?'♪':'♫̸';
    $('soundButton').setAttribute('aria-label',soundEnabled?'音を消す':'音を出す');
    if((!s.alive||s.won)&&modal.hidden)showEnding();
    updateInfo();
    save();
  }
  function startNew(){
    stopAuto();aim=-1;selection=null;
    game=new Game();clearSave();save();hideSheet();hideModal();refresh();showToast('新たな探索が始まった');
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
      '<div class="intro-keys"><span>タップ　移動・攻撃</span><span>スワイプ　1歩</span><span>長押し　調べる</span></div>',
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
      '<p><b>道具</b>：下の鞄から選び、使用対象をタップする。薬はすぐに使う。</p>'+
      '<p><b>連鎖</b>：水+雷=感電、油+炎=延焼、水+氷=凍結、風+敵+罠=追加ダメージ。</p>'+
      '<p><b>ターン</b>：移動、攻撃、道具使用、待機でのみ敵が動く。長押しやメニューでは進まない。死亡で探索終了。</p>',
      [{label:'戻る',primary:true,click:()=>{hideModal();refresh();}}]
    );
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
    if(game.turn!==oldTurn){sound(game.log[0]?.text.includes('ダメージ')?190:410,.055);}
    if(!game.alive||game.won)stopAuto();
    refresh();
  }
  function step(dx,dy){
    stopAuto();aim=-1;
    const old=game.turn,r=game.move(dx,dy);
    if(!r.ok&&r.reason==='wall'){sound(120,.055);showToast('そこには進めない');}
    else if(r.ok)afterAction(old);
    refresh();
  }
  function beginPath(x,y,enemyTarget){
    stopAuto();
    if(x===game.player.x&&y===game.player.y){return;}
    const path=game.pathTo(x,y,!!enemyTarget);
    if(!path.length){showToast('そこへ続く道がない');return;}
    autoTarget={x,y,enemyId:enemyTarget?enemyTarget.id:null,path};
    selection={x,y};
    // Safe traversal stops when an enemy becomes a visible immediate threat.
    const advancePath=()=>{
      autoTimer=0;if(!autoTarget||!game.alive||game.won)return;
      const target=autoTarget,next=target.path.shift();
      if(!next){finishAuto();return;}
      if(game.enemyAt(next.x,next.y)){stopAuto();showToast('敵が道を塞いでいる');refresh();return;}
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
      const id=autoTarget.enemyId;
      stopAuto();
      if(id){
        const e=game.enemies.find(m=>m.id===id);
        if(e&&Math.max(Math.abs(e.x-game.player.x),Math.abs(e.y-game.player.y))===1){
          const old=game.turn;game.move(e.x-game.player.x,e.y-game.player.y);afterAction(old);
        }
      }
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
      else showToast(res.reason==='range'?'射程外・壁や煙で狙えない':res.reason==='target'?'吹き飛ばす敵を選んで':'使用できない');
      refresh();return;
    }
    const t=game.tile(x,y);if(!t||!t.seen){showToast('まだ見えない場所');return;}
    const enemy=t.lit?game.enemyAt(x,y):null;
    const dx=x-game.player.x,dy=y-game.player.y;
    if(enemy&&Math.max(Math.abs(dx),Math.abs(dy))===1){step(dx,dy);return;}
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
  function sprite(x,y,t){
    const s=scale,px=x*s,py=y*s,cx=px+s/2,cy=py+s/2;
    const rim=(color)=>{ctx.strokeStyle=color;ctx.lineWidth=1.15;};
    if(t==='player'){
      ctx.shadowColor='#72d8ff';ctx.shadowBlur=10;
      ctx.fillStyle='#f7dba6';ctx.beginPath();ctx.arc(cx,py+s*.4,s*.17,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#5ba9b8';ctx.beginPath();ctx.moveTo(cx,py+s*.42);ctx.lineTo(cx-s*.25,py+s*.8);ctx.lineTo(cx+s*.24,py+s*.8);ctx.closePath();ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle='#e8faff';ctx.fillRect(cx+s*.13,py+s*.36,s*.07,s*.43);
      ctx.fillStyle='#16394d';ctx.fillRect(cx-s*.12,py+s*.38,s*.055,s*.045);
      return;
    }
    if(t in MONSTERS){
      const d=MONSTERS[t],c=d.color;
      ctx.shadowColor=c;ctx.shadowBlur=5;
      ctx.fillStyle=c;ctx.beginPath();
      if(t==='eel'){ctx.ellipse(cx,cy,s*.3,s*.18,.5,0,Math.PI*2);}
      else{ctx.ellipse(cx,cy+s*.07,t==='brute'?s*.35:s*.27,t==='guard'?s*.33:s*.26,0,0,Math.PI*2);}
      ctx.fill();ctx.shadowBlur=0;
      ctx.fillStyle='#15232a';ctx.fillRect(cx-s*.13,cy-s*.07,s*.08,s*.07);ctx.fillRect(cx+s*.065,cy-s*.07,s*.08,s*.07);
      if(t==='guard'||t==='brute'){rim('#e8e4d2');ctx.beginPath();ctx.moveTo(cx-s*.24,cy-s*.13);ctx.lineTo(cx-s*.15,cy-s*.35);ctx.moveTo(cx+s*.24,cy-s*.13);ctx.lineTo(cx+s*.15,cy-s*.35);ctx.stroke();}
      return;
    }
  }
  function drawTile(x,y,col,row,time){
    const t=game.tile(x,y);if(!t)return;
    const s=scale,px=col*s,py=row*s,v=hash(x,y),theme=game.theme();
    if(!t.seen){
      ctx.fillStyle='#08121a';ctx.fillRect(px,py,s+.5,s+.5);
      if(v>.78){ctx.fillStyle='rgba(91,134,141,.07)';ctx.fillRect(px+s*.34,py+s*.27,2,2);}
      return;
    }
    if(t.t==='wall'){
      ctx.fillStyle=theme.wall;ctx.fillRect(px,py,s+.8,s+.8);
      ctx.fillStyle='rgba(218,227,218,.09)';ctx.fillRect(px+2,py+2,s-3,2);
      ctx.fillStyle='rgba(1,10,17,.24)';ctx.fillRect(px+s-4,py+4,3,s-4);ctx.fillRect(px+3,py+s-5,s-5,3);
      ctx.strokeStyle='rgba(15,30,38,.37)';ctx.lineWidth=1;ctx.strokeRect(px+2.5,py+2.5,s-4,s-4);
      if(v>.5){ctx.fillStyle='rgba(0,0,0,.16)';ctx.fillRect(px+s*.14,py+s*.5,s*.42,1);}
    }else{
      ctx.fillStyle=theme.floor;ctx.fillRect(px,py,s+.7,s+.7);
      ctx.fillStyle='rgba(16,27,30,.16)';ctx.fillRect(px+2,py+1,s-3,1);ctx.fillRect(px+s-2,py+2,1,s-3);
      ctx.fillStyle='rgba(206,196,153,.10)';
      if(v>.36)ctx.fillRect(px+3+v*s*.35,py+3+v*s*.55,2,2);
      if(v>.74)ctx.fillRect(px+s*.66,py+s*.2,3,1);
      if(t.t==='water'){
        ctx.fillStyle='#255772';ctx.fillRect(px+1,py+1,s-2,s-2);
        ctx.strokeStyle='rgba(137,221,232,.5)';ctx.lineWidth=1.4;
        const wave=Math.sin(time*.0017+x*.8+y*1.4)*s*.08;
        ctx.beginPath();ctx.moveTo(px+3,py+s*.35+wave);ctx.quadraticCurveTo(px+s*.48,py+s*.2+wave,px+s-3,py+s*.4+wave);ctx.stroke();
      }
      if(t.t==='oil'){
        ctx.fillStyle='#26263c';ctx.fillRect(px+2,py+2,s-4,s-4);
        ctx.strokeStyle='rgba(163,117,171,.5)';ctx.beginPath();ctx.arc(px+s*.52,py+s*.5,s*.25,0,Math.PI*1.6);ctx.stroke();
      }
      if(t.t==='bush'){
        ctx.fillStyle='#355c48';
        for(let j=0;j<5;j++){const r=s*(.12+j*.09);ctx.beginPath();ctx.arc(px+s*(.26+(j%3)*.24),py+s*(.3+(j%2)*.34),r*.55,0,Math.PI*2);ctx.fill();}
        ctx.fillStyle='#82ac68';ctx.fillRect(px+s*.34,py+s*.29,2,3);
      }
      if(t.t==='ice'){
        ctx.fillStyle='#76bdcd';ctx.fillRect(px+1,py+1,s-2,s-2);
        ctx.strokeStyle='rgba(232,255,255,.65)';ctx.lineWidth=1.5;ctx.beginPath();
        ctx.moveTo(px+s*.18,py+s*.75);ctx.lineTo(px+s*.58,py+s*.16);ctx.lineTo(px+s*.83,py+s*.4);ctx.stroke();
      }
      if(t.fire>0){
        ctx.fillStyle='rgba(255,105,44,.23)';ctx.fillRect(px,py,s,s);
        ctx.shadowColor='#ff7c3b';ctx.shadowBlur=8;ctx.fillStyle='#ffb05c';
        const sway=Math.sin(time*.006+x*2+y)*s*.09;
        ctx.beginPath();ctx.moveTo(px+s*.35,py+s*.78);ctx.quadraticCurveTo(px+s*.2+sway,py+s*.35,px+s*.57,py+s*.12);
        ctx.quadraticCurveTo(px+s*.48+sway,py+s*.53,px+s*.7,py+s*.72);ctx.closePath();ctx.fill();ctx.shadowBlur=0;
      }
      if(t.smoke>0){
        ctx.fillStyle='rgba(169,157,184,.23)';ctx.beginPath();ctx.arc(px+s*.4,py+s*.48,s*.3,0,Math.PI*2);ctx.arc(px+s*.65,py+s*.45,s*.24,0,Math.PI*2);ctx.fill();
      }
    }
    const trap=game.trapAt(x,y);
    if(trap&&trap.known){ctx.strokeStyle='#f1b677';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px+s*.25,py+s*.7);ctx.lineTo(px+s*.5,py+s*.3);ctx.lineTo(px+s*.75,py+s*.7);ctx.stroke();}
    if(x===game.stairs.x&&y===game.stairs.y){
      ctx.shadowColor='#f0c674';ctx.shadowBlur=13;ctx.strokeStyle='#efc67d';ctx.lineWidth=2;
      ctx.strokeRect(px+s*.25,py+s*.24,s*.5,s*.52);
      ctx.beginPath();ctx.moveTo(px+s*.36,py+s*.5);ctx.lineTo(px+s*.5,py+s*.66);ctx.lineTo(px+s*.65,py+s*.5);ctx.stroke();ctx.shadowBlur=0;
    }
    if(t.lit){
      const item=game.itemAt(x,y);
      if(item){
        const d=ITEM[item.type];ctx.font='bold '+Math.round(s*.58)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.shadowColor=d.color;ctx.shadowBlur=8;ctx.fillStyle=d.color;ctx.fillText(d.glyph,px+s*.5,py+s*.51);ctx.shadowBlur=0;
      }
      const e=game.enemyAt(x,y);if(e){
        sprite(col,row,e.type);
        if(e.windup){ctx.fillStyle='#fbb57b';ctx.font='bold '+Math.round(s*.38)+'px sans-serif';ctx.fillText('!',px+s*.8,py+s*.26);}
        const f=Math.max(0,e.hp/e.maxHp);
        ctx.fillStyle='#172a2c';ctx.fillRect(px+s*.16,py+s*.85,s*.68,3);
        ctx.fillStyle=f>.4?'#f8a176':'#eb565b';ctx.fillRect(px+s*.16,py+s*.85,s*.68*f,3);
      }
    }
    if(!t.lit){ctx.fillStyle='rgba(5,13,20,.67)';ctx.fillRect(px,py,s+.7,s+.7);}
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
    const px=(game.player.x-camX)*s,py=(game.player.y-camY)*s;
    // A subtle focus ring signals the player even under low light.
    ctx.strokeStyle='rgba(144,230,240,.62)';ctx.lineWidth=1.3;ctx.strokeRect(px+1,py+1,s-2,s-2);
    sprite(game.player.x-camX,game.player.y-camY,'player');
    if(selection&&game.inside(selection.x,selection.y)){
      const sx=(selection.x-camX)*s,sy=(selection.y-camY)*s;
      ctx.strokeStyle=aim>=0?'#efbe75':'#82cdd8';ctx.lineWidth=2;
      ctx.strokeRect(sx+2,sy+2,s-4,s-4);
    }
    if(aim>=0){
      ctx.fillStyle='rgba(211,165,83,.12)';ctx.fillRect(0,0,cw,ch);
      const stroke='#ffdc99';ctx.strokeStyle=stroke;ctx.lineWidth=2;
      ctx.strokeRect(px+2,py+2,s-4,s-4);
    }
    const vignette=ctx.createRadialGradient(cw/2,ch/2,cw*.14,cw/2,ch/2,ch*.69);
    vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(1,7,12,.38)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,cw,ch);
  }
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  const returning=load();
  resize();window.addEventListener('resize',resize);
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(board);
  window.addEventListener('pagehide',save);
  window.addEventListener('visibilitychange',()=>{if(document.hidden){stopAuto();save();}});
  refresh();showIntro(returning);requestAnimationFrame(draw);
  // Minimal debug surface for deterministic browser playchecks, never changes the game.
  window.__deepWeaveTest={getState:()=>({floor:game.floor,turn:game.turn,hp:game.hp,alive:game.alive,player:{...game.player},inventory:game.inventory.length}),step:(dx,dy)=>step(dx,dy)};
})();
