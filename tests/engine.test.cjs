'use strict';
const assert=require('node:assert/strict');
const {Game,W,H,MAX_FLOOR}=require('../engine.js');
function reachable(g){
  const start=g.player,visited=new Set([start.x+','+start.y]),q=[start];
  for(let i=0;i<q.length;i++){
    const p=q[i];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
      const x=p.x+dx,y=p.y+dy,k=x+','+y;
      if(!g.walkable(x,y)||g.blockedDiagonal(p.x,p.y,x,y)||visited.has(k))continue;
      visited.add(k);q.push({x,y});
    }
  }
  return visited.has(g.stairs.x+','+g.stairs.y);
}
for(let seed=1;seed<=100;seed++){
  const g=new Game(seed);
  assert.equal(g.map.length,H);assert.equal(g.map[0].length,W);
  assert.ok(g.rooms.length>=2);assert.ok(reachable(g),'unreachable map '+seed);
  assert.equal(g.turn,0);assert.equal(g.floor,1);assert.equal(g.alive,true);
  const restored=Game.restore(g.serialize());
  assert.equal(restored.seed,g.seed);assert.equal(restored.player.x,g.player.x);
}
const g=new Game(4837);g.enemies=[];g.items=[];g.traps=[];
const move=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]].find(([dx,dy])=>g.walkable(g.player.x+dx,g.player.y+dy)&&!g.blockedDiagonal(g.player.x,g.player.y,g.player.x+dx,g.player.y+dy));
assert.ok(move);
const x=g.player.x+move[0],y=g.player.y+move[1];
g.traps=[{id:8000,x,y,used:false,known:false}];
const old=g.hp,turn=g.turn;
assert.equal(g.move(...move).ok,true);
assert.equal(g.hp,old-5);assert.equal(g.turn,turn+1);assert.equal(g.traps[0].used,true);
const snap=g.turn;
g.inspect(x,y);g.pathTo(g.stairs.x,g.stairs.y);
assert.equal(g.turn,snap);
assert.equal(g.useItem(1,999,999).ok,false);assert.equal(g.turn,snap);
const h=new Game(995);h.enemies=[];h.items=[];h.traps=[];
const p=h.player,points=[[p.x+1,p.y],[p.x+2,p.y]];
for(const [xx,yy] of points){h.tile(xx,yy).t='water';}
h.enemies.push({id:900,type:'guard',x:points[0][0],y:points[0][1],hp:40,maxHp:40,stun:0,windup:false,alert:false});
h.enemies.push({id:901,type:'guard',x:points[1][0],y:points[1][1],hp:40,maxHp:40,stun:0,windup:false,alert:false});
assert.equal(h.useItem(1,points[0][0],points[0][1]).ok,true);
assert.ok(h.enemies.every(e=>e.hp<=35),'guard resists but receives connected lightning');
assert.equal(h.inventory.length,3);
const w=new Game(108);
for(let floor=1;floor<MAX_FLOOR;floor++){w.descend();assert.equal(w.floor,floor+1);}
assert.equal(w.won,false);w.descend();assert.equal(w.won,true);

