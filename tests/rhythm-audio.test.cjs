/* Offline tests for the original five-phrase Web Audio arrangement. */
const assert=require("node:assert/strict");
global.window=global;
require("../rhythm-core.js");
let started=0;
const fakeParam={setValueAtTime(){},exponentialRampToValueAtTime(){}};
class FakeAudioContext{
 constructor(){this.state="running";this.currentTime=1;this.destination={};}
 createOscillator(){return {frequency:fakeParam,type:"sine",connect(target){return target;},start(){started++;},stop(){}};}
 createGain(){return {gain:fakeParam,connect(target){return target;}};}
 suspend(){this.state="suspended";return Promise.resolve();}
 resume(){this.state="running";return Promise.resolve();}
}
global.AudioContext=FakeAudioContext;
require("../rhythm-audio.js");
const music=global.KAWAII_BEAT,core=global.KAWAII_RHYTHM;
music.start(0);
assert.equal(music.round,0);
music.schedule(core.ORIGIN-20);
const verse=started;
assert.ok(verse>=3,"verse begins with a kick, bass and supporting tone");
music.schedule(core.ORIGIN-20);
assert.equal(started,verse,"lookahead does not double-schedule");
music.start(4);
music.schedule(core.ORIGIN-20);
const finale=started-verse;
assert.ok(finale>verse,"finale adds percussion layers beyond verse");
music.effect(690,.08);
assert.ok(started>verse+finale,"hit feedback shares the music oscillator");
const count=started;
music.suspend();music.schedule(1500);music.effect(800);
assert.equal(started,count,"pause silences the song and hit feedback");
music.resume();music.effect(810);
assert.ok(started>count,"resume restores feedback");
music.setEnabled(false);
const muted=started;music.effect(999);music.schedule(1900);
assert.equal(started,muted,"mute silences all voices");
music.setEnabled(true);music.start(2);music.schedule(core.ORIGIN-20);
assert.ok(started>muted,"music returns after mute");
console.log("KAWAII MOTION music PASS: five-act arrangement, no duplicate scheduling, pause, resume, mute and feedback.");
