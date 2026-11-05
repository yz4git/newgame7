/* KAWAII MOTION – ZIP Clip Pack reader, no external libraries.
   Reads the ZIP central directory. Stored entries work on every target browser.
   Deflated entries require native DecompressionStream('deflate-raw'). */
(function(scope){
"use strict";
const MAX_PACK=150*1024*1024,MAX_ENTRIES=64,MAX_FILE=40*1024*1024;
function parseCentral(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  if(bytes.length>MAX_PACK)throw Error("ZIPが大きすぎます（150MB以下）");
  const start=Math.max(0,bytes.length-65557);
  let eocd=-1;
  for(let p=bytes.length-22;p>=start;p--){
    if(view.getUint32(p,true)===0x06054b50){eocd=p;break;}
  }
  if(eocd<0)throw Error("ZIPの終端情報が見つかりません");
  const count=view.getUint16(eocd+10,true);
  let offset=view.getUint32(eocd+16,true);
  if(count>MAX_ENTRIES)throw Error("ZIP内のファイルが多すぎます");
  const decoder=new TextDecoder("utf-8"),entries=[];
  let total=0;
  for(let i=0;i<count;i++){
    if(offset+46>bytes.length||view.getUint32(offset,true)!==0x02014b50)throw Error("ZIPの目次が壊れています");
    const method=view.getUint16(offset+10,true),
      packed=view.getUint32(offset+20,true),
      plain=view.getUint32(offset+24,true),
      nameLen=view.getUint16(offset+28,true),
      extraLen=view.getUint16(offset+30,true),
      commentLen=view.getUint16(offset+32,true),
      local=view.getUint32(offset+42,true);
    if(plain>MAX_FILE)throw Error("単独クリップは40MB以下にしてください");
    total+=plain;if(total>MAX_PACK)throw Error("ZIP展開後の合計が大きすぎます");
    if(offset+46+nameLen+extraLen+commentLen>bytes.length)throw Error("ファイル名が不正です");
    const name=decoder.decode(bytes.slice(offset+46,offset+46+nameLen));
    offset+=46+nameLen+extraLen+commentLen;
    if(!/\.(mp4|webm|gif|webp)$/i.test(name)||name.endsWith("/"))continue;
    const basename=name.split("/").pop();
    // Clip names are simple, ASCII node IDs. __ encodes an optional incoming transition.
    const parts=/^([a-z0-9-]+)(?:__([a-z0-9-]+)-([a-z0-9-]+))?\.(mp4|webm|gif|webp)$/i.exec(basename);
    if(!parts)continue;
    if(method!==0&&method!==8)throw Error("対応していないZIP圧縮方式です: "+basename);
    if(local+30>bytes.length||view.getUint32(local,true)!==0x04034b50)throw Error("ZIP内のファイルヘッダーが壊れています");
    const dataStart=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if(dataStart+packed>bytes.length)throw Error("ZIPのクリップデータが途中で切れています");
    entries.push({node:parts[1],entry:parts[2]?parts[2]+":"+parts[3]:null,
      filename:basename,method,plain,packed,compressed:bytes.slice(dataStart,dataStart+packed),
      type:parts[4].toLowerCase()==="gif"?"image/gif":parts[4].toLowerCase()==="webp"?"image/webp":parts[4].toLowerCase()==="webm"?"video/webm":"video/mp4"});
  }
  return entries;
}
async function readPack(buffer){
  const items=parseCentral(buffer),out=[];
  for(const item of items){
    let bytes=item.compressed;
    if(item.method===8){
      if(typeof DecompressionStream==="undefined")throw Error("このブラウザーは圧縮ZIPに対応していません。無圧縮ZIPを使用してください");
      let stream;
      try{stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));}
      catch(_){throw Error("圧縮ZIPの展開に失敗。無圧縮ZIPを使用してください");}
      bytes=new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if(bytes.length!==item.plain)throw Error("ZIPのファイル長が不正です: "+item.filename);
    out.push({node:item.node,entry:item.entry,name:item.filename,type:item.type,blob:new Blob([bytes],{type:item.type})});
  }
  return out;
}
scope.KAWAII_CLIP_PACK={parseCentral,readPack};
})(window);