// Tactical regression tests after the first gameplay review.
const tactics=new Game(7621);
tactics.enemies=[];tactics.items=[];tactics.traps=[];
tactics.player={x:10,y:10};
for(let yy=7;yy<=14;yy++)for(let xx=7;xx<=15;xx++)tactics.tile(xx,yy).t='floor';
tactics.stairs={x:13,y:10};
tactics.updateVision();
const trap={id:994,x:11,y:10,known:false,used:false};
tactics.traps=[trap];
const turnBeforeRecon=tactics.turn;
tactics.updateVision();
assert.equal(trap.known,true,'traps in sight should become visible before stepping');
assert.equal(tactics.turn,turnBeforeRecon,'discovering traps consumes no turn');
assert.equal(tactics.inspect(11,10).name,'針の罠');
const detour=tactics.pathTo(13,10);
assert.ok(detour.length>0,'path must exist around a revealed trap');
assert.ok(!detour.some(p=>p.x===11&&p.y===10),'autopath should prefer a safe detour');
const intentionallyRisky=new Game(11);intentionallyRisky.enemies=[];intentionallyRisky.items=[];intentionallyRisky.traps=[];
const trapStep=[1,0];intentionallyRisky.player={x:10,y:10};
for(let yy=8;yy<=12;yy++)for(let xx=8;xx<=13;xx++)intentionallyRisky.tile(xx,yy).t='floor';
intentionallyRisky.traps=[{id:1,x:11,y:10,known:true,used:false}];
assert.equal(intentionallyRisky.move(...trapStep).ok,true,'engine supports deliberate dangerous steps');
assert.equal(intentionallyRisky.hp,25);
const corners=new Game(15);corners.enemies=[];corners.items=[];corners.traps=[];
corners.player={x:10,y:10};
for(let yy=8;yy<=13;yy++)for(let xx=8;xx<=13;xx++)corners.tile(xx,yy).t='floor';
corners.tile(11,10).t='wall';
corners.enemies=[{id:999,type:'sprout',x:11,y:11,hp:7,maxHp:7,stun:0,windup:false,cast:null,alert:true}];
assert.equal(corners.blockedDiagonal(10,10,11,11),true);
const flanking=corners.pathTo(11,11,true);
assert.ok(flanking.length>0,'tap on corner-blocked enemy should offer flanking path');
const flank=flanking[flanking.length-1];
assert.equal(Math.max(Math.abs(flank.x-11),Math.abs(flank.y-11)),1);
assert.equal(corners.blockedDiagonal(flank.x,flank.y,11,11),false);
const ranged=new Game(30);ranged.enemies=[];ranged.items=[];ranged.traps=[];
ranged.player={x:10,y:10};
for(let yy=8;yy<=13;yy++)for(let xx=8;xx<=15;xx++)ranged.tile(xx,yy).t='floor';
ranged.enemies=[{id:702,type:'archer',x:13,y:10,hp:9,maxHp:9,stun:0,windup:false,cast:null,alert:true}];
const originalHp=ranged.hp;
ranged.advance();
assert.equal(ranged.hp,originalHp,'archer needs a warning turn before firing');
assert.equal(ranged.enemies[0].cast,'arrow');
ranged.advance();
assert.equal(ranged.hp,originalHp-2,'archer fires only after its warning');
const caster=new Game(32);caster.enemies=[];caster.items=[];caster.traps=[];
caster.player={x:10,y:10};
for(let yy=8;yy<=13;yy++)for(let xx=8;xx<=15;xx++)caster.tile(xx,yy).t='floor';
caster.enemies=[{id:704,type:'witch',x:13,y:10,hp:10,maxHp:10,stun:0,windup:false,cast:null,alert:true}];
caster.advance();assert.equal(caster.enemies[0].cast,'fire');
caster.enemies[0].stun=2;
caster.advance();assert.equal(caster.enemies[0].cast,null,'stunning must cancel a pending cast');
assert.equal(caster.tile(10,10).fire,0);
const environment=[];
for(let seed=11;seed<=55;seed++){
  const g=new Game(seed);
  const near=g.enemies.filter(e=>{
    const t=g.tile(e.x,e.y);
    return ['water','oil','bush'].includes(t.t) ||
      [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>['water','oil','bush'].includes(g.tile(e.x+dx,e.y+dy)?.t));
  });
  environment.push(near.length/g.enemies.length);
  assert.ok(g.pathTo(g.stairs.x,g.stairs.y).length>0,'stair path blocked by an enemy: '+seed);
}
const envRatio=environment.reduce((a,b)=>a+b,0)/environment.length;
assert.ok(envRatio>=0.42,'enemies should meaningfully interact with terrain: '+envRatio);
console.log('PASS: trap discovery, safe detours, manual hazard stepping, corner flanking, telegraphed spells, terrain placement ('+(envRatio*100).toFixed(1)+'%)');



