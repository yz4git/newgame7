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
    press(){listeners.click?.()}
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
assert.equal(E("windowLabel").textContent,"CUT NOW");
E("choices").children[1].press();
assert.equal(E("shotTitle").textContent,"BREATHE & SLIP");
assert.ok(Number(E("scoreDisplay").textContent)>0);
E("retakeButton").press();
assert.equal(E("shotTitle").textContent,"FIRST CONTACT");
assert.equal(Number(E("scoreDisplay").textContent),0);
assert.equal(E("retakeCounter").textContent,"01");
advance(1600);
E("choices").children[1].press();
advance(1300);
E("choices").children[0].press();
assert.equal(E("shotTitle").textContent,"PERFECT REVERSAL");
advance(1300);
E("choices").children[0].press();
assert.equal(E("shotTitle").textContent,"FINAL TAKE");
advance(3000);
assert.ok(E("resultOverlay").classList.contains("visible"));
assert.equal(E("resultTitle").textContent,"THAT'S A WRAP.");
assert.equal(E("finalCuts").textContent,"03");
E("replayButton").press();
advance(1601);
assert.equal(E("shotTitle").textContent,"BREATHE & SLIP");
advance(1301);
assert.equal(E("shotTitle").textContent,"PERFECT REVERSAL");
advance(1301);
assert.equal(E("shotTitle").textContent,"FINAL TAKE");
advance(3000);
assert.ok(E("resultOverlay").classList.contains("visible"),"replay ends");
E("resultRetakeButton").press();
assert.equal(E("shotTitle").textContent,"PERFECT REVERSAL");
assert.equal(E("retakeCounter").textContent,"00");
E("choices").children[0].press();
assert.equal(E("shotTitle").textContent,"MISSED THE BEAT","early choice leads to stumble");
console.log("MOTION CHAIN engine PASS: timing, route, retake, ending, replay, missed window.");
