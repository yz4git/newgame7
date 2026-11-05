/* KAWAII MOTION RHYTHM - deterministic five-round UI smoke tests in Node. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
global.window=global;
require("../dance-graph.js");
require("../rhythm-core.js");
require("../rhythm-audio.js");
const graph=global.KAWAII_GRAPH,core=global.KAWAII_RHYTHM,shots=graph.shots;
assert.equal(core.BPM,118);
assert.equal(graph.maxBeats,5);
assert.equal(graph.moods.length,5);
assert.ok(Object.keys(shots).length>=14);
for(const node of Object.values(shots)){
 if(node.terminal)continue;
 assert.equal(node.choices.length,3);
 assert.deepEqual(node.choices.map(c=>c.style),["cute","cool","surprise"]);
 const pattern=core.chart(node,"cute","cool",1);
 assert.equal(pattern.length,4);
 assert.equal(pattern[0].style,"cute");
 assert.equal(pattern[3].kind,"freestyle");
 assert.ok(pattern[3].at+core.WINDOW<node.duration*node.cutAt);
 for(const action of node.choices)assert.ok(shots[action.next]);
}
const sample=core.chart(shots.opening,"cute","cool",0);
assert.equal(core.tap(sample,"surprise",0).type,"ignored");
assert.equal(core.tap(sample,"cute",sample[0].at+10).grade,"perfect");
assert.equal(core.tap(sample,"cute",sample[1].at).type,"wrong");
assert.equal(core.tap(sample,"surprise",sample[3].at).type,"hit");
assert.equal(core.tap(sample,"surprise",sample[3].at).type,"ignored");
assert.equal(core.expire(sample,99999).length,1);
assert.equal(core.grade(55),"perfect");
assert.equal(core.grade(98),"great");
assert.equal(core.grade(160),"good");
assert.equal(core.grade(180),null);

let clock=0,frame=null;
const elements=new Map();
function mock(){
 const callbacks={},classes=new Set();
 return {
  callbacks,children:[],style:{},dataset:{},textContent:"",src:"",files:[],value:"",disabled:false,offsetWidth:0,
  classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},
    toggle(x,on){if(on)classes.add(x);else classes.delete(x)},contains(x){return classes.has(x)}},
  addEventListener(name,fn){callbacks[name]=fn},
  append(...values){this.children.push(...values)},replaceChildren(...values){this.children=values},
  setAttribute(){},removeAttribute(k){if(k==="src")this.src=""},
  pause(){},load(){},play(){return Promise.resolve()},
  press(){if(!this.disabled)this.callbacks.click?.()},fire(kind){this.callbacks[kind]?.({preventDefault(){}})}
 };
}
const document={
 getElementById(id){if(!elements.has(id))elements.set(id,mock());return elements.get(id)},
 createElement:mock,hidden:false,addEventListener(){}
};
const el=id=>document.getElementById(id);
const js=fs.readFileSync(path.join(__dirname,"../dance.js"),"utf8");
new Function("window","document","performance","requestAnimationFrame","fetch","localStorage",js)(
 global,document,{now:()=>clock},fn=>frame=fn,
 ()=>Promise.resolve({ok:true,json:()=>Promise.resolve({})}),
 {getItem(){return null},setItem(){}}
);
const advance=ms=>{assert.ok(ms>=0,"Cannot go back in time");clock+=ms;frame(clock)};
const count=id=>Number(el(id).textContent.replace(/,/g,""));
function start(){
 el("startBtn").press();
 assert.equal(el("sceneTitle").textContent,shots.opening.title);
 assert.equal(el("noteContainer").children.length,4,"four notes per shot");
}
function perform(nodeId,round,finishStyle){
 const node=shots[nodeId];
 assert.equal(el("sceneTitle").textContent,node.title,"expected "+nodeId);
 const chart=core.chart(node,graph.moods[round].style,graph.rivalStyles[round],round);
 const entered=clock;
 for(const n of chart){
   advance(n.at-(clock-entered));
   const lane=n.style||finishStyle;
   const pad=node.choices.findIndex(c=>c.style===lane);
   assert.ok(pad>=0);
   el("choices").children[pad].press();
 }
 assert.equal(el("noteContainer").children.length,4);
 assert.ok(el("cueLabel").textContent.includes("LOCKED"),"last note selects the branch");
 assert.equal(el("roundBadge").textContent,"BEAT "+String(round+1).padStart(2,"0")+" / 05");
 const endAt=node.duration*node.cutAt+35;
 advance(endAt-(clock-entered));
 const choice=node.choices.find(c=>c.style===finishStyle);
 assert.equal(el("sceneTitle").textContent,shots[choice.next].title,"branched by final freestyle tap");
 return choice.next;
}
assert.ok(el("titleOverlay").classList.contains("visible"));
start();
// Missing the first note breaks the combo but later notes can still be played.
advance(1090);
assert.ok(el("noteFeedback").textContent.includes("MISS"));
advance(core.chart(shots.opening,"cute","cool",0)[1].at-1090);
el("choices").children[1].press();
assert.equal(el("chainText").textContent,"COMBO ×1");
el("startBtn").press(); // starts a clean five-round performance
assert.equal(count("heroFans"),650);
assert.equal(el("chainText").textContent,"COMBO ×0");
const route=["cute","cool","surprise","cute","cool"];
let id="opening";
for(let round=0;round<5;round++){
 id=perform(id,round,route[round]);
 if(round===0){
   assert.ok(count("heroFans")>650);
   el("retakeBtn").press();
   assert.equal(el("sceneTitle").textContent,shots.opening.title);
   assert.equal(count("heroFans"),650,"retake reverses each tap's fan income");
   assert.equal(el("chainText").textContent,"COMBO ×0");
   assert.equal(el("retakesLeft").textContent,"01");
   id=perform("opening",0,route[round]);
 }
}
assert.equal(el("roundBadge").textContent,"FINAL SHOW");
advance(shots[id].duration+15);
assert.equal(el("sceneTitle").textContent,shots.win.title,"perfect sequence wins");
advance(shots.win.duration+15);
assert.equal(el("resultTitle").textContent,"ENCORE!");
assert.equal(el("reel").children.length,5);
assert.ok(el("finalAccuracy").textContent.includes("PERFECT 20"),"20 precise notes");
const finalHero=el("finalHero").textContent,finalRival=el("finalRival").textContent;
el("replayBtn").press();
id="opening";
for(let round=0;round<5;round++){
 const node=shots[id],entered=clock;
 advance(node.duration*node.cutAt+26);
 id=node.choices.find(c=>c.style===route[round]).next;
 assert.equal(el("sceneTitle").textContent,shots[id].title,"replay route step "+round);
}
advance(shots[id].duration+15);
assert.equal(el("sceneTitle").textContent,shots.win.title);
advance(shots.win.duration+15);
assert.equal(el("finalHero").textContent,finalHero,"replay fan total");
assert.equal(el("finalRival").textContent,finalRival,"replay opponent total");
el("resultRetakeBtn").press();
assert.equal(el("retakesLeft").textContent,"00");
assert.equal(el("sceneTitle").textContent,shots.heart.title);
start();
for(let i=0;i<5;i++){
 const currentId=i?"freeze":"opening";
 advance(shots[currentId].duration+20);
 assert.equal(el("sceneTitle").textContent,shots.freeze.title,"recoverable miss clip");
}
advance(shots.freeze.duration+25);
assert.equal(el("sceneTitle").textContent,shots.lose.title);
advance(shots.lose.duration+20);
assert.equal(el("resultTitle").textContent,"NEXT STAGE!");
start();
advance(1400);
el("pauseBtn").press();
assert.ok(el("pauseOverlay").classList.contains("visible"));
advance(4000);
el("resumeBtn").press();
advance(150);
assert.equal(el("sceneTitle").textContent,shots.opening.title,"pause freezes the scene clock");
console.log("KAWAII MOTION RHYTHM PASS: charts, grades, freestyle transitions, 20 hits, fan score, retake, replay, endings, pause.");
