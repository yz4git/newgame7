/* KAWAII MOTION: 118-BPM, five-act authored rhythm charts.
 * Every note sits on the same musical sixteenth-note grid as the Web Audio score.
 * Final rainbow note is always the only branch-choice note. */
(function(scope){
"use strict";
const BPM=118,STEP=60000/BPM,GRID=STEP/4,ORIGIN=820-STEP;
const FIRST=820,TRAVEL=720,WINDOW=175;
const LANES=["cute","cool","surprise"];
const PATTERNS=[
 {name:"VERSE",subdivisions:[4,8,12,16]},
 {name:"BUILD",subdivisions:[3,7,11,14,18]},
 {name:"HOOK",subdivisions:[2,5,8,11,14,17]},
 {name:"BREAK",subdivisions:[2,5,8,11,14,18]},
 {name:"FINALE",subdivisions:[2,5,8,11,13,15,18]}
];
function pattern(round){return PATTERNS[Math.min(PATTERNS.length-1,Math.max(0,round|0))];}
function chart(node,mood,rival,round){
 if(!node||node.terminal)return [];
 const p=pattern(round),m=LANES.includes(mood)?mood:"cute";
 const r=LANES.includes(rival)?rival:"cool";
 const third=LANES.find(x=>x!==m&&x!==r)||LANES[(LANES.indexOf(m)+1)%3];
 const recipes=[
  [m,r,third],
  [m,third,r,m],
  [r,m,third,r,m],
  [m,third,r,m,third],
  [r,third,m,r,m,third]
 ];
 const laneList=recipes[Math.min(4,Math.max(0,round|0))];
 const times=p.subdivisions.map(i=>Math.round(ORIGIN+i*GRID));
 const cutAt=Math.floor(node.duration*(node.cutAt??.90));
 if(times[times.length-1]+WINDOW>=cutAt)throw Error("Rhythm chart exceeds cut point: "+node.id);
 return times.map((at,i)=>{
   const prev=i?times[i-1]:-Infinity,next=i+1<times.length?times[i+1]:Infinity;
   // A narrow GOOD zone avoids adjacent rapid notes claiming one another.
   const localWindow=Math.min(WINDOW,Math.floor((Math.min(at-prev,next-at)-20)/2));
   const style=i===times.length-1?null:laneList[i];
   return {id:i,at,subdivision:p.subdivisions[i],style,kind:style?"note":"freestyle",
     accent:p.subdivisions[i]%4===0?"strong":p.subdivisions[i]%2===0?"medium":"offbeat",
     window:localWindow,status:"waiting",grade:null,chosen:null};
 });
}
function grade(delta,note=null){
 const d=Math.abs(delta),w=note?.window??WINDOW;
 const p=Math.min(57,Math.floor(w*.52)),g=Math.min(108,Math.floor(w*.84));
 return d<=p?"perfect":d<=g?"great":d<=w?"good":null;
}
function closest(notes,at){
 let best=null,distance=Infinity;
 for(const note of notes){
   if(note.status!=="waiting")continue;
   const d=Math.abs(note.at-at);
   if(d<=(note.window??WINDOW)&&d<distance){best=note;distance=d;}
 }
 return best;
}
function tap(notes,style,at){
 if(!LANES.includes(style))return {type:"ignored"};
 const note=closest(notes,at);
 if(!note)return {type:"ignored"};
 if(note.style&&note.style!==style){
   note.status="wrong";note.grade="miss";note.chosen=style;
   return {type:"wrong",note,grade:"miss",delta:at-note.at};
 }
 const result=grade(at-note.at,note);
 note.status="hit";note.grade=result;note.chosen=style;
 return {type:"hit",note,grade:result,delta:at-note.at};
}
function expire(notes,at){
 const missed=[];
 for(const note of notes){
   if(note.status==="waiting"&&at>note.at+(note.window??WINDOW)){
     note.status="miss";note.grade="miss";missed.push(note);
   }
 }
 return missed;
}
function progress(note,elapsed){return (elapsed-(note.at-TRAVEL))/TRAVEL;}
function pulse(elapsed){
 const nearest=ORIGIN+Math.round((elapsed-ORIGIN)/STEP)*STEP;
 const delta=Math.abs(elapsed-nearest);
 return Math.max(0,1-delta/155);
}
function serialize(notes){return notes.map(n=>({id:n.id,at:n.at,style:n.style,kind:n.kind,accent:n.accent,window:n.window,status:n.status,grade:n.grade,chosen:n.chosen}));}
scope.KAWAII_RHYTHM=Object.freeze({BPM,STEP,GRID,ORIGIN,FIRST,TRAVEL,WINDOW,LANES,PATTERNS,pattern,chart,grade,tap,expire,progress,pulse,serialize});
})(window);