// Elemental-first floors remain navigable and mostly interactive.
const coverage=[];
for(let seed=1;seed<=100;seed++){
  const field=new Game(seed);
  const walk=field.map.flat().filter(t=>t.t!=='wall');
  const elemental=walk.filter(t=>['water','oil','bush','ice'].includes(t.t));
  const ratio=elemental.length/walk.length;
  coverage.push(ratio);
  assert.ok(ratio>.75,'insufficient elemental tiles on seed '+seed+': '+ratio);
  assert.ok(field.pathTo(field.stairs.x,field.stairs.y).length>0,
    'elemental floor must stay connected: '+seed);
}
const average=coverage.reduce((a,b)=>a+b,0)/coverage.length;
assert.ok(average>.82,'elemental area should dominate');

// Friendly-fire ownership survives multiple ticks and secondary spread.
const own=new Game(426);own.enemies=[];own.items=[];own.traps=[];
own.player={x:10,y:10};
for(let y=7;y<=13;y++)for(let x=7;x<=14;x++){
  own.tile(x,y).t='oil';own.tile(x,y).fire=0;
}
own.tile(10,10).t='oil';
const ownStart=own.hp, ownTurn=own.turn;
const ember=own.inventory.findIndex(i=>i.type==='ember');
assert.ok(ember>=0,'starting inventory should have a fire spell');
assert.equal(own.useItem(ember,10,10).ok,true);
assert.equal(own.turn,ownTurn+1);
assert.equal(own.hp,ownStart,'own fire must not damage player');
assert.equal(own.tile(10,10).fireOwner,'player');
assert.ok(own.effects.some(e=>e.type==='ember'));
for(let i=0;i<4;i++)own.advance();
assert.equal(own.hp,ownStart,'propagated friendly fire must stay harmless');
assert.ok(own.effects.some(e=>e.type==='spread'),'spread animation event missing');
assert.ok(own.effects.every(e=>e.points.length<=W*H),'VFX may cover the entire map');
const friendly=Array.from({length:7},(_,y)=>Array.from({length:8},(_,x)=>
  own.tile(x+7,y+7))).flat().filter(t=>t.fire>0);
assert.ok(friendly.length>0,'fire should have propagated over oil terrain');
assert.ok(friendly.every(t=>t.fireOwner==='player'));

// Enemy fire remains dangerous even if the player has previously cast fire.
const hostile=new Game(427);hostile.enemies=[];hostile.items=[];hostile.traps=[];
hostile.player={x:10,y:10};
for(let y=9;y<=12;y++)for(let x=8;x<=14;x++)hostile.tile(x,y).t='floor';
hostile.enemies=[{id:950,type:'witch',x:13,y:10,hp:10,maxHp:10,cast:'fire',
  windup:false,alert:true,stun:0}];
hostile.advance();
assert.equal(hostile.tile(10,10).fireOwner,'enemy');
const hpBeforeEnemyFire=hostile.hp;
hostile.advance();
assert.equal(hostile.hp,hpBeforeEnemyFire-3,
  'enemy-origin flame must still damage the adventurer');

// Electric chain must have the same wave tiles in VFX and damage logic.
const z=new Game(428);z.enemies=[];z.items=[];z.traps=[];
z.player={x:10,y:10};
for(let x=11;x<=16;x++){z.tile(x,10).t='water';}
z.enemies=[{id:960,type:'guard',x:16,y:10,hp:30,maxHp:30,
  cast:null,stun:0,windup:false,alert:false}];
