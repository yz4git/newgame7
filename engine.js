(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DeepWeave = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const W = 27, H = 29, MAX_FLOOR = 12;
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  const MONSTERS = {
    sprout:{name:'苔小鬼', hp:7,atk:2,glyph:'s',color:'#8bc778',xp:1},
    runner:{name:'穴走り',hp:6,atk:2,glyph:'r',color:'#e9ba78',xp:1},
    archer:{name:'射手',hp:9,atk:3,glyph:'a',color:'#d6a3e0',xp:2},
    guard:{name:'石の衛兵',hp:16,atk:3,glyph:'G',color:'#c0d4d7',xp:3},
    eel:{name:'水精',hp:10,atk:3,glyph:'e',color:'#73d9ed',xp:2},
    witch:{name:'火術師',hp:10,atk:3,glyph:'w',color:'#f1a06d',xp:2},
    brute:{name:'重装獣',hp:19,atk:5,glyph:'B',color:'#ef8b78',xp:3}
  };
  const ITEM = {
    heal:{name:'治癒の薬',glyph:'✚',color:'#7ce0ab',desc:'HPを12回復。自分をタップして使用。'},
    spark:{name:'雷の杖',glyph:'ϟ',color:'#ffd86b',desc:'雷を水・氷の連続床に伝播。離れた敵も感電・足止め。'},
    frost:{name:'氷結の瓶',glyph:'❄',color:'#b9efff',desc:'水脈に沿って凍結連鎖。敵の技詠唱も止める。'},
    ember:{name:'火種の壺',glyph:'✹',color:'#ff9d68',desc:'油・草を連鎖延焼。自分が起こした炎では自傷しない。'},
    gust:{name:'突風の巻物',glyph:'➤',color:'#d8f1c9',desc:'敵を吹き飛ばし、罠・壁・火へ誘導する。'},
    smoke:{name:'煙玉',glyph:'◌',color:'#d0c7dd',desc:'煙で射線を遮り、追手を撒く。'},
    blade:{name:'研ぎ石',glyph:'◆',color:'#ffc777',desc:'自動使用。以降の近接攻撃力+1。'},
    ward:{name:'生命の印',glyph:'✧',color:'#c4b8ff',desc:'自動使用。最大HP+4、HP+4。'}
  };
  const THEMES = [
    {name:'忘却の石廊',wall:'#5b6b76',floor:'#283940',accent:'#d8b880'},
    {name:'地下の水脈',wall:'#426a72',floor:'#263f4b',accent:'#75c8d7'},
    {name:'熾火の祭壇',wall:'#75605a',floor:'#443b36',accent:'#eaa074'},
    {name:'根の深層',wall:'#567660',floor:'#2f4438',accent:'#a5cb83'}
  ];
  function dist(a,b){return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));}
  function key(x,y){return x+','+y;}
  function clone(o){return JSON.parse(JSON.stringify(o));}
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  class Game {
    constructor(seed) {
      this.seed = (Number(seed) || (Date.now() & 0x7fffffff)) >>> 0;
      this.rngState = this.seed || 10351;
      this.floor = 1; this.turn = 0; this.hp = 30; this.maxHp = 30; this.attack = 5;
      this.rank = 0; this.kills = 0; this.score = 0; this.alive = true; this.won = false;
      this.inventory = [{type:'heal'},{type:'spark'},{type:'frost'},{type:'ember'}];
      this.log = []; this.nextId = 1; this.effects=[]; this.effectSeq=0; this.elementRevision=1; this.routeRevision=1;
      this.generate(); this.say('下へ降り、最深部の「星の核」を探そう。');
    }
    static restore(raw) {
      const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!s || s.version !== 2 || !s.map || !s.player) throw new Error('Invalid save');
      const g=Object.create(Game.prototype); Object.assign(g,s);
      g.log=Array.isArray(g.log)?g.log:[];
      g.effects=Array.isArray(g.effects)?g.effects:[];
      g.effectSeq=Number.isFinite(g.effectSeq)?g.effectSeq:0;
      if(!g.elementRevision){g.upgradeElementMap();g.elementRevision=1;}
      // Repair runs started under the older trap generator without resetting
      // floors, HP, inventory or exploration. Unknown traps never become visible.
      if(!g.routeRevision){
        g.repairTrapRoutes();
        g.routeRevision=1;
      }
      if(Array.isArray(g.rooms)){
        for(const room of g.rooms){
          if(room.visited===undefined){
            room.visited=!!(g.tile(room.cx,room.cy)?.seen||
              (room.x!==undefined&&g.player.x>=room.x&&g.player.x<room.x+room.w&&
                g.player.y>=room.y&&g.player.y<room.y+room.h));
          }
        }
        g.discoveries=Number.isFinite(g.discoveries)?
          g.discoveries:g.rooms.filter(r=>r.visited).length;
      }
      return g;
    }
    // Restore pre-elemental saves without resetting the player's run.
    // Preserve exploration, walls, enemy positions, traps and current effects.
    upgradeElementMap(){
      const materials=[];
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
        const t=this.tile(x,y);
        if(['water','oil','bush','ice'].includes(t.t))materials.push({x,y,type:t.t});
      }
      if(!materials.length)return;
      const old=this.map.map(row=>row.map(t=>t.t));
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
        const t=this.tile(x,y);
        if(old[y][x]!=='floor')continue;
        if(dist({x,y},this.player)<=1||dist({x,y},this.stairs)===0)continue;
        const hash=Math.imul(x*1973+y*9277+(this.seed|0),668265263)>>>0;
        if(hash%100<12)continue;
        let best=null;
        for(const p of materials){
          const d=Math.abs(x-p.x)+Math.abs(y-p.y);
          if(!best||d<best.d)best={type:p.type,d};
        }
        if(best)t.t=best.type;
      }
    }
    serialize(){return JSON.stringify(Object.assign({version:2},this));}
    rnd(){let n=this.rngState|0; n^=n<<13;n^=n>>>17;n^=n<<5;this.rngState=n>>>0;return (this.rngState>>>0)/4294967296;}
    int(a,b){return a+Math.floor(this.rnd()*(b-a+1));}
    pick(a){return a[this.int(0,a.length-1)];}
    say(message){this.log.unshift({turn:this.turn,text:message});this.log.length=Math.min(this.log.length,12);}
    // Count player turns before applying the action, so every message uses
    // the same number as the visible turn counter. Bare advance() remains
    // available for deterministic enemy-turn tests.
    beginAction(){this.turn++;this._turnStarted=true;}
    inside(x,y){return x>=0&&x<W&&y>=0&&y<H;}
    tile(x,y){return this.inside(x,y)?this.map[y][x]:null;}
    walkable(x,y){const t=this.tile(x,y);return !!t&&t.t!=='wall';}
    enemyAt(x,y){return this.enemies.find(e=>e.hp>0&&e.x===x&&e.y===y);}
    itemAt(x,y){return this.items.find(i=>i.x===x&&i.y===y);}
    trapAt(x,y){return this.traps.find(t=>t.x===x&&t.y===y&&!t.used);}
    blockedDiagonal(x,y,nx,ny){
      return nx!==x&&ny!==y&&(!this.walkable(nx,y)||!this.walkable(x,ny));
    }
    generate() {
      this.map=Array.from({length:H},()=>Array.from({length:W},()=>({t:'wall',seen:false,lit:false,fire:0,smoke:0})));
      this.enemies=[];this.items=[];this.traps=[];this.rooms=[];this.effects=[];this.discoveries=0;
      const carve=(x,y)=>{if(this.inside(x,y)&&x>0&&y>0&&x<W-1&&y<H-1)this.map[y][x].t='floor';};
      for(let i=0;i<95&&this.rooms.length<15;i++){
        const rw=this.int(4,8),rh=this.int(4,7),rx=this.int(1,W-rw-2),ry=this.int(1,H-rh-2);
        if(this.rooms.some(r=>rx<=r.x+r.w&&rx+rw>=r.x-1&&ry<=r.y+r.h&&ry+rh>=r.y-1))continue;
        const room={x:rx,y:ry,w:rw,h:rh,cx:rx+Math.floor(rw/2),cy:ry+Math.floor(rh/2)};
        for(let y=ry;y<ry+rh;y++)for(let x=rx;x<rx+rw;x++)carve(x,y);
        if(this.rooms.length){const prev=this.rooms[this.rooms.length-1];let x=prev.cx,y=prev.cy;
          if(this.rnd()<0.5){while(x!==room.cx){x+=Math.sign(room.cx-x);carve(x,y);}while(y!==room.cy){y+=Math.sign(room.cy-y);carve(x,y);}}
          else {while(y!==room.cy){y+=Math.sign(room.cy-y);carve(x,y);}while(x!==room.cx){x+=Math.sign(room.cx-x);carve(x,y);}}
        }
        this.rooms.push(room);
      }
      if(this.rooms.length<4){ // A guaranteed connected fallback for pathological seeds
        for(let y=3;y<H-3;y++)for(let x=3;x<W-3;x++)carve(x,y);
        this.rooms=[{cx:4,cy:4},{cx:W-5,cy:H-5}];
      }
      const first=this.rooms[0],last=this.rooms[this.rooms.length-1];
      this.player={x:first.cx,y:first.cy};
      this.stairs={x:last.cx,y:last.cy};
      // Elemental territory occupies roughly 85% of the walkable dungeon.
      // Nearest seed regions produce large coherent water/oil/brush/ice fields.
      const theme=this.themeIndex(),palette=[
        ['water','water','oil','bush','bush','ice'],
        ['water','water','water','ice','ice','bush','oil'],
        ['oil','oil','oil','bush','bush','water','ice'],
        ['bush','bush','bush','water','water','oil','ice']
      ][theme];
      const seeds=[];
      for(let n=0;n<21;n++){
        const spot=this.freeSpot(2);if(!spot)continue;
        if(seeds.some(p=>dist(p,spot)<3))continue;
        seeds.push({...spot,type:this.pick(palette)});
      }
      if(!seeds.length)seeds.push({...this.player,type:'water'});
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
        const t=this.tile(x,y);if(t.t!=='floor')continue;
        const nearest=seeds.reduce((best,p)=>{
          const d=Math.abs(x-p.x)+Math.abs(y-p.y);
          return !best||d<best.d?{d,type:p.type}:best;
        },null);
        if(this.rnd()<.10)continue;
        t.t=nearest.type;
      }
      // Keep the starting chamber safe and the staircase accessible.
      for(let y=this.player.y-1;y<=this.player.y+1;y++)for(let x=this.player.x-1;x<=this.player.x+1;x++)
        if(this.walkable(x,y))this.tile(x,y).t='floor';
      this.tile(this.stairs.x,this.stairs.y).t='floor';
      // Every generated trap is validated as if it were already discovered.
      // It must never disconnect all safe routes between start and stairs.
      for(let i=0;i<4+Math.floor(this.floor/3);i++){
        for(let attempt=0;attempt<24;attempt++){
          const p=this.freeSpot(5);if(!p)break;
          const trap={id:this.nextId++,x:p.x,y:p.y,used:false,known:false};
          this.traps.push(trap);
          if(this.safeRouteExists())break;
          this.traps.pop();
        }
      }
      if(this.rooms.length){
        this.rooms[0].visited=true;
        this.discoveries=1;
      }
      const spawnCount=clamp(Math.round(5+this.floor*1.35),7,18);
      for(let i=0;i<spawnCount;i++){
        let pool=['sprout','sprout','runner'];
        if(this.floor>=2)pool.push('archer','eel');
        if(this.floor>=4)pool.push('guard','witch');
        if(this.floor>=7)pool.push('brute','archer','witch');
        const type=this.pick(pool),def=MONSTERS[type];
        const favored=type==='eel'?'water':type==='witch'?'oil':type==='sprout'?'bush':type==='guard'?'water':null;
        // Place opponents inside or beside interactable terrain when possible.
        const p=this.freeSpot(4,this.rnd()<0.72?(favored||'any'):null) || this.freeSpot(5);
        if(!p||this.enemyAt(p.x,p.y))continue;
        this.enemies.push({id:this.nextId++,type,x:p.x,y:p.y,hp:def.hp,maxHp:def.hp,stun:0,windup:false,cast:null,alert:false});
      }
      const itemCount=12+Math.floor(this.floor/3);
      for(let i=0;i<itemCount;i++){
        const p=this.freeSpot(3);if(!p||this.itemAt(p.x,p.y))continue;
        let types=['heal','spark','frost','ember','gust','smoke','heal','spark','ember','gust','frost'];
        if(this.floor%3===0)types.push('blade','ward');
        this.items.push({id:this.nextId++,x:p.x,y:p.y,type:this.pick(types)});
      }
      this.updateVision();
    }
    // Quick connectivity check; traps count as blocked even before discovery.
    // Adjacent cells (8 directions) stay walkable unless THEY hold a trap.
    safeRouteExists(from=this.player,to=this.stairs){
      if(!this.walkable(from.x,from.y)||!this.walkable(to.x,to.y))return false;
      const forbidden=new Set(this.traps.filter(t=>!t.used)
        .map(t=>key(t.x,t.y)));
      const src=key(from.x,from.y),dest=key(to.x,to.y);
      if(forbidden.has(dest))return false;
      const seen=new Set([src]),q=[{...from}];
      for(let i=0;i<q.length;i++){
        const p=q[i];
        if(key(p.x,p.y)===dest)return true;
        for(const [dx,dy] of DIRS){
          const nx=p.x+dx,ny=p.y+dy,k=key(nx,ny);
          if(seen.has(k)||forbidden.has(k)||!this.walkable(nx,ny)||
             this.blockedDiagonal(p.x,p.y,nx,ny))continue;
          seen.add(k);q.push({x:nx,y:ny});
        }
      }
      return false;
    }
    repairTrapRoutes(){
      if(this.safeRouteExists())return 0;
      // An old save can contain a mandatory trap. Remove the fewest traps
      // needed to reopen at least one path, preserving the rest.
      const active=this.traps.filter(t=>!t.used);
      const original=this.traps.slice();
      const n=active.length;
      for(let count=1;count<=n;count++){
        const choose=(start,indices)=>{
          if(indices.length===count){
            const removed=new Set(indices.map(i=>active[i].id));
            this.traps=original.filter(t=>!removed.has(t.id));
            return this.safeRouteExists() ? indices.slice() : null;
          }
          for(let i=start;i<=n-(count-indices.length);i++){
            const solution=choose(i+1,[...indices,i]);
            if(solution)return solution;
          }
          return null;
        };
        const result=choose(0,[]);
        if(result)return result.length;
      }
      this.traps=original;
      return 0;
    }
    distanceToSafe(x,y){return Math.min(dist({x,y},this.player),dist({x,y},this.stairs));}
    freeSpot(minDistance, preferred=null){
      for(let i=0;i<210;i++){
        const x=this.int(2,W-3),y=this.int(2,H-3),t=this.tile(x,y);
        if(!t||!this.walkable(x,y)||this.distanceToSafe(x,y)<minDistance||
           this.enemyAt(x,y)||this.itemAt(x,y)||this.trapAt(x,y))continue;
        if(preferred){
          const tags=['water','oil','bush','ice'];
          const nearby=DIRS.slice(0,4).some(([dx,dy])=>{
            const neighbor=this.tile(x+dx,y+dy);
            return neighbor && (preferred==='any'?tags.includes(neighbor.t):neighbor.t===preferred);
          });
          if(!(preferred==='any'?tags.includes(t.t):t.t===preferred)&&!nearby)continue;
        }else if(!this.walkable(x,y))continue;
        return {x,y};
      }
      return null;
    }
    themeIndex(){return Math.min(3,Math.floor((this.floor-1)/3));}
    theme(){return THEMES[this.themeIndex()];}
    line(x0,y0,x1,y1) {
      let x=x0,y=y0,dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx-dy;
      const result=[];
      while(true){result.push({x,y});if(x===x1&&y===y1)break;let e2=2*err;if(e2>-dy){err-=dy;x+=sx;}if(e2<dx){err+=dx;y+=sy;}}
      return result;
    }
    los(x0,y0,x1,y1){
      if(!this.inside(x1,y1))return false;
      const l=this.line(x0,y0,x1,y1);
      return l.slice(1,-1).every(p=>this.tile(p.x,p.y).t!=='wall'&&this.tile(p.x,p.y).smoke===0);
    }
    updateVision(){
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const t=this.tile(x,y);
        t.lit=dist(this.player,{x,y})<=6&&this.los(this.player.x,this.player.y,x,y);
        if(t.lit)t.seen=true;
      }
      // A trap becomes visible when the adventurer studies its surroundings.
      // Discovering one never advances time and allows a deliberate detour.
      for(const trap of this.traps){
        if(!trap.used&&!trap.known&&dist(trap,this.player)<=2&&this.tile(trap.x,trap.y).lit){
          trap.known=true;this.say('足元に罠の印が見える。回り込むか敵を誘導しよう。');
        }
      }
    }
    pickUp(){
      const item=this.itemAt(this.player.x,this.player.y);if(!item)return;
      const d=ITEM[item.type];
      if(item.type==='blade'){this.attack++;this.say('研ぎ石を発見。攻撃力が上がった。');}
      else if(item.type==='ward'){this.maxHp+=4;this.hp+=4;this.say('生命の印。最大HPが4上がった。');}
      else if(this.inventory.length>=8){this.say('荷物がいっぱい。道具はここに残した。');return;}
      else{this.inventory.push({type:item.type});this.say(d.name+'を拾った。');}
      this.items=this.items.filter(i=>i.id!==item.id);
    }
    discoverRoom(){
      if(!this.rooms?.length)return;
      for(const room of this.rooms){
        if(room.visited||room.x===undefined)continue;
        if(this.player.x<room.x||this.player.x>=room.x+room.w||
           this.player.y<room.y||this.player.y>=room.y+room.h)continue;
        room.visited=true;this.discoveries=(this.discoveries||0)+1;
        this.score+=60+this.floor*10;
        if(this.discoveries%3===0){
          // An optional side-room detour restores stamina or supplies a spell,
          // giving explorers a useful reason to leave the shortest stair route.
          if(this.hp<=this.maxHp-6){
            const healed=Math.min(6,this.maxHp-this.hp);
            this.hp+=healed;
            this.say('新しい部屋を発見！ 探索の共鳴でHP+'+healed);
          }else if(this.inventory.length<8){
            const type=this.pick(['spark','frost','ember','gust']);
            this.inventory.push({type});
            this.say('新しい部屋を発見！ 探索報酬：'+ITEM[type].name);
          }else{
            this.score+=60;
            this.say('新しい部屋を発見！ 探索得点を獲得');
          }
        }else this.say('未踏の部屋を発見！ 探索 '+this.discoveries+'/'+this.rooms.length);
        return;
      }
    }
    triggerTrap(ent) {
      const isPlayer=ent===this||ent===this.player;
      const pos=isPlayer?this.player:ent;
      const t=this.trapAt(pos.x,pos.y);if(!t)return;
      t.used=true;t.known=true;
      if(isPlayer){this.hp-=5;this.say('あなたが針の罠を踏んだ！');this.checkDeath();}
      else{ent.hp-=5;this.say(MONSTERS[ent.type].name+'が針の罠を踏んだ！');this.killIfNeeded(ent);}
    }
    checkDeath(){if(this.hp<=0){this.hp=0;this.alive=false;this.say('冒険はここで終わった。');}}
    killIfNeeded(e,quiet=false){
      if(e.hp>0)return;
      this.kills++;this.score+=MONSTERS[e.type].xp*25;
      if(!quiet)this.say(MONSTERS[e.type].name+'を倒した。');
      this.enemies=this.enemies.filter(m=>m.id!==e.id);
      // Meaningful combat rewards keep elemental play viable on deep floors.
      // Every fourth kill yields a single themed technique if there is room.
      if(!quiet&&this.kills%4===0&&this.inventory.length<8){
        const palette=this.themeIndex()===1?['spark','spark','frost','gust']:
          this.themeIndex()===2?['ember','ember','frost','gust']:
          this.themeIndex()===3?['ember','gust','spark','frost']:
          ['spark','frost','ember','gust'];
        const type=this.pick(palette);
        this.inventory.push({type});
        this.say('連鎖報酬：'+ITEM[type].name+'を入手！');
      }
    }
    damageEnemy(e,n,description,quiet=false){
      e.hp-=n;
      if(description&&!quiet)this.say(description+' '+n+'ダメージ。');
      this.killIfNeeded(e,quiet);
    }
    hit(e){
      const value=this.attack+this.int(0,2)-(e.type==='guard'?2:0);
      this.damageEnemy(e,Math.max(1,value),MONSTERS[e.type].name+'に攻撃。');
      this.advance();
    }
    move(dx,dy){
      if(!this.alive||this.won)return {ok:false,reason:'ended'};
      if(!Number.isInteger(dx)||!Number.isInteger(dy)||Math.max(Math.abs(dx),Math.abs(dy))!==1)return {ok:false,reason:'invalid'};
      const x=this.player.x+dx,y=this.player.y+dy;
      if(!this.walkable(x,y)||this.blockedDiagonal(this.player.x,this.player.y,x,y))return {ok:false,reason:'wall'};
      this.beginAction();
      const enemy=this.enemyAt(x,y);
      if(enemy){this.hit(enemy);return {ok:true,combat:true};}
      this.player.x=x;this.player.y=y;
      const trap=this.trapAt(x,y);if(trap)this.triggerTrap(this);
      if(!this.alive)return {ok:true,ended:true};
      this.pickUp();
      this.discoverRoom();
      if(x===this.stairs.x&&y===this.stairs.y){this._turnStarted=false;this.descend();return {ok:true,descended:true};}
      this.advance();return {ok:true};
    }
    wait(){if(!this.alive||this.won)return false;this.beginAction();this.say('一息ついた。');this.advance();return true;}
    descend(){
      this.score+=this.floor*100;
      if(this.floor>=MAX_FLOOR){
        this.won=true;this.say('星の核を取り戻した！ 深淵を踏破した。');return;
      }
      this.floor++;this.hp=Math.min(this.maxHp,this.hp+7);this.generate();
      const gifts=['spark','frost','ember','gust'];
      const reward=gifts[(this.floor-2)%gifts.length];
      if(this.inventory.length<8){
        this.inventory.push({type:reward});
        this.say('階層報酬：'+ITEM[reward].name+'を補充！');
      }
      this.say('第'+this.floor+'層：'+this.theme().name+'。 HPが7回復。');
    }
    pathTo(x,y,adjacentToEnemy){
      x=Number(x);y=Number(y);
      if(!this.walkable(x,y))return [];
      const start=this.player,src=key(start.x,start.y),goal=key(x,y);
      const open=[{x:start.x,y:start.y,cost:0}],costs=new Map([[src,0]]),prev=new Map();
      let iter=0,best=null;
      while(open.length&&iter++<W*H*8){
        open.sort((a,b)=>a.cost-b.cost);
        const p=open.shift(),k=key(p.x,p.y);
        if(p.cost>costs.get(k))continue;
        if((adjacentToEnemy?(Math.max(Math.abs(p.x-x),Math.abs(p.y-y))===1 &&
             !this.blockedDiagonal(p.x,p.y,x,y)):k===goal)){best=k;break;}
        for(const [dx,dy] of DIRS){
          const nx=p.x+dx,ny=p.y+dy;
          if(!this.walkable(nx,ny)||this.blockedDiagonal(p.x,p.y,nx,ny)||
             (adjacentToEnemy&&this.enemyAt(nx,ny)))continue;
          const tile=this.tile(nx,ny);
          // Known traps and harmful flames are not auto-walkable destinations.
          // Cells BESIDE a trap remain ordinary valid route candidates.
          if(this.trapAt(nx,ny)?.known||
             (tile.fire>0&&tile.fireOwner!=='player'))continue;
          const threat=adjacentToEnemy?0:this.enemies.some(enemy=>{
            if(enemy.hp<=0||!this.tile(enemy.x,enemy.y)?.lit)return false;
            const range=dist(enemy,{x:nx,y:ny});
            return range<=((enemy.type==='archer'||enemy.type==='witch')?3:1);
          })?1.5:0;
          const danger=(tile.t==='oil'||tile.t==='bush'?0.2:0)+threat;
          const next=p.cost+(dx&&dy?1.4:1)+danger+(this.enemyAt(nx,ny)?12:0);
          const nk=key(nx,ny);
          if(next<(costs.get(nk)??Infinity)){costs.set(nk,next);prev.set(nk,k);open.push({x:nx,y:ny,cost:next});}
        }
      }
      if(!best)return [];
      const path=[];
      while(best!==src&&path.length<W*H){const [px,py]=best.split(',').map(Number);path.unshift({x:px,y:py});best=prev.get(best);if(!best)return [];}
      return path;
    }
    canSeeDanger(){
      // Nearby traps are managed by the path planner, not by enemy alarms.
      // A distant visible enemy is information, not an immediate threat.
      return this.enemies.some(e=>{
        if(e.hp<=0||!this.tile(e.x,e.y)?.lit)return false;
        const range=dist(e,this.player);
        if(range<=2)return true;
        return range<=4&&(e.type==='archer'||e.type==='witch'||
          e.cast||e.windup)&&this.los(e.x,e.y,this.player.x,this.player.y);
      })||
        (this.tile(this.player.x,this.player.y)?.fire>0&&
         this.tile(this.player.x,this.player.y)?.fireOwner!=='player');
    }
    validTarget(x,y,range=6){
      return this.inside(x,y)&&dist(this.player,{x,y})<=range&&this.los(this.player.x,this.player.y,x,y);
    }
    // The same ordered flood-fill drives damage and its visible chain animation.
    conductor(x,y){
      const tile=this.tile(x,y);
      if(!tile||!['water','ice'].includes(tile.t))return [];
      const q=[{x,y,step:0}],seen=new Set([key(x,y)]);
      // The entire connected component is the rule. No hidden 140-cell cap:
      // the 27x29 map itself provides a bounded maximum.
      for(let i=0;i<q.length;i++){
        for(const [dx,dy] of DIRS.slice(0,4)){
          const nx=q[i].x+dx,ny=q[i].y+dy,t=this.tile(nx,ny),k=key(nx,ny);
          if(!t||!['water','ice'].includes(t.t)||seen.has(k))continue;
          seen.add(k);q.push({x:nx,y:ny,step:q[i].step+1});
        }
      }
      return q;
    }
    emitEffect(type,from,points){
      this.effectSeq=(this.effectSeq||0)+1;
      if(!Array.isArray(this.effects))this.effects=[];
      this.effects.push({id:this.effectSeq,type,from:{x:from.x,y:from.y},
        points:points.map(p=>({x:p.x,y:p.y,step:p.step||0}))});
      this.effects=this.effects.slice(-5);
    }
    suggestSkill(){
      if(!this.alive||this.won)return null;
      const options=[],seenGroups=new Set();
      // Automatic selection may only use enemies that the player can see now.
      // Physical propagation can reach beyond vision, but must never
      // telepathically reveal or target enemies in the unexplored map.
      const visible=this.enemies.filter(e=>e.hp>0&&this.tile(e.x,e.y)?.lit);
      const consider=(index,p,score,name,reason)=>{
        const type=this.inventory[index].type,range=type==='gust'?5:6;
        if(score>0&&this.tile(p.x,p.y)?.lit&&this.validTarget(p.x,p.y,range))
          options.push({index,x:p.x,y:p.y,score,name,reason,type});
      };
      for(let index=0;index<this.inventory.length;index++){
        const type=this.inventory[index].type;
        if(type==='heal'&&this.maxHp-this.hp>=10)
          consider(index,this.player,this.hp<=this.maxHp-16?94:36,'回復','HPを回復');
        if(type==='spark'){
          for(const e of visible){
            const t=this.tile(e.x,e.y);
            consider(index,e,18+(['water','ice'].includes(t.t)?12:0),
              '雷撃','敵に雷を当てる');
            if(!['water','ice'].includes(t.t))continue;
            const group=this.conductor(e.x,e.y),id=key(group[0].x,group[0].y);
            // IDs cannot rely on BFS origin. Cache the whole component.
            if(seenGroups.has(key(e.x,e.y)))continue;
            for(const p of group)seenGroups.add(key(p.x,p.y));
            const occupied=new Set(group.map(p=>key(p.x,p.y)));
            const seenTargets=visible.filter(enemy=>occupied.has(key(enemy.x,enemy.y)));
            const launch=group.filter(p=>this.tile(p.x,p.y)?.lit&&this.validTarget(p.x,p.y,6))
              .sort((a,b)=>dist(a,this.player)-dist(b,this.player))[0];
            if(launch&&seenTargets.length)
              consider(index,launch,26+seenTargets.length*14+Math.min(12,group.length/8),
                '雷連鎖','見えている敵へ水脈から雷');
          }
        }
        if(type==='frost')for(const e of visible){
          const crowd=visible.filter(q=>dist(q,e)<=2).length;
          const water=['water','ice'].includes(this.tile(e.x,e.y).t)?
            this.conductor(e.x,e.y).length:0;
          consider(index,e,12+crowd*11+Math.min(12,water/5),
            '氷結','敵と水脈を凍らせる');
        }
        if(type==='ember')for(const e of visible){
          let fuel=0,crowd=0;
          for(let y=e.y-1;y<=e.y+1;y++)for(let x=e.x-1;x<=e.x+1;x++){
            const tile=this.tile(x,y);
            if(tile&&['oil','bush'].includes(tile.t))fuel++;
            if(visible.some(q=>q.x===x&&q.y===y))crowd++;
          }
          if(fuel>0)consider(index,e,13+fuel*3+crowd*5,'延焼','油や草に着火する');
        }
        if(type==='gust')for(const e of visible){
          const dx=Math.sign(e.x-this.player.x),dy=Math.sign(e.y-this.player.y);
          const next=this.tile(e.x+dx,e.y+dy);
          const crash=!next||next.t==='wall'||!!this.enemyAt(e.x+dx,e.y+dy);
          const hazard=this.trapAt(e.x+dx,e.y+dy)||next?.fire>0;
          consider(index,e,10+(crash?14:0)+(hazard?24:0),'突風','敵を障害物へ押す');
        }
        if(type==='smoke'&&visible.some(e=>e.cast==='arrow'))
          consider(index,this.player,35,'煙幕','射線を遮る');
      }
      options.sort((a,b)=>b.score-a.score||a.index-b.index);
      return options[0]||null;
    }
    useItem(index,x,y){
      if(!this.alive||this.won)return {ok:false,reason:'ended'};
      const item=this.inventory[index];if(!item)return {ok:false,reason:'missing'};
      if(item.type==='heal'){
        if(this.hp>=this.maxHp)return {ok:false,reason:'full'};
        this.beginAction();
        this.hp=Math.min(this.maxHp,this.hp+12);
        this.emitEffect('heal',this.player,[{...this.player,step:0}]);
        this.say('治癒の薬で傷を癒した。');
      }else{
        if(!this.validTarget(x,y,item.type==='gust'?5:6))return {ok:false,reason:'range'};
        if(item.type==='gust'&&!this.enemyAt(x,y))return {ok:false,reason:'target'};
        if(item.type==='ember'){
          let burnable=false;
          for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){
            const t=this.tile(xx,yy);
            if(t&&t.t!=='wall'&&t.t!=='water'&&t.t!=='ice')burnable=true;
          }
          if(!burnable)return {ok:false,reason:'target'};
        }
        this.beginAction();
        const source={...this.player};
        if(item.type==='spark'){
          const waves=this.conductor(x,y);
          const affected=waves.length?waves:[{x,y,step:0}];
          const hits=new Map();
          for(const p of affected){
            const e=this.enemyAt(p.x,p.y);
            if(e)hits.set(e,p.step);
          }
          const direct=this.enemyAt(x,y);
          if(direct&&!hits.has(direct))hits.set(direct,0);
          this.emitEffect('spark',source,affected);
          let visibleHits=0,visibleDamage=0,visibleKills=0;
          for(const [e,step] of hits){
            const lit=!!this.tile(e.x,e.y)?.lit;
            // Connected water conducts anywhere. Distance reduces damage
            // and stun; water spirits are weak to lightning, stone guards resist.
            const falloff=Math.floor(step/10);
            const damage=Math.max(4,9-falloff)+(e.type==='eel'?2:0)-(e.type==='guard'?3:0);
            const dealt=Math.max(1,damage);
            e.stun=Math.max(e.stun,step<=12?2:1);
            const beforeKills=this.kills;
            this.damageEnemy(e,dealt,'雷が'+MONSTERS[e.type].name+'を撃った。',!lit);
            if(lit){visibleHits++;visibleDamage+=dealt;visibleKills+=this.kills-beforeKills;}
          }
          this.say('雷連鎖：'+affected.length+'マス伝播 / 目視'+visibleHits+
            '体に'+visibleDamage+'ダメージ'+(visibleKills?' / '+visibleKills+'体撃破':''));
          
        }
        if(item.type==='frost'){
          const network=this.conductor(x,y),area=new Map();
          for(let yy=y-2;yy<=y+2;yy++)for(let xx=x-2;xx<=x+2;xx++){
            const t=this.tile(xx,yy);
            if(!t||dist({x,y},{x:xx,y:yy})>2)continue;
            area.set(key(xx,yy),{x:xx,y:yy,step:dist({x,y},{x:xx,y:yy})});
          }
          for(const p of network)area.set(key(p.x,p.y),p);
          let frozen=0,stopped=0;
          for(const p of area.values()){
            const t=this.tile(p.x,p.y);if(!t||t.t==='wall')continue;
            if(t.t==='water'){t.t='ice';frozen++;}
            if(t.fire){t.fire=0;t.fireOwner=null;}
            const e=this.enemyAt(p.x,p.y);
            if(e){e.stun=Math.max(e.stun,2);e.cast=null;e.windup=false;
              if(this.tile(e.x,e.y)?.lit)stopped++;}
          }
          this.emitEffect('frost',source,[...area.values()]);
          this.say('氷結：'+frozen+'マスを変化 / 目視'+stopped+'体を足止め');
        }
        if(item.type==='ember'){
          const flame=[];
          for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){
            const t=this.tile(xx,yy);if(!t||['wall','water','ice'].includes(t.t))continue;
            const hostile=t.fire>0&&t.fireOwner!=='player';
            t.fire=Math.max(t.fire,t.t==='oil'||t.t==='bush'?5:3);
            t.fireOwner=hostile?'enemy':'player';
            flame.push({x:xx,y:yy,step:dist({x,y},{x:xx,y:yy})});
          }
          // Prevalidated above, before committing the player turn.
          this.emitEffect('ember',source,flame);
          this.say('延焼：'+flame.length+'マスに着火。自分の炎は無害！');
        }
        if(item.type==='gust'){
          const e=this.enemyAt(x,y);if(!e)return {ok:false,reason:'target'};
          const dx=Math.sign(e.x-this.player.x),dy=Math.sign(e.y-this.player.y);
          const trail=[{x:e.x,y:e.y,step:0}];
          for(let i=0;i<2;i++){
            const nx=e.x+dx,ny=e.y+dy;
            if(!this.walkable(nx,ny)||this.enemyAt(nx,ny)||this.blockedDiagonal(e.x,e.y,nx,ny)){
              this.damageEnemy(e,4,'壁に激突！');break;
            }
            e.x=nx;e.y=ny;trail.push({x:nx,y:ny,step:i+1});
            if(this.trapAt(nx,ny)){this.triggerTrap(e);break;}
            const t=this.tile(nx,ny);if(t&&t.fire>0){this.damageEnemy(e,4,'炎へ吹き飛ばした！');break;}
          }
          this.emitEffect('gust',source,trail);
          this.say('突風が敵を押し流した。');
        }
        if(item.type==='smoke'){
          const area=[];
          for(let yy=y-2;yy<=y+2;yy++)for(let xx=x-2;xx<=x+2;xx++){
            const t=this.tile(xx,yy);
            if(t&&t.t!=='wall'&&dist({x,y},{x:xx,y:yy})<=2){
              t.smoke=4;area.push({x:xx,y:yy,step:dist({x,y},{x:xx,y:yy})});
            }
          }
          this.emitEffect('smoke',source,area);
          this.say('濃い煙が視線を遮った。');
        }
      }
      this.inventory.splice(index,1);
      this.advance();return {ok:true};
    }
    _enemyStep(e){
      const d=dist(e,this.player);
      if(d>7&&!e.alert&&this.rnd()<0.75)return;
      if(d<=6&&this.los(e.x,e.y,this.player.x,this.player.y))e.alert=true;
      if(!e.alert&&this.rnd()<0.65)return;
      const options=DIRS.map(([dx,dy])=>({x:e.x+dx,y:e.y+dy})).filter(p=>
        this.walkable(p.x,p.y)&&!this.enemyAt(p.x,p.y)&&!(p.x===this.player.x&&p.y===this.player.y)&&
        !this.blockedDiagonal(e.x,e.y,p.x,p.y)&&!(this.tile(p.x,p.y).fire>0&&e.type!=='witch'));
      if(!options.length)return;
      const terrainBias=(p)=>{const t=this.tile(p.x,p.y).t;
        return e.type==='eel'&&t==='water'?-0.6:e.type==='sprout'&&t==='bush'?-0.3:
          e.type==='witch'&&t==='oil'?-0.45:0;};
      options.sort((a,b)=>dist(a,this.player)-dist(b,this.player)+terrainBias(a)-terrainBias(b));
      const next=options[0];
      if(dist(next,this.player)<d||this.rnd()<0.12){e.x=next.x;e.y=next.y;this.triggerTrap(e);}
    }
    advance(){
      if(!this.alive||this.won)return;
      if(!this._turnStarted)this.turn++;
      this._turnStarted=false;
      // Environmental hazards evolve at most one tile each turn per source.
      const ignite=[];
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
        const t=this.tile(x,y);
        if(t.fire>0){
          if(t.t==='water'||t.t==='ice'){t.fire=0;t.fireOwner=null;continue;}
          t.fire--;
          if(t.fire===0)t.fireOwner=null;
          if(t.fire>0&&this.rnd()<0.42)for(const [dx,dy] of DIRS.slice(0,4)){
            const n=this.tile(x+dx,y+dy);
            if(n&&(n.t==='oil'||n.t==='bush')&&n.fire===0)
              ignite.push({x:x+dx,y:y+dy,source:{x,y},owner:t.fireOwner||'enemy'});
          }
        }
        if(t.smoke>0)t.smoke--;
      }
      const newFlames=[];
      for(const p of ignite){
        const t=this.tile(p.x,p.y);if(!t||t.fire>0)continue;
        t.fire=4;t.fireOwner=p.owner;
        newFlames.push({x:p.x,y:p.y,step:1});
      }
      if(newFlames.length)this.emitEffect('spread',ignite[0].source,newFlames);
      if(this.tile(this.player.x,this.player.y).fire>0&&
         this.tile(this.player.x,this.player.y).fireOwner!=='player'){
        this.hp-=3;this.say('燃える床で3ダメージ！');this.checkDeath();
      }
      if(!this.alive)return;
      for(const e of [...this.enemies]){
        if(e.hp<=0)continue;
        const t=this.tile(e.x,e.y);
        if(t.fire>0&&e.type!=='witch'){this.damageEnemy(e,3,'炎が'+MONSTERS[e.type].name+'を焼いた。');if(e.hp<=0)continue;}
        if(e.stun>0){e.stun--;e.cast=null;e.windup=false;continue;}
        if(e.cast){
          const spell=e.cast;e.cast=null;
          const reach=dist(e,this.player),sight=this.los(e.x,e.y,this.player.x,this.player.y);
          if(spell==='arrow'&&reach<=4&&sight){
            this.hp-=2;this.say('射手の予告された矢が命中！ -2HP');
          }else if(spell==='fire'&&reach<=4&&sight){
            const p=this.tile(this.player.x,this.player.y);
            if(p.t!=='water'&&p.t!=='ice'){
              p.fire=2;p.fireOwner='enemy';this.say('火術師の炎が足元に残った！ 次に動く前に退避しよう。');
            }
          }else this.say('敵の狙いを外した！');
          this.checkDeath();if(!this.alive)break;continue;
        }
        const d=dist(e,this.player),visible=this.los(e.x,e.y,this.player.x,this.player.y);
        if(e.windup){
          e.windup=false;
          if(d===1&&visible){this.hp-=MONSTERS[e.type].atk+2;this.say('重装獣の大振りが命中！');}
          else this.say('重装獣の大振りを回避した。');
          this.checkDeath();if(!this.alive)break;continue;
        }
        if(d===1&&visible){
          if(e.type==='brute'){e.windup=true;this.say('重装獣が大きく腕を振り上げた！');continue;}
          const hit=MONSTERS[e.type].atk+(e.type==='eel'&&this.tile(this.player.x,this.player.y).t==='water'?2:0);
          this.hp-=hit;this.say(MONSTERS[e.type].name+'から'+hit+'ダメージ。');this.checkDeath();if(!this.alive)break;
        }else if(e.type==='archer'&&d<=4&&visible){
          e.cast='arrow';this.say('射手が弓を引いた！ 次のターンに射撃。');
        }else if(e.type==='witch'&&d<=4&&visible){
          e.cast='fire';this.say('火術師が詠唱を始めた！ 次のターンに炎。');

        }else this._enemyStep(e);
      }
      this.updateVision();
    }
    inspect(x,y) {
      if(!this.inside(x,y))return {name:'闇',desc:'未探索の場所'};
      const t=this.tile(x,y);
      if(!t.seen)return {name:'未探索',desc:'そこには何があるだろう。'};
      const e=t.lit?this.enemyAt(x,y):null,i=t.lit?this.itemAt(x,y):null,trap=this.trapAt(x,y);
      if(e){const d=MONSTERS[e.type];
        const resist=e.type==='guard'?' · 雷に強い':e.type==='eel'?' · 雷に弱い':e.type==='witch'?' · 炎に強い':'';
        return {name:d.name,desc:'HP '+e.hp+'/'+e.maxHp+' · 攻撃'+d.atk+resist+(e.windup?' · 次のターンに強攻撃！':e.cast==='arrow'?' · 次のターンに射撃！':e.cast==='fire'?' · 次のターンに火術！':'')};}
      if(i)return {name:ITEM[i.type].name,desc:ITEM[i.type].desc};
      if(x===this.stairs.x&&y===this.stairs.y)return {name:this.floor===MAX_FLOOR?'星の核':'下り階段',desc:'踏むと次の階層へ進む。'};
      if(trap&&trap.known)return {name:'針の罠',desc:'発見済み。踏むと5ダメージ。敵を押し込むと有利。'};
      if(t.fire>0)return {name:t.fireOwner==='player'?'自分の炎':'危険な炎',
        desc:t.fireOwner==='player'?'自分の技の炎なので無害。敵は燃える。':'敵・環境由来の炎。毎ターン3ダメージ。'};
      const names={wall:'岩壁',floor:'石床',water:'水脈',oil:'油溜まり',bush:'茂み',ice:'氷床'};
      const desc={wall:'通れない。視界も遮る。',floor:'歩ける床。',water:'雷が伝わり、氷結の瓶で凍る。',oil:'火種で燃え広がる。',bush:'燃えやすく、移動を妨げる。',ice:'水脈を凍らせてできた床。'};
      return {name:names[t.t]||t.t,desc:desc[t.t]||''};
    }
    status(){return {floor:this.floor,maxFloor:MAX_FLOOR,hp:this.hp,maxHp:this.maxHp,attack:this.attack,turn:this.turn,kills:this.kills,score:this.score,alive:this.alive,won:this.won,theme:this.theme().name};}
  }
  return {Game,MONSTERS,ITEM,THEMES,W,H,MAX_FLOOR,DIRS};
});
