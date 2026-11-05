/* Original five-act 118 BPM pop groove, generated entirely by Web Audio.
 * Kick, backbeat, offbeat hats, synth-bass, chord stabs, and melody enter by round.
 * The same 16th-note grid drives sound, note charts, and stage pulse. */
(function(scope){
"use strict";
const core=scope.KAWAII_RHYTHM;
let ctx=null,index=0,round=0,enabled=true,paused=false;
const melodies=[
 [392,440,523.25,440,392,349.23,392],
 [440,523.25,587.33,659.25,587.33,523.25,440],
 [523.25,587.33,659.25,783.99,659.25,587.33,523.25],
 [392,349.23,440,523.25,587.33,523.25,659.25],
 [587.33,659.25,783.99,880,783.99,987.77,1046.5]
];
const chords=[
 [261.63,329.63,392],
 [293.66,369.99,440],
 [329.63,392,493.88],
 [293.66,349.23,440],
 [349.23,440,523.25]
];
const bass=[130.81,146.83,164.81,146.83,174.61];
function context(){
 const Audio=scope.AudioContext||scope.webkitAudioContext;
 if(!Audio)return null;
 if(!ctx)ctx=new Audio();
 if(ctx.state==="suspended"&&!paused)ctx.resume().catch(()=>{});
 return ctx;
}
function voice(freq,when,length,amount,type="sine",to=null){
 const a=ctx;if(!a||!enabled)return;
 const osc=a.createOscillator(),gain=a.createGain();
 osc.type=type;osc.frequency.setValueAtTime(freq,when);
 if(to)osc.frequency.exponentialRampToValueAtTime(to,when+length*.78);
 gain.gain.setValueAtTime(.0001,when);
 gain.gain.exponentialRampToValueAtTime(Math.max(.0001,amount),when+.006);
 gain.gain.exponentialRampToValueAtTime(.0001,when+length);
 osc.connect(gain);gain.connect(a.destination);
 osc.start(when);osc.stop(when+length+.012);
}
function hitSound(freq=600,length=.08,type="triangle"){
 if(!enabled||paused)return;
 const a=context();if(!a)return;
 voice(freq,a.currentTime+.004,length,.047,type,Math.max(160,freq*.82));
}
function beat(sub,when){
 const level=round,beatNo=Math.floor(sub/4),within=sub%4;
 if(within===0){
   voice(132,when,.145,.088,"sine",47);
   voice(bass[level],when,.22,level>=2?.038:.023,"triangle",bass[level]*.92);
   if(beatNo%2===0)voice(chords[level][0],when,.12,.018,"sine");
 }
 if(sub%2===0 && level>=1){
   voice(1200,when,.029,.012+level*.002,"triangle",650);
 }
 if(within===2 && (beatNo%2===1||level>=3)){
   voice(185,when,.09,.041,"triangle",86);
   voice(860,when,.038,.013,"square",480);
 }
 if(within===3 && level>=2 && (beatNo%2===0||level===4)){
   voice(1520,when,.021,.009,"triangle",820);
 }
 if((sub===4||sub===12||sub===20)&&level>=1){
   const pitch=melodies[level][(sub/4+level)%melodies[level].length];
   voice(pitch,when,.20,level>=3?.038:.026,"sine");
   if(level>=2)voice(pitch*1.005,when,.18,.011,"triangle");
 }
 if((sub===8||sub===16)&&level>=2){
   const pitch=chords[level];
   for(const n of pitch)voice(n,when,.27,level>=4?.020:.012,"triangle");
 }
 if(level>=4&&(sub===14||sub===18)){
   voice(melodies[4][sub===14?4:6],when,.15,.034,"sine");
 }
}
function start(newRound=0){
 round=Math.max(0,Math.min(4,newRound|0));
 index=0;paused=false;
 if(enabled)context();
}
function schedule(elapsedMs){
 if(!enabled||paused)return;
 const a=context();if(!a)return;
 const lookAhead=115;
 while(index<27){
   const t=core.ORIGIN+index*core.GRID;
   if(t>elapsedMs+lookAhead)break;
   if(t>=elapsedMs-90)beat(index,a.currentTime+Math.max(.006,(t-elapsedMs)/1000));
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
 enabled=!!value;
 if(!enabled)suspend();else resume();
}
scope.KAWAII_BEAT=Object.freeze({
 start,schedule,suspend,resume,setEnabled,effect:hitSound,
 get enabled(){return enabled},get round(){return round}
});
})(window);
