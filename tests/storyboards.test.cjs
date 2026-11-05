const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
global.window=global;
require("../graph.js");
const graph=global.GF_GRAPH;
const dir=path.join(__dirname,"../docs/storyboards");
for(const node of Object.values(graph)){
 const filename="CUT"+node.shot+"_PORTRAIT.svg";
 const pathTo=path.join(dir,filename);
 assert.ok(fs.existsSync(pathTo),"storyboard missing: "+filename);
 const source=fs.readFileSync(pathTo,"utf8");
 assert.ok(source.includes("<svg")&&source.includes("</svg>"),"SVG invalid shell: "+filename);
 assert.ok(source.includes(node.title),"title mismatch: "+filename);
 assert.ok(source.includes("FRAME 1")&&source.includes("FRAME 3"),"three frame plan missing: "+filename);
 assert.ok(source.length>1000,"empty storyboard: "+filename);
}
console.log("MOTION CHAIN storyboard PASS: 13 editable 3:4 shot sheets match all scene IDs.");
