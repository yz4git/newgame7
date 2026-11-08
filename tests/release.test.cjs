'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'deep-weave-release-'));
try{
  const toolsDir=path.join(tmp,'scripts');
  fs.mkdirSync(toolsDir,{recursive:true});
  fs.copyFileSync(path.resolve(__dirname,'../scripts/stamp-release.cjs'),path.join(toolsDir,'stamp-release.cjs'));
  fs.writeFileSync(path.join(tmp,'index.html'),'<script>const bootVersion="__DW_BUILD__";</script>\n');
  fs.writeFileSync(path.join(tmp,'version.json'),JSON.stringify({version:'__DW_BUILD__'}));
  const sha='a'.repeat(40);
  const processResult=spawnSync(process.execPath,[path.join(toolsDir,'stamp-release.cjs'),sha],{
    cwd:tmp,encoding:'utf8'
  });
  assert.equal(processResult.status,0,processResult.stderr);
  const entry=fs.readFileSync(path.join(tmp,'index.html'),'utf8');
  const version=JSON.parse(fs.readFileSync(path.join(tmp,'version.json'),'utf8'));
  assert.ok(entry.includes(sha));
  assert.ok(!entry.includes('__DW_BUILD__'));
  assert.equal(version.version,sha);
  const invalid=spawnSync(process.execPath,[path.join(toolsDir,'stamp-release.cjs'),'invalid'],{
    cwd:tmp,encoding:'utf8'
  });
  assert.notEqual(invalid.status,0,'invalid SHA should be rejected');
  console.log('PASS: release stamping, SHA validation and consistent startup version');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
