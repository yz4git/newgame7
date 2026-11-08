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
console.log('PASS: 100 seeded maps, connectivity, traps, saves, items, environmental lightning, and victory.');
