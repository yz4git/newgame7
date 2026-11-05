const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.window = global;
require("../graph.js");
const graph = global.GF_GRAPH;
let clock = 0, frame = null;
const els = new Map();
function mockElement(){
  const listeners={},classes=new Set();
  return {
    listeners,children:[],style:{setProperty(){}},dataset:{},src:"",value:"",textContent:"",disabled:false,offsetWidth:0,
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,yes)=>yes?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},
    addEventListener:(type,fn)=>{listeners[type]=fn},append(...a){this.children.push(...a)},
    replaceChildren(...a){this.children=a},setAttribute(){},removeAttribute(k){if(k==="src")this.src=""},
    pause(){},load(){},play(){return Promise.resolve()},press(){if(!this.disabled)listeners.click?.()}
  };
}
const document={getElementById(id){if(!els.has(id))els.set(id,mockElement());return els.get(id)},createElement:mockElement,addEventListener(){},hidden:false};
const el=id=>document.getElementById(id);
const app=fs.readFileSync(path.join(__dirname,"../app.js"),"utf8");
new Function("window","document","performance","requestAnimationFrame","fetch","localStorage",app)(
 global,document,{now:()=>clock},fn=>{frame=fn},
 ()=>Promise.resolve({ok:true,json:()=>Promise.resolve({})}),
 {getItem:()=>null,setItem(){}}
);
const advance=milliseconds=>{clock+=milliseconds;frame(clock)};
function start(){el("startButton").press();assert.equal(el("shotTitle").textContent,graph.intro.title)}
function branch(id,choiceIndex){
  const node=graph[id];
  assert.equal(el("shotTitle").textContent,node.title,"at node "+id);
  const chooseAt=Math.floor(node.duration*.73);
  advance(chooseAt);
  const oldTitle=el("shotTitle").textContent;
  el("choices").children[choiceIndex].press();
  assert.equal(el("shotTitle").textContent,oldTitle,"stays until cinematic cut at "+id);
  assert.equal(el("windowLabel").textContent,"LOCKED","choice buffered in "+id);
  advance(Math.ceil(node.duration*(node.cutAt-.73))+15);
  assert.equal(el("shotTitle").textContent,graph[node.choices[choiceIndex].next].title,"destination of "+id);
}
assert.ok(el("titleOverlay").classList.contains("visible"));
start();
advance(900);
el("choices").children[1].press();
assert.equal(el("shotTitle").textContent,graph.intro.title,"early tap ignored");
assert.equal(el("hpDisplay").textContent,100,"early tap harmless");
advance(Math.floor(graph.intro.duration*.73)-900);
el("choices").children[1].press();
assert.equal(el("windowLabel").textContent,"LOCKED");
advance(Math.ceil(graph.intro.duration*(graph.intro.cutAt-.73))+15);
assert.equal(el("shotTitle").textContent,graph.evade.title);
el("retakeButton").press();
assert.equal(el("shotTitle").textContent,graph.intro.title,"retake returns to original node");
assert.equal(Number(el("scoreDisplay").textContent),0);
assert.equal(el("retakeCounter").textContent,"01");
branch("intro",1);branch("evade",0);branch("counter",0);
advance(graph.finish.duration+25);
assert.equal(el("resultTitle").textContent,"THAT'S A WRAP.");
assert.equal(el("finalCuts").textContent,"03");
el("replayButton").press();
advance(Math.ceil(graph.intro.duration*graph.intro.cutAt)+20);
assert.equal(el("shotTitle").textContent,graph.evade.title,"replay intro stitch marker");
advance(Math.ceil(graph.evade.duration*graph.evade.cutAt)+20);
assert.equal(el("shotTitle").textContent,graph.counter.title,"replay evade stitch marker");
advance(Math.ceil(graph.counter.duration*graph.counter.cutAt)+20);
assert.equal(el("shotTitle").textContent,graph.finish.title,"replay counter stitch marker");
advance(graph.finish.duration+20);
assert.ok(el("resultOverlay").classList.contains("visible"),"replay completes");
el("resultRetakeButton").press();
assert.equal(el("shotTitle").textContent,graph.counter.title,"retake from result");
assert.equal(el("retakeCounter").textContent,"00");
advance(100);
el("choices").children[0].press();
assert.equal(el("shotTitle").textContent,graph.counter.title,"early input at later shots no longer causes miss");

start();
branch("intro",0);branch("rush",0);branch("elbow",1);branch("throw",1);
advance(graph.breakaway.duration+20);
assert.equal(el("resultTitle").textContent,"SAFE CUT.","alternate route ending");

start();
branch("intro",2);branch("feint",1);branch("sweep",0);
advance(graph.finish.duration+20);
assert.equal(el("resultTitle").textContent,"THAT'S A WRAP.","feint route victory");

start();
advance(graph.intro.duration+20);
assert.equal(el("shotTitle").textContent,graph.stumble.title,"timeout enters stumble");
advance(graph.stumble.duration+20);
assert.equal(el("shotTitle").textContent,graph.knockout.title,"stumble timeout enters knockout");
advance(graph.knockout.duration+20);
assert.equal(el("resultTitle").textContent,"CUT TO BLACK.","defeat ending");

start();
advance(2400);
el("pauseButton").press();
assert.ok(el("pauseOverlay").classList.contains("visible"));
advance(4500);
el("resumeButton").press();
assert.equal(el("shotTitle").textContent,graph.intro.title);
advance(150);
assert.equal(el("shotTitle").textContent,graph.intro.title,"time remains paused");
console.log("MOTION CHAIN engine PASS: full MOTION BRANCH rollout, 3 endings, replay, retake, early input and pause.");