const beforeLightning=z.enemies[0].hp;
assert.equal(z.useItem(1,11,10).ok,true);
assert.equal(z.enemies[0].hp,beforeLightning-6,'stone guardian should resist chained lightning');
const electric=z.effects.find(e=>e.type==='spark');
assert.ok(electric&&electric.points.length>=6,'electric wave tiles missing');
assert.equal(electric.points.find(p=>p.x===16&&p.y===10).step,5);
assert.ok(z.effectSeq>=1);
const revived=Game.restore(z.serialize());
assert.equal(revived.effectSeq,z.effectSeq,'effect state should save cleanly');
const quick=new Game(998),suggest=quick.suggestSkill();
assert.ok(suggest,'nearby enemies should enable quick skill');
assert.ok(suggest.index>=0&&suggest.index<quick.inventory.length);
const beforeQuick=quick.turn,countBefore=quick.inventory.length;
assert.equal(quick.useItem(suggest.index,suggest.x,suggest.y).ok,true);
assert.equal(quick.turn,beforeQuick+1);
assert.equal(quick.inventory.length,countBefore-1);
assert.ok(quick.effects.length>0,'one-tap cast should produce animated data');
// Old in-progress saves get denser elemental terrain without losing progress.
const oldRun=new Game(421);
oldRun.turn=17;oldRun.hp=24;oldRun.player={...oldRun.player};
const oldJson=JSON.parse(oldRun.serialize());
delete oldJson.elementRevision;
for(const row of oldJson.map)for(const t of row)
  if(['water','oil','bush','ice'].includes(t.t))t.t='floor';
oldJson.map[oldRun.player.y+2][oldRun.player.x].t='water';
const oldPlayer=oldJson.player,oldTurn=oldJson.turn;
const upgrade=Game.restore(oldJson);
assert.equal(upgrade.turn,oldTurn);
assert.deepEqual(upgrade.player,oldPlayer);
assert.equal(upgrade.hp,24);
assert.equal(upgrade.elementRevision,1);
const upgradedWalk=upgrade.map.flat().filter(t=>t.t!=='wall');
assert.ok(upgradedWalk.filter(t=>['water','oil','bush','ice'].includes(t.t)).length/
  upgradedWalk.length>.7,'old save did not get elemental floor');

console.log('PASS: 100 elemental floors ('+(average*100).toFixed(1)+
  '%), friendly/enemy fire ownership, propagated VFX, and one-tap skill.');


// Review v0.9: no omniscient one-button spells.
let hiddenOnly=0;
for(let seed=1;seed<=130;seed++){
  const s=new Game(seed);
  const visible=s.enemies.filter(e=>s.tile(e.x,e.y).lit);
  const proposed=s.suggestSkill();
  if(!visible.length){
    hiddenOnly++;
    assert.ok(!proposed||proposed.type==='heal',
      'auto-target must not detect hidden enemies in seed '+seed);
  }
}
assert.ok(hiddenOnly>20,'test must exercise hidden enemy cases');
const concealed=new Game(2);
assert.equal(concealed.enemies.filter(e=>concealed.tile(e.x,e.y).lit).length,0);
assert.equal(concealed.suggestSkill(),null,
  'unseen opponents must not enable offensive quick-cast');
const linked=concealed.conductor(10,11);
assert.ok(linked.length>140,'regression must cover the old 140-cell limit');
assert.equal(linked.length,199);
assert.equal(concealed.useItem(1,10,11).ok,true,'manual cast can reach a seen conductor');
const wave=concealed.effects.find(e=>e.type==='spark');
assert.equal(wave.points.length,linked.length,'VFX must represent every affected tile');
assert.equal(concealed.log[0].turn,concealed.turn,'spell log and turn counter disagree');
assert.ok(!concealed.log.some(e=>e.text.includes('を倒した')),
  'hidden victims must not leak into the player log');

// A visible target enables one-tap lightning, and all logged action
// effects have the completed turn number, including wait and traps.
const known=new Game(998),choice=known.suggestSkill();
assert.ok(choice&&choice.type==='spark');
const quickTurnBefore=known.turn;
assert.equal(known.useItem(choice.index,choice.x,choice.y).ok,true);
assert.equal(known.turn,quickTurnBefore+1);
assert.equal(known.log[0].turn,known.turn);
assert.match(known.log[0].text,/雷連鎖.*目視.*ダメージ/);
assert.ok(known.effects.find(e=>e.type==='spark').points.length>1);
const waited=new Game(430);
waited.wait();
assert.equal(waited.log[0].turn,waited.turn);
const stepped=new Game(439);stepped.enemies=[];stepped.items=[];stepped.traps=[];
stepped.player={x:10,y:10};
stepped.tile(10,10).t='floor';stepped.tile(11,10).t='floor';
stepped.traps=[{id:1,x:11,y:10,known:true,used:false}];
stepped.move(1,0);
assert.equal(stepped.turn,1);
assert.equal(stepped.log[0].turn,stepped.turn,'trap log uses player action turn');

