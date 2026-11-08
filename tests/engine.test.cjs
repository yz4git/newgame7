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
assert.ok(h.enemies.every(e=>e.hp<=32),'water shock must hit connected enemies');
assert.equal(h.inventory.length,2);
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

console.log('PASS: 100 seeded maps, connectivity, traps, saves, items, environmental lightning, and victory.');
