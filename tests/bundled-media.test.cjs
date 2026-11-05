const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(base, "assets/manifest.json"), "utf8"));
const expected = ["opening", "heart", "step", "finale"];
assert.deepEqual(Object.keys(manifest).sort(), [...expected].sort(), "Four pilot videos must be bundled");
for (const id of expected) {
  const relative = manifest[id];
  assert.equal(relative, "assets/clips/" + id + ".mp4", id + " media path");
  const full = path.resolve(base, relative);
  assert.ok(full.startsWith(path.join(base, "assets/clips/")), "clip must stay in assets/clips");
  const bytes = fs.readFileSync(full);
  assert.ok(bytes.length > 50000, "nonempty original clip " + id);
  assert.equal(bytes.subarray(4, 8).toString("ascii"), "ftyp", "MP4 container " + id);
  assert.ok(bytes.includes(Buffer.from("avc1")), "H.264 video " + id);
  console.log("OK " + id + ": " + bytes.length + " bytes");
}
console.log("All 4 original KAWAII MOTION previews are bundled.");