// Bonuses persist into later levels without unlimited items.
const refill=new Game(460);
const initial=refill.inventory.length;refill.descend();
assert.equal(refill.floor,2);
assert.equal(refill.inventory.length,initial+1);
assert.ok(refill.log.some(e=>e.text.includes('階層報酬')));
const bonus=new Game(461);bonus.enemies=[];bonus.items=[];bonus.traps=[];
for(let i=0;i<4;i++){
  const dead={id:850+i,type:'runner',x:8+i,y:8,hp:1,maxHp:6};
  bonus.enemies.push(dead);
  bonus.damageEnemy(dead,10,'試験',false);
}
assert.equal(bonus.kills,4);
assert.equal(bonus.inventory.length,5,'four kills should award one technique');
assert.ok(bonus.inventory.every(it=>['heal','spark','frost','ember','gust','smoke'].includes(it.type)));
const silent=new Game(462);silent.enemies=[];silent.kills=3;silent.items=[];silent.traps=[];
const victim={id:881,type:'runner',x:12,y:12,hp:1,maxHp:6};
silent.enemies=[victim];
silent.damageEnemy(victim,10,'hidden test',true);
assert.equal(silent.inventory.length,4,'unseen kill must not telegraph a reward');
assert.ok(!silent.log.some(e=>e.text.includes('hidden test')||e.text.includes('を倒した')));

// The distance and enemy types now influence shock damage and stun.
const resist=new Game(463);resist.enemies=[];resist.items=[];resist.traps=[];
resist.player={x:10,y:10};
for(let x=11;x<=16;x++)resist.tile(x,10).t='water';
resist.enemies=[
  {id:882,type:'guard',x:11,y:10,hp:40,maxHp:40,stun:0,windup:false,cast:null,alert:false},
  {id:883,type:'eel',x:16,y:10,hp:40,maxHp:40,stun:0,windup:false,cast:null,alert:false}
];
resist.useItem(1,11,10);
assert.equal(resist.enemies.find(e=>e.id===882).hp,34,'stone guard lightning resistance');
assert.equal(resist.enemies.find(e=>e.id===883).hp,29,'water spirit lightning vulnerability');
assert.equal(resist.enemies.find(e=>e.id===883).stun,1,'enemy stun diminishes after advance');
console.log('PASS: no invisible targeting, full propagation, turn-matched logs,');
console.log('      floor/kill skill replenishment, enemy elemental resistance.');


// v0.11: discovered traps must not lock down their eight surrounding cells.
// Route planning should exclude the trap tile itself, but keep all safe
// adjacent squares eligible even when they touch multiple traps.
function trapRouteFixture(mode){
  const g=new Game(721);
  g.enemies=[];g.items=[];g.traps=[];
  g.player={x:10,y:10};g.stairs={x:22,y:23};
  for(let y=7;y<=14;y++)for(let x=7;x<=17;x++){
    const tile=g.tile(x,y);
    tile.t='floor';tile.fire=0;tile.fireOwner=null;
  }
  if(mode==='corridor'){
    for(let y=7;y<=14;y++)for(let x=7;x<=17;x++)
      g.tile(x,y).t=y===10&&x>=10&&x<=14?'floor':'wall';
  }
  return g;
}
const adjacentTrap=trapRouteFixture();
adjacentTrap.traps=[{id:9701,x:11,y:10,known:true,used:false}];
assert.equal(adjacentTrap.canSeeDanger(),false,
  'a trap beside the player is not itself an auto-movement emergency');
const safeDetour=adjacentTrap.pathTo(14,10);
assert.ok(safeDetour.length>=4,'known trap blocked a walkable adjacent route');
assert.ok(!safeDetour.some(p=>p.x===11&&p.y===10),
  'automatic route entered a known trap');
