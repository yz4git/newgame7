/* Data-driven, branching action-film choreography. Every edge points to a node. */
(function (scope) {
  "use strict";
  const graph = {
    intro: {
      title:"FIRST CONTACT", shot:"01", location:"桜の屋上", scene:"sakura", motion:"advance",
      subtitle:"敵が間合いを詰めてくる。", tell:"相手は右拳を大きく引いた", duration:3800, window:[.53,.84], cueAt:.21, cutAt:.84,
      choices:[
        {id:"attack",label:"踏み込む",sub:"先手 / 高得点",symbol:"↗",next:"rush",kind:"risky",points:280,flow:25},
        {id:"evade",label:"かわす",sub:"安全な派生",symbol:"◇",next:"evade",kind:"safe",points:175,flow:18},
        {id:"bait",label:"誘い込む",sub:"反撃の準備",symbol:"◉",next:"feint",kind:"normal",points:215,flow:23}
      ]
    },
    rush:{
      title:"BREAK THE LINE",shot:"02",location:"桜の屋上",scene:"sakura",motion:"rush",
      subtitle:"飛び込んだ拳が相手の頬をかすめる。",tell:"相手はガードを高く上げた",duration:3200,window:[.56,.91],cueAt:.375,cutAt:.91,
      choices:[
        {id:"elbow",label:"肘で崩す",sub:"近距離・連撃",symbol:"✦",next:"elbow",kind:"risky",points:310,flow:26},
        {id:"sweep",label:"下段を払う",sub:"ガードを崩す",symbol:"↘",next:"sweep",kind:"normal",points:240,flow:20},
        {id:"withdraw",label:"引いて回避",sub:"態勢を戻す",symbol:"↶",next:"evade",kind:"safe",points:120,flow:15}
      ]
    },
    evade:{
      title:"BREATHE & SLIP",shot:"03",location:"雨の路地",scene:"rain",motion:"evade",
      subtitle:"拳が空を切る。その一瞬を逃さない。",tell:"相手の重心が前に流れた",duration:3400,window:[.59,.91],cueAt:.41,cutAt:.91,
      choices:[
        {id:"counter",label:"カウンター",sub:"最大の好機",symbol:"⚡",next:"counter",kind:"risky",points:340,flow:31},
        {id:"wall",label:"壁へ誘導",sub:"場面転換",symbol:"▣",next:"wall",kind:"normal",points:210,flow:22},
        {id:"sweep",label:"足を払う",sub:"低リスク",symbol:"↘",next:"sweep",kind:"safe",points:175,flow:15}
      ]
    },
    feint:{
      title:"FALSE OPENING",shot:"04",location:"朱色の寺院",scene:"temple",motion:"feint",
      subtitle:"わざと隙を見せ、相手を誘い込む。",tell:"相手が不用意に踏み込んできた",duration:3400,window:[0.56,0.89],cueAt:0.41,cutAt:0.89,
      choices:[
        {id:"counter",label:"迎え撃つ",sub:"カウンター",symbol:"⚡",next:"counter",kind:"risky",points:330,flow:30},
        {id:"sweep",label:"足元を狙う",sub:"崩し",symbol:"↘",next:"sweep",kind:"normal",points:240,flow:22},
        {id:"rush",label:"間合いを詰める",sub:"攻勢維持",symbol:"↗",next:"rush",kind:"safe",points:150,flow:17}
      ]
    },
    elbow:{
      title:"CLOSE QUARTERS",shot:"05",location:"ネオン街",scene:"neon",motion:"impact",
      subtitle:"連続打撃！ 相手がよろめく。",tell:"敵の体勢が崩れた。決めるなら今",duration:3100,window:[0.54,0.9],cueAt:0.39,cutAt:0.9,
      choices:[
        {id:"finisher",label:"決着の一撃",sub:"大技・高報酬",symbol:"✷",next:"finish",kind:"risky",points:430,flow:39},
        {id:"throw",label:"投げに移る",sub:"追加演舞",symbol:"↻",next:"throw",kind:"normal",points:270,flow:22},
        {id:"leave",label:"距離を取る",sub:"安全に終了",symbol:"◇",next:"breakaway",kind:"safe",points:150,flow:14}
      ]
    },
    sweep:{
      title:"LOW ARC",shot:"06",location:"雨の路地",scene:"rain",motion:"kick",
      subtitle:"足払いが成功。敵の隙が大きくなる。",tell:"相手が片膝をついている",duration:3200,window:[0.55,0.9],cueAt:0.38,cutAt:0.9,
      choices:[
        {id:"finisher",label:"追撃の蹴り",sub:"フィニッシュ",symbol:"✷",next:"finish",kind:"risky",points:380,flow:35},
        {id:"throw",label:"立て直しを狩る",sub:"投げへ連携",symbol:"↻",next:"throw",kind:"normal",points:265,flow:23},
        {id:"leave",label:"間合いを切る",sub:"安全に終了",symbol:"◇",next:"breakaway",kind:"safe",points:160,flow:14}
      ]
    },
    counter:{
      title:"PERFECT REVERSAL",shot:"07",location:"ネオン街",scene:"neon",motion:"counter",
      subtitle:"完璧なカウンター！ 光の中を切り裂く。",tell:"相手の防御が一瞬なくなった",duration:3200,window:[0.56,0.91],cueAt:0.4,cutAt:0.91,
      choices:[
        {id:"finisher",label:"一気に決める",sub:"最速フィニッシュ",symbol:"✷",next:"finish",kind:"risky",points:470,flow:40},
        {id:"throw",label:"投げる",sub:"演舞を伸ばす",symbol:"↻",next:"throw",kind:"normal",points:270,flow:25},
        {id:"leave",label:"構えを戻す",sub:"安全に終了",symbol:"◇",next:"breakaway",kind:"safe",points:170,flow:15}
      ]
    },
    wall:{
      title:"SCENE TRANSITION",shot:"08",location:"ネオン街",scene:"neon",motion:"rush",
      subtitle:"壁際へ追い詰める。映像は次のロケ地へ。",tell:"背後は壁、相手は逃げ場を探す",duration:3500,window:[0.57,0.9],cueAt:0.42,cutAt:0.9,
      choices:[
        {id:"finisher",label:"壁を使う",sub:"高難度の一撃",symbol:"✷",next:"finish",kind:"risky",points:440,flow:36},
        {id:"throw",label:"投げ飛ばす",sub:"追撃",symbol:"↻",next:"throw",kind:"normal",points:260,flow:24},
        {id:"leave",label:"勝負を締める",sub:"安全な決着",symbol:"◇",next:"breakaway",kind:"safe",points:180,flow:15}
      ]
    },
    throw:{
      title:"GRAVITY CUT",shot:"09",location:"朱色の寺院",scene:"temple",motion:"impact",
      subtitle:"身体が宙を舞う。最後の一手が迫る。",tell:"相手が着地の態勢を取った",duration:3500,window:[0.57,0.9],cueAt:0.41,cutAt:0.9,
      choices:[
        {id:"finisher",label:"着地に追撃",sub:"連携フィニッシュ",symbol:"✷",next:"finish",kind:"risky",points:490,flow:38},
        {id:"leave",label:"残心を決める",sub:"美しい締め",symbol:"◈",next:"breakaway",kind:"normal",points:230,flow:18},
        {id:"pause",label:"間合いを離す",sub:"安全な終幕",symbol:"◇",next:"breakaway",kind:"safe",points:155,flow:12}
      ]
    },
    stumble:{
      title:"MISSED THE BEAT",shot:"X1",location:"雨の路地",scene:"rain",motion:"stumble",
      subtitle:"タイミングを逃した！ ここから立て直せ。",tell:"敵が大きく踏み込んでくる",duration:3200,window:[0.55,0.9],cueAt:0.42,cutAt:0.9,
      choices:[
        {id:"recover",label:"立て直す",sub:"反撃の一手",symbol:"↶",next:"counter",kind:"risky",points:165,flow:16},
        {id:"safe",label:"離脱する",sub:"試合を終える",symbol:"◇",next:"breakaway",kind:"safe",points:80,flow:6},
        {id:"gamble",label:"捨て身の攻撃",sub:"逆転に賭ける",symbol:"⚡",next:"finish",kind:"risky",points:235,flow:18}
      ]
    },
    finish:{
      title:"FINAL TAKE",shot:"10",location:"桜の屋上",scene:"sakura",motion:"finish",
      subtitle:"すべての動きがつながった。決着。",tell:"FILM COMPLETED",duration:4100,terminal:"victory"
    },
    breakaway:{
      title:"THE LAST POSE",shot:"11",location:"朱色の寺院→桜の屋上",scene:"temple",motion:"quiet",
      subtitle:"静かな残心。選んだ戦いはここに終わる。",tell:"FILM COMPLETED",duration:3600,terminal:"survived"
    },
    knockout:{
      title:"CUT TO BLACK",shot:"XX",location:"雨の路地",scene:"rain",motion:"stumble",
      subtitle:"判断を誤った。映像は暗転する。",tell:"TAKE FAILED",duration:3000,terminal:"defeat"
    }
  };
  for (const [id, node] of Object.entries(graph)) {
    node.id = id;
    if (!node.terminal) {
      if (!Array.isArray(node.choices) || node.choices.length !== 3) throw Error("Invalid node choices: " + id);
      for (const choice of node.choices) if (!graph[choice.next]) throw Error("Missing target " + choice.next);
    }
  }
  scope.GF_GRAPH = Object.freeze(graph);
})(window);
