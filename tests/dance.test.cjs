/* Node tests for the new KAWAII MOTION game. No browser dependencies. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
global.window=global;
require("../dance-graph.js");
const graph=global.KAWAII_GRAPH;
const shots=graph.shots;
assert.equal(graph.maxBeats,5);
assert.equal(graph.moods.length,5);
assert.ok(Object.keys(shots).length>=14);
for(const [id,node] of Object.entries(shots)){
  assert.equal(id,node.id);
  assert.ok(node.duration>2500);
  if(node.terminal)continue;
  assert.equal(node.choices.length,3);
  assert.ok(node.cueAt<node.window[0]&&node.window[0]<node.window[1]&&node.window[1]<=node.cutAt);
  assert.ok((node.window[1]-node.window[0])*node.duration>1000,"readable choice window "+id);
  assert.deepEqual(node.choices.map(c=>c.style),["cute","cool","surprise"]);
  for(const action of node.choices){assert.ok(shots[action.next],"broken route "+id+" > "+action.next);}
}
assert.equal(["win","tie","lose"].filter(id=>shots[id].terminal).length,3);
let clock=0,raf=null,visHandler=null;
const els=new Map();
function mock(){
  const callbacks={},classes=new Set();
  return {
    callbacks,children:[],style:{},dataset:{},textContent:"",src:"",files:[],value:"",disabled:false,offsetWidth:0,
    classList:{
      add(x){classes.add(x)},remove(x){classes.delete(x)},
      toggle(x,bool){if(bool)classes.add(x);else classes.delete(x)},
      contains(x){return classes.has(x)}
    },
    addEventListener(name,fn){callbacks[name]=fn},append(...items){this.children.push(...items)},
    replaceChildren(...items){this.children=items},setAttribute(){},
    removeAttribute(k){if(k==="src")this.src=""},
    pause(){},load(){},play(){return Promise.resolve()},
    press(){if(!this.disabled)callbacks.click?.()},fire(type){callbacks[type]?.()}
  };
}
const document={
 getElementById(id){if(!els.has(id))els.set(id,mock());return els.get(id)},
 createElement:mock,hidden:false,addEventListener(name,fn){if(name==="visibilitychange")visHandler=fn;}
};
const E=id=>document.getElementById(id);
const source=fs.readFileSync(path.join(__dirname,"../dance.js"),"utf8");
new Function("window","document","performance","requestAnimationFrame","fetch","localStorage",source)(
  global,document,{now:()=>clock},fn=>raf=fn,
  ()=>Promise.resolve({ok:true,json:()=>Promise.resolve({})}),
  {getItem(){return null},setItem(){}}
);
const tick=ms=>{clock+=ms;raf(clock)};
function playStart(){E("startBtn").press();assert.equal(E("sceneTitle").textContent,shots.opening.title)}
function choose(index,id){
  const node=shots[id];assert.equal(E("sceneTitle").textContent,node.title,"expected "+id);
  const before=Number(E("heroFans").textContent.replace(/,/g,""));
  const at=Math.round(node.duration*.70);
  tick(at);
  assert.equal(E("cueLabel").textContent,"APPEAL NOW","open window at "+id);
  E("choices").children[index].press();
  assert.equal(E("sceneTitle").textContent,node.title,"choice buffered");
  assert.equal(E("cueLabel").textContent,"LOCKED");
  E("choices").children[(index+1)%3].press();
  tick(Math.round(node.duration*(node.cutAt-.70))+22);
  const after=Number(E("heroFans").textContent.replace(/,/g,""));
  assert.ok(after>before,"new fans from "+id);
  return node.choices[index].next;
}
assert.ok(E("titleOverlay").classList.contains("visible"));
playStart();
tick(650);
E("choices").children[0].press();
assert.equal(E("heroFans").textContent,"650","early input has no consequence");
tick(Math.round(shots.opening.duration*.70)-650);
E("choices").children[0].press();
tick(Math.round(shots.opening.duration*(shots.opening.cutAt-.70))+22);
assert.equal(E("sceneTitle").textContent,shots.heart.title);
assert.ok(Number(E("heroFans").textContent.replace(/,/g,""))>650);
const scoreAfterBeat1=E("heroFans").textContent;
E("retakeBtn").press();
assert.equal(E("sceneTitle").textContent,shots.opening.title);
assert.equal(E("heroFans").textContent,"650","retake restores fans");
assert.equal(E("retakesLeft").textContent,"01");
let next=choose(0,"opening");
next=choose(1,next);
next=choose(2,next);
next=choose(0,next);
next=choose(1,next);
assert.equal(E("roundBadge").textContent,"FINAL SHOW");
assert.ok(E("choices").children[0].textContent.includes("ラスト") || E("choices").children.length===1);
const last=shots[next];
tick(last.duration+30);
assert.equal(E("sceneTitle").textContent,shots.win.title,"audience-matching path wins");
tick(shots.win.duration+30);
assert.equal(E("resultTitle").textContent,"ENCORE!");
assert.ok(E("resultOverlay").classList.contains("visible"));
const heroFinal=E("finalHero").textContent,rivalFinal=E("finalRival").textContent;
assert.equal(E("reel").children.length,5);
E("replayBtn").press();
let id="opening";
for(let i=0;i<5;i++){
  const node=shots[id];
  tick(Math.ceil(node.duration*node.cutAt)+30);
  const route=[0,1,2,0,1];
  id=node.choices[route[i]].next;
  assert.equal(E("sceneTitle").textContent,shots[id].title,"replay step "+i);
}
tick(shots[id].duration+25);
assert.equal(E("sceneTitle").textContent,shots.win.title);
tick(shots.win.duration+25);
assert.equal(E("finalHero").textContent,heroFinal,"replay hero fans match");
assert.equal(E("finalRival").textContent,rivalFinal,"replay rival fans match");
E("resultRetakeBtn").press();
assert.equal(E("retakesLeft").textContent,"00","retake resource consumed");
assert.equal(E("sceneTitle").textContent,shots.heart.title,"retake from result restores last decision");
playStart();
for(let i=0;i<5;i++){
  const id=i===0?"opening":"freeze";
  tick(shots[id].duration+15);
  assert.equal(E("sceneTitle").textContent,shots.freeze.title);
}
tick(shots.freeze.duration+15);
assert.equal(E("sceneTitle").textContent,shots.lose.title,"no-input ending uses loss");
tick(shots.lose.duration+15);
assert.equal(E("resultTitle").textContent,"NEXT STAGE!");
playStart();
tick(2500);
E("pauseBtn").press();
assert.ok(E("pauseOverlay").classList.contains("visible"));
tick(3800);
E("resumeBtn").press();
tick(220);
assert.equal(E("sceneTitle").textContent,shots.opening.title,"pause maintains playhead");
console.log("KAWAII MOTION PASS: graph, audience system, five-beat flow, endings, retake, replay, timing, pause.");