assert.ok(safeDetour.some(p=>Math.max(Math.abs(p.x-11),Math.abs(p.y-10))===1),
  'path should be able to hug a known trap');
const hpBeforePath=adjacentTrap.hp;
for(const point of safeDetour){
  const dx=point.x-adjacentTrap.player.x,dy=point.y-adjacentTrap.player.y;
  assert.equal(adjacentTrap.move(dx,dy).ok,true);
  assert.equal(adjacentTrap.canSeeDanger(),false,
    'auto movement stops just from trap adjacency');
}
assert.deepEqual(adjacentTrap.player,{x:14,y:10});
assert.equal(adjacentTrap.hp,hpBeforePath,'detour must be damage-free');
assert.equal(adjacentTrap.traps[0].used,false);

const multipleTraps=trapRouteFixture();
multipleTraps.traps=[
  {id:9702,x:11,y:10,known:true,used:false},
  {id:9703,x:12,y:10,known:true,used:false},
  {id:9704,x:13,y:10,known:true,used:false}
];
const multipleDetour=multipleTraps.pathTo(14,10);
assert.ok(multipleDetour.length>0,'multiple known traps blocked detour');
assert.ok(multipleDetour.every(p=>!multipleTraps.trapAt(p.x,p.y)),
  'route crosses a known trap');
assert.ok(multipleDetour.some(p=>p.y===11||p.y===9),
  'route should pass BESIDE the trap line');
assert.equal(multipleTraps.pathTo(11,10).length,0,
  'known trap may not be an automatic destination');
const corridor=trapRouteFixture('corridor');
corridor.traps=[{id:9705,x:11,y:10,known:true,used:false}];
assert.equal(corridor.pathTo(14,10).length,0,
  'single unavoidable known trap must not be crossed automatically');
const unseen=trapRouteFixture();
unseen.traps=[{id:9706,x:13,y:10,known:false,used:false}];
unseen.updateVision();
assert.equal(unseen.traps[0].known,false,'far trap should start undiscovered');
const originalRoute=unseen.pathTo(14,10);
assert.ok(originalRoute.some(p=>p.x===13&&p.y===10),
  'initial route should have no knowledge of the far trap');
const first=originalRoute[0];unseen.move(first.x-10,first.y-10);
assert.equal(unseen.traps[0].known,true,
  'approaching should reveal trap while automatic movement is in progress');
assert.equal(unseen.canSeeDanger(),false,
  'discovering a nearby trap does not force automatic movement to stop');
const revisedRoute=unseen.pathTo(14,10);
assert.ok(revisedRoute.length>0,'a newly discovered trap must allow re-routing');
assert.ok(!revisedRoute.some(p=>p.x===13&&p.y===10),
  'replanned route must avoid the discovered trap');
const ownFlame=trapRouteFixture();
ownFlame.tile(11,10).fire=2;ownFlame.tile(11,10).fireOwner='player';
assert.ok(ownFlame.pathTo(14,10).length>0,
  'own harmless fire must not block automatic movement');
const hostileFlame=trapRouteFixture();
hostileFlame.tile(11,10).fire=3;hostileFlame.tile(11,10).fireOwner='enemy';
const aroundFire=hostileFlame.pathTo(14,10);
assert.ok(aroundFire.length>0&&!aroundFire.some(p=>p.x===11&&p.y===10),
  'hostile flames should be avoided when a safe detour exists');
console.log('PASS: safe adjacency, multi-trap detours, blocked corridor,');
console.log('      newly discovered trap replanning and hostile fire avoidance.');


// v0.12: guaranteed safe stairs, legacy save repair, optional room rewards.
let allSafe=0,totalTraps=0,roomGenerated=0;
for(const depth of [1,3,6,9,12])for(let seed=1;seed<=100;seed++){
  const g=new Game(seed);g.floor=depth;g.generate();
  allSafe++;totalTraps+=g.traps.length;
  assert.ok(g.safeRouteExists(),'trap-locked map seed '+seed+' floor '+depth);
  assert.ok(g.pathTo(g.stairs.x,g.stairs.y).length>0,
    'path planner must find the guaranteed safe route');
  assert.equal(g.rooms[0].visited,true,'start room must be marked visited');
  assert.equal(g.discoveries,1);
  if(g.rooms.length>=3)roomGenerated++;
}
assert.ok(totalTraps>allSafe*2,'trap prevention erased nearly all hazards');
assert.ok(roomGenerated>allSafe*.8,'exploration rooms absent');

