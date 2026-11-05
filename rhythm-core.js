/* KAWAII MOTION RHYTHM — deterministic 118 BPM note charts, no dependencies. */
(function(scope){
"use strict";
const BPM=118;
const STEP=60000/BPM;
const FIRST=820;
const TRAVEL=930;
const WINDOW=175;
const LANES=["cute","cool","surprise"];
function chart(node,mood,rival,round){
  if(!node || node.terminal)return [];
  const third=LANES[(LANES.indexOf(mood)+round+1)%3];
  const styles=[mood,rival,third,null];
  return styles.map((style,i)=>({
    id:i,
    at:Math.round(FIRST+STEP*i),
    style,
    kind:style?"note":"freestyle",
    status:"waiting",
    grade:null,
    chosen:null
  }));
}
function grade(delta){
  const d=Math.abs(delta);
  return d<=57?"perfect":d<=108?"great":d<=WINDOW?"good":null;
}
function closest(notes,at){
  let best=null,distance=Infinity;
  for(const note of notes){
    if(note.status!=="waiting")continue;
    const d=Math.abs(note.at-at);
    if(d<=WINDOW && d<distance){best=note;distance=d;}
  }
  return best;
}
function tap(notes,style,at){
  if(!LANES.includes(style))return {type:"ignored"};
  const note=closest(notes,at);
  if(!note)return {type:"ignored"};
  if(note.style && note.style!==style){
    note.status="wrong";note.grade="miss";note.chosen=style;
    return {type:"wrong",note,grade:"miss",delta:at-note.at};
  }
  const result=grade(at-note.at);
  note.status="hit";note.grade=result;note.chosen=style;
  return {type:"hit",note,grade:result,delta:at-note.at};
}
function expire(notes,at){
  const missed=[];
  for(const note of notes){
    if(note.status==="waiting" && at>note.at+WINDOW){
      note.status="miss";note.grade="miss";missed.push(note);
    }
  }
  return missed;
}
function progress(note,elapsed){
  return (elapsed-(note.at-TRAVEL))/TRAVEL;
}
function serialize(notes){return notes.map(n=>({id:n.id,at:n.at,style:n.style,kind:n.kind,status:n.status,grade:n.grade,chosen:n.chosen}));}
scope.KAWAII_RHYTHM=Object.freeze({BPM,STEP,FIRST,TRAVEL,WINDOW,LANES,chart,grade,tap,expire,progress,serialize});
})(window);
