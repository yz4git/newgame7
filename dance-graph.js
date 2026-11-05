/* KAWAII MOTION — original data-driven interactive dance-film */
(function (scope) {
  "use strict";
  const choice=(id,label,style,next,base,description)=>({
    id,label,style,next,base,description,symbol:{cute:"♡",cool:"✦",surprise:"★"}[style]
  });
  const shot=(id,title,scene,motion,subtitle,duration,choices,window=[.51,.85])=>({
    id,title,scene,motion,subtitle,duration,choices,
    cueAt:.22,window,cutAt:.90
  });
  const shots={
    opening:shot("opening","THE STAGE IS YOURS","sakura","opening","観客が今ほしいパフォーマンスを見せよう！",3500,[
      choice("heart","ハートポーズ","cute","heart",200,"王道のかわいさ"),
      choice("groove","クールステップ","cool","groove",215,"鋭くリズミカル"),
      choice("flash","キラキラ登場","surprise","sparkle",230,"一気に注目を集める")
    ]),
    heart:shot("heart","HEART ATTACK","sakura","heart","ハートの余韻を次の演出へつなげよう",3200,[
      choice("wink","ウインク","cute","wink",215,"笑顔でファンを魅了"),
      choice("step","キレのあるステップ","cool","step",235,"意外なギャップ"),
      choice("ribbon","リボンチェンジ","surprise","ribbon",245,"衣装と光が変化")
    ]),
    groove:shot("groove","RHYTHM & STYLE","neon","groove","クールなリズムに観客が反応",3300,[
      choice("cheer","キュートコール","cute","cheer",220,"観客と一体に"),
      choice("orbit","高速ターン","cool","orbit",235,"見せ場の回転"),
      choice("disco","ライトチェンジ","surprise","disco",245,"照明で印象を変える")
    ]),
    sparkle:shot("sparkle","SPARKLE SHIFT","holo","sparkle","ライトが変わる！ 次はどんな驚きを？",3400,[
      choice("wink","笑顔で決める","cute","wink",225,"照明からのウインク"),
      choice("orbit","回転ダンス","cool","orbit",225,"勢いを引き継ぐ"),
      choice("ribbon","リボンの舞","surprise","ribbon",240,"花と光の演出")
    ]),
    wink:shot("wink","CAMERA LOVE","sakura","wink","カメラが寄る。観客のハートが揺れる",3100,[
      choice("heart","両手ハート","cute","heart",230,"かわいさの追撃"),
      choice("groove","予想外のステップ","cool","groove",245,"メリハリを作る"),
      choice("disco","光のウインク","surprise","disco",245,"大胆なシーン転換")
    ]),
    step:shot("step","FOOTWORK FEVER","neon","step","足元のリズムが揃った",3200,[
      choice("cheer","笑顔のコール","cute","cheer",215,"みんなと呼吸を合わせる"),
      choice("orbit","華麗なターン","cool","orbit",235,"ダンスで圧倒"),
      choice("sparkle","瞬間ポーズ","surprise","sparkle",250,"ライトを操る")
    ]),
    orbit:shot("orbit","SPIN THE BEAT","neon","orbit","高速ターンの終わりが次の入口になる",3200,[
      choice("wink","キュートな着地","cute","wink",235,"ギャップが刺さる"),
      choice("groove","ステップでつなぐ","cool","groove",225,"滑らかな連続技"),
      choice("ribbon","リボンが舞う","surprise","ribbon",255,"映像的な接続")
    ]),
    ribbon:shot("ribbon","RIBBON BLOOM","holo","ribbon","リボンと照明が舞台を彩る",3300,[
      choice("cheer","ハートで応える","cute","cheer",235,"華やかな一体感"),
      choice("step","一転してクール","cool","step",235,"ギャップを魅せる"),
      choice("disco","サプライズ連鎖","surprise","disco",260,"大きな演出")
    ]),
    disco:shot("disco","LIGHTS ON!","holo","disco","色とりどりのスポットライトが動く",3350,[
      choice("heart","スイートハート","cute","heart",220,"優しい余韻"),
      choice("orbit","ビートスピン","cool","orbit",230,"ダンスで応える"),
      choice("ribbon","衣装チェンジ","surprise","ribbon",245,"観客を驚かせる")
    ]),
    cheer:shot("cheer","CROWD CONNECTION","sunset","cheer","ファンが一緒に手を振っている！",3200,[
      choice("heart","ハートシャワー","cute","heart",235,"ファンとの距離を縮める"),
      choice("groove","キレよく決める","cool","groove",240,"空気を切り替える"),
      choice("sparkle","大サプライズ","surprise","sparkle",255,"大きな歓声を狙う")
    ]),
    freeze:shot("freeze","MISS THE BEAT","sunset","opening","次のポーズに迷った。ここから立て直そう！",3050,[
      choice("smile","笑顔で再開","cute","heart",190,"気持ちを切り替える"),
      choice("step","リズムを戻す","cool","step",195,"落ち着いて再挑戦"),
      choice("flash","一発逆転演出","surprise","sparkle",205,"照明で流れを変える")
    ]),
    finale:shot("finale","THE LAST APPEAL","sakura","finale","フィナーレ直前、最後のひと押し！",3600,[
      choice("heart","みんなにハート","cute","heart",280,"愛情いっぱいの決めポーズ"),
      choice("orbit","最高のターン","cool","orbit",290,"華麗な最終演舞"),
      choice("disco","光のフィナーレ","surprise","disco",300,"劇的なステージ演出")
    ]),
    win:{id:"win",title:"ENCORE!","scene":"sakura",motion:"win",subtitle:"会場がアンコールでいっぱい！",duration:3500,terminal:"victory"},
    tie:{id:"tie",title:"DOUBLE SPOTLIGHT",scene:"sunset",motion:"tie",subtitle:"どちらにも大歓声！ 互角のファンバトル",duration:3250,terminal:"draw"},
    lose:{id:"lose",title:"NEXT STAGE!",scene:"neon",motion:"lose",subtitle:"レイナに拍手。次こそ観客を振り向かせよう",duration:3100,terminal:"defeat"}
  };
  const moods=[
    {style:"cute",icon:"♡",label:"かわいい系",tell:"観客がハートのペンライトを振っている"},
    {style:"cool",icon:"✦",label:"クール系",tell:"キレのあるダンスを求める歓声が上がる"},
    {style:"surprise",icon:"★",label:"サプライズ系",tell:"客席が驚きの演出を待っている"},
    {style:"cute",icon:"♡",label:"かわいい系",tell:"かわいいコールが大きくなった"},
    {style:"cool",icon:"✦",label:"クール系",tell:"ライバルの高速ステップに観客が沸く"}
  ];
  const rivalStyles=["cool","surprise","cute","surprise","cool"];
  const styles={cute:{label:"CUTE",icon:"♡"},cool:{label:"COOL",icon:"✦"},surprise:{label:"SURPRISE",icon:"★"}};
  for(const [id,node] of Object.entries(shots)){
    if(node.id!==id)throw Error("Invalid node ID "+id);
    if(!node.terminal){
      if(node.choices.length!==3)throw Error("Invalid choices for "+id);
      if(!(node.cueAt<node.window[0]&&node.window[0]<node.window[1]&&node.window[1]<=node.cutAt&&node.cutAt<1))throw Error("Invalid timing for "+id);
      for(const c of node.choices){
        if(!shots[c.next]||!styles[c.style])throw Error("Broken transition "+id+":"+c.id);
      }
    }
  }
  scope.KAWAII_GRAPH=Object.freeze({
    shots:Object.freeze(shots),moods:Object.freeze(moods),
    rivalStyles:Object.freeze(rivalStyles),styles:Object.freeze(styles),maxBeats:5
  });
})(window);