// The older generator used to strand the hero in a single-tile corridor.
const oldLocked=trapRouteFixture('corridor');
oldLocked.stairs={x:14,y:10};
oldLocked.traps=[{id:8900,x:11,y:10,known:true,used:false},
  {id:8901,x:14,y:12,known:false,used:false}];
assert.equal(oldLocked.safeRouteExists(),false);
oldLocked.turn=48;oldLocked.hp=17;
delete oldLocked.routeRevision;
const repaired=Game.restore(oldLocked.serialize());
assert.equal(repaired.turn,48,'restore must preserve action count');
assert.equal(repaired.hp,17,'restore must preserve HP');
assert.ok(repaired.safeRouteExists(),'restored old trap corridor remained blocked');
assert.equal(repaired.traps.length,1,'remove only the mandatory choke-point trap');
assert.equal(repaired.traps[0].id,8901,'unrelated trap must stay');
assert.equal(repaired.routeRevision,1);
assert.equal(Game.restore(repaired.serialize()).traps.length,1,
  'upgraded save must not be mutated twice');

// Unvisited rooms are optional detours with a tangible periodic payoff.
const discover=new Game(4532);
assert.ok(discover.rooms.length>=4);
discover.rooms.forEach(r=>r.visited=false);
discover.discoveries=0;discover.hp=18;
const beforeScore=discover.score;
for(let i=0;i<3;i++){
  discover.player={x:discover.rooms[i].cx,y:discover.rooms[i].cy};
  discover.discoverRoom();
}
assert.equal(discover.discoveries,3);
assert.equal(discover.hp,24,'third discovered room should replenish health');
assert.ok(discover.score>=beforeScore+180);
discover.discoverRoom();
assert.equal(discover.discoveries,3,'no repeat farming for revisiting same room');
const exploredSave=Game.restore(discover.serialize());
assert.equal(exploredSave.discoveries,3,'room reward progress must survive saves');
assert.ok(exploredSave.rooms.slice(0,3).every(r=>r.visited));
const satchel=new Game(4532);
satchel.rooms.forEach(r=>r.visited=false);satchel.discoveries=0;
satchel.hp=satchel.maxHp;
for(let i=0;i<3;i++){
  satchel.player={x:satchel.rooms[i].cx,y:satchel.rooms[i].cy};
  satchel.discoverRoom();
}
assert.equal(satchel.inventory.length,5,
  'exploring three rooms at full HP should grant a technique');

// Faraway visible enemies no longer halt automatic walking prematurely.
const farAlert=new Game(4555);farAlert.enemies=[];farAlert.items=[];farAlert.traps=[];
farAlert.player={x:10,y:10};
for(let y=8;y<=16;y++)for(let x=8;x<=16;x++)farAlert.tile(x,y).t='floor';
farAlert.enemies=[{id:998,type:'sprout',x:14,y:10,hp:7,maxHp:7,
  alert:true,stun:0,cast:null,windup:false}];
farAlert.updateVision();
assert.equal(farAlert.tile(14,10).lit,true,'enemy should be visible');
assert.equal(farAlert.canSeeDanger(),false,'distant melee enemy is not immediate danger');
farAlert.enemies[0].x=12;
farAlert.updateVision();
assert.equal(farAlert.canSeeDanger(),true,'nearby enemy must still stop auto movement');
console.log('PASS: 500 trap-safe maps, legacy trap repair, exploration rewards,');
console.log('      save persistence, far-enemy route risk distinction.');

console.log('PASS: 100 seeded maps, connectivity, traps, saves, items, environmental lightning, and victory.');
