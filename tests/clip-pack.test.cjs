const assert=require("node:assert/strict");
global.window=global;
require("../clip-pack.js");
const api=global.KAWAII_CLIP_PACK;
const enc=new TextEncoder();
function makeZip(files){
  const locals=[],central=[];
  let pos=0;
  for(const [name,text] of files){
    const filename=Buffer.from(enc.encode(name)),data=Buffer.from(enc.encode(text));
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);
    local.writeUInt32LE(data.length,18);
    local.writeUInt32LE(data.length,22);
    local.writeUInt16LE(filename.length,26);
    locals.push(local,filename,data);
    const cen=Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50,0);
    cen.writeUInt16LE(20,4);cen.writeUInt16LE(20,6);
    cen.writeUInt32LE(data.length,20);
    cen.writeUInt32LE(data.length,24);
    cen.writeUInt16LE(filename.length,28);
    cen.writeUInt32LE(pos,42);
    central.push(cen,filename);
    pos+=30+filename.length+data.length;
  }
  const centralSize=central.reduce((n,b)=>n+b.length,0);
  const eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);
  eocd.writeUInt16LE(files.length,8);
  eocd.writeUInt16LE(files.length,10);
  eocd.writeUInt32LE(centralSize,12);
  eocd.writeUInt32LE(pos,16);
  return Buffer.concat([...locals,...central,eocd]);
}
const zip=makeZip([
 ["opening.mp4","open-video"],
 ["heart.mp4","heart-video"],
 ["heart__opening-heart.mp4","heart-entry-variant"],
 ["assets/clips/step.mp4","step-video"],
 ["notes.txt","ignored"]
]);
const bytes=Uint8Array.from(zip);
const entries=api.parseCentral(bytes.buffer);
assert.equal(entries.length,4);
assert.deepEqual(entries.map(x=>x.node),["opening","heart","heart","step"]);
assert.equal(entries[2].entry,"opening:heart");
(async()=>{
 const decoded=await api.readPack(bytes.buffer);
 assert.equal(decoded.length,4);
 assert.equal(decoded[0].type,"video/mp4");
 assert.equal(await decoded[1].blob.text(),"heart-video");
 assert.equal(decoded[3].name,"step.mp4");
 assert.throws(()=>api.parseCentral(new Uint8Array(64).buffer));
 console.log("KAWAII MOTION pack PASS: stored ZIP parsing, entry variants, MIME, contents and invalid ZIP.");
})().catch(err=>{console.error(err);process.exit(1)});
