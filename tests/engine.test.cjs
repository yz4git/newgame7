const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.window = global;
require("../graph.js");
let clock=0,raf=null;
const els = new Map();
function makeEl(){
  const listeners={},classes=new Set();
  return {
    listeners,children:[],style:{},dataset:{},src:"",value:"",textContent:"",disabled:false,offsetWidth:0,
    classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),
      toggle:(k,on)=>on?classes.add(k):classes.delete(k),contains:k=>classes.has(k)},
    addEventListener:(name,fn)=>{listeners[name]=fn},
    append(...a){this.children.push(...a)},
    replaceChildren(...a){this.children=a},
    setAttribute(){},removeAttribute(name){if(name==="src")this.src=""},
    pause(){},load(){},play(){return Promise.resolve()},
    press(){if(!this.disabled)listeners.click?.()}
  };
}
const document={
  getElementById(id){if(!els.has(id))els.set(id,makeEl());return els.get(id)},
  createElement:makeEl,addEventListener(){},hidden:false
};
const E=id=>document.getElementById(id);
const app=fs.readFileSync(path.join(__dirname,"../app.js"),"utf8");
new Function("window","document","performance","requestAnimationFrame","fetch","localStorage",app)(
  global,document,{now:()=>clock},fn=>{raf=fn},
  ()=>Promise.resolve({ok:true,json:()=>Promise.resolve({})}),
  {getItem:()=>null,setItem(){}}
);
const advance=ms=>{clock+=ms;raf(clock)};
assert.ok(E("titleOverlay").classList.contains("visible"),"title overlay");
E("startButton").press();
advance(1600);
E("choices").children[1].press();
assert.equal(E("shotTitle").textContent,"FIRST CONTACT","early input does not punish");
assert.equal(E("hpDisplay").textContent,100,"early input harmless");
advance(1000); // 2.60s, in the revised intro window
assert.equal(E("windowLabel").textContent,"BRANCH");
E("choices").children[1].press();
assert.equal(E("shotTitle").textContent,"FIRST CONTACT","decision stays buffered");
assert.equal(E("windowLabel").textContent,"LOCKED");
advance(600); // reaches 3.19s stitch point
assert.equal(E("shotTitle").textContent,"BREATHE & SLIP","cuts at marker");
assert.ok(Number(E("scoreDisplay").textContent)>0);
E("retakeButton").press();
assert.equal(E("shotTitle").textContent,"FIRST CONTACT");
assert.equal(Number(E("scoreDisplay").textContent),0);
assert.equal(E("retakeCounter").textContent,"01");
advance(2600);
E("choices").children[1].press();
advance(620);
assert.equal(E("shotTitle").textContent,"BREATHE & SLIP");
advance(2500);
E("choices").children[0].press();
assert.equal(E("shotTitle").textContent,"BREATHE & SLIP","evade choice buffered");
advance(620);
assert.equal(E("shotTitle").textContent,"PERFECT REVERSAL");
advance(1300);
E("choices").children[0].press();
assert.equal(E("shotTitle").textContent,"FINAL TAKE");
advance(3000);
assert.ok(E("resultOverlay").classList.contains("visible"));
assert.equal(E("resultTitle").textContent,"THAT'S A WRAP.");
assert.equal(E("finalCuts").textContent,"03");
E("replayButton").press();
advance(3200);
assert.equal(E("shotTitle").textContent,"BREATHE & SLIP","replay cut 01 marker");
advance(3100);
assert.equal(E("shotTitle").textContent,"PERFECT REVERSAL","replay cut 03 marker");
advance(1300);
assert.equal(E("shotTitle").textContent,"FINAL TAKE");
advance(3000);
assert.ok(E("resultOverlay").classList.contains("visible"),"replay ends");
E("resultRetakeButton").press();
assert.equal(E("shotTitle").textContent,"PERFECT REVERSAL");
assert.equal(E("retakeCounter").textContent,"00");
E("choices").children[0].press();
assert.equal(E("shotTitle").textContent,"MISSED THE BEAT","legacy shot early miss still present");
console.log("MOTION CHAIN engine PASS: buffered branch, no early penalty, fixed cut markers, retake, ending, replay.");
