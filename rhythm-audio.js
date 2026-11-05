/* Original synthesized 118 BPM groove for KAWAII MOTION.
   No third-party tracks, sample libraries or audio requests. */
(function(scope){
"use strict";
const beatCore=scope.KAWAII_RHYTHM;
let ctx=null,index=0,enabled=true,muted=false,paused=false;
const notes=[196,246.94,293.66,392,329.63,293.66,246.94,196];
function context(){
  const Audio=scope.AudioContext||scope.webkitAudioContext;
  if(!Audio)return null;
  if(!ctx)ctx=new Audio();
  if(ctx.state==="suspended"&&!paused)ctx.resume().catch(()=>{});
  return ctx;
}
function osc(freq,when,length,gain,type="sine",toFreq){
  const a=context();if(!a)return;
  const o=a.createOscillator(),g=a.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,when);
  if(toFreq)o.frequency.exponentialRampToValueAtTime(toFreq,when+length*.77);
  g.gain.setValueAtTime(.0001,when);
  g.gain.exponentialRampToValueAtTime(gain,when+.005);
  g.gain.exponentialRampToValueAtTime(.0001,when+length);
  o.connect(g).connect(a.destination);o.start(when);o.stop(when+length+.012);
}
function soundBeat(index,when){
  const bar=index%8;
  if(index%2===0){
    // kick: short pitched transient with a rounded low body
    osc(122,when,.17,.11,"sine",45);
    osc(notes[Math.floor(index/2)%notes.length]/2,when,.18,.028,"triangle");
  } else {
    // offbeat hi-hat / side stick, deliberately light on phone speakers
    osc(930,when,.044,.012,"triangle",540);
  }
  if(bar===2||bar===6){osc(183,when,.095,.04,"triangle",92);osc(620,when,.035,.012,"square",390);}
  if(bar===0){osc(587.3,when,.19,.025,"sine");}
}
const origin=beatCore.FIRST-beatCore.STEP;
function start(){
  paused=false;index=0;
  if(enabled)context();
}
function schedule(elapsedMs){
  if(!enabled||paused)return;
  const a=context();if(!a)return;
  const eighth=beatCore.STEP/2;
  // Align accompaniment to note timestamps. Four visible taps land on full beats.
  while(index<18){
    const t=origin+index*eighth;
    if(t>elapsedMs+105)break;
    if(t>=elapsedMs-100)soundBeat(index,a.currentTime+Math.max(.005,(t-elapsedMs)/1000));
    index++;
  }
}
function suspend(){
  paused=true;
  if(ctx&&ctx.state==="running")ctx.suspend().catch(()=>{});
}
function resume(){
  paused=false;
  if(enabled&&ctx&&ctx.state==="suspended")ctx.resume().catch(()=>{});
}
function setEnabled(value){
  enabled=!!value;if(!enabled)suspend();else resume();
}
scope.KAWAII_BEAT={start,schedule,suspend,resume,setEnabled,get enabled(){return enabled;}};
})(window);
