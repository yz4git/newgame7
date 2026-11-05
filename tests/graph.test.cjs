const assert = require("node:assert/strict");
global.window = global;
require("../graph.js");
const nodes = global.GF_GRAPH;
assert.equal(Object.keys(nodes).length, 13);
assert.equal(nodes.intro.choices.length, 3);
for (const [id,node] of Object.entries(nodes)) {
  assert.ok(node.duration >= 1500, "duration: " + id);
  if (node.terminal) continue;
  assert.equal(node.choices.length,3,"choices: "+id);
  assert.ok(node.window[0] >= 0 && node.window[0] < node.window[1] && node.window[1] <= 1,"window: "+id);
  assert.ok(node.cueAt > 0 && node.cueAt < node.window[0], "visual tell appears ahead of choice: "+id);
  assert.ok(node.cutAt >= node.window[1] && node.cutAt < 1, "cinematic cut after decision window: "+id);
  assert.ok(node.duration*(node.window[1]-node.window[0]) >= 1000, "decision window at least 1 second: "+id);
  for (const choice of node.choices) {
    assert.ok(nodes[choice.next],"broken link: "+id+" > "+choice.next);
    assert.ok(choice.points>0 && choice.flow>0,"reward: "+id);
  }
}
const reached=new Set(),queue=["intro"];
while(queue.length) {
  const id=queue.shift();
  if(reached.has(id))continue;
  reached.add(id);
  for(const edge of nodes[id].choices || [])queue.push(edge.next);
}
for(const id of ["finish","breakaway","counter","throw"])assert.ok(reached.has(id), "unreachable: "+id);
console.log("MOTION CHAIN graph PASS: "+Object.keys(nodes).length+" nodes; "+reached.size+" choice-reachable nodes.");
