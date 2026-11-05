# GIF FIGHTERS — MOTION CHAIN

**映像を操作して格闘映画を作る、iPhone縦画面向け分岐アクションゲーム。**

## 起動
- 静的サイト。npm / ビルド不要。index.html を HTTPS で公開。
- GitHub Pages: Settings → Pages → Deploy from a branch → main / (root)。
- Pages を設定した場合の想定URL: https://yz4git.github.io/newgame7/ 。

## 実装済み（v0.3 / 全ショットの分岐統一）
- 3択の映像分岐、13ノード（結末を含む）、相手の攻撃予兆表示。
- タイミング評価 PERFECT / GOOD / MISS / TIME OUT。
- HP、チェーン、スコア、フロー、場面転換。
- リテイク2回、結果画面、選択履歴を自動でつなぐリプレイ。
- iPhone縦画面、safe-area、タッチ選択。
- 映像が未登録の場合のCSSアニマティック（実写映像ではありません）。
- iPhone内のGIF、MP4、WebM、WebPをシーンに一時的に割り当て。
- assets/manifest.json からGitHub配信クリップの読み込み。

## iPhoneから自分のGIF・MP4を当てはめる
1. タイトルの「クリップ素材を割り当てる」をタップ。
2. 映像ノードを選び、端末のファイルから動画/GIFを選ぶ。
3. 「完了」→「START FILM」で試す。
4. 一時割当なので再読み込み後は消える。端末動画がGitHubへ自動アップロードされることはない。

## 分岐元に合わせた実写動画（入口差分）
動作を自然につなぐには同じシーンでも「どの技から来たか」で最初の身体の姿勢が変わります。
タイトルのクリップ素材割当画面で**映像ノード**と**入口（出発カット・選択）**を選び、それぞれにiPhone内の動画を一時的に登録できます。未登録なら共通クリップにフォールバックします。

GitHubへ恒久登録する場合、`assets/manifest.json` に次の形式が使えます（実写動画ファイルはまだありません）。

```json
{
  "elbow": {
    "default": "assets/clips/elbow.mp4",
    "from": {
      "rush:elbow": "assets/clips/elbow_from_rush.mp4"
    }
  },
  "finish": {
    "default": "assets/clips/finish.mp4",
    "from": {
      "counter:finisher": "assets/clips/finish_from_counter.mp4",
      "throw:finisher": "assets/clips/finish_from_throw.mp4"
    }
  }
}
```

識別子は `graph.js` の `node.id` と `choice.id` に対応します。再生エンジンは入場元を覚えて選択し、リプレイでも同じ入口差分を再生します。これで**入口の種類ごとに別撮りの映像を使える土台**ができました。ただし映像の滑らかな接続品質そのものは実写素材完成後に検証します。

## 永続的な映像素材
動画・GIFを assets/clips/ に追加して assets/manifest.json にノードIDとパスを登録。
例:
```json
{"intro":"assets/clips/intro.mp4","rush":"assets/clips/rush.mp4"}
```
動画長さは graph.js の duration（ミリ秒）を目安に制作し、登場人物の向き・画角・姿勢を接続点で統一してください。
MP4/H.264、短い無音クリップがiPhone向け基本。GIFは短いループ素材を想定。

## 制作コンテ（制作前レビュー）
- **[縦画面改訂絵コンテ v2 — CUT 01–03](docs/STORYBOARD_VERTICAL_V2.md)**（初期3ショットの最新基準）
- **[縦画面・全ショット絵コンテ v3 — CUT 04–XX](docs/STORYBOARD_ALL_V3.md)**（残り10ショットの完成仕様）
- [編集可能な13枚の構図・姿勢シート](docs/storyboards)（各シーンの3:4フレーム・動作・分岐図）
- [全13シーンの字コンテ v1.0](docs/TEXT_STORYBOARD.md)（SHOT 01–03の古い尺・分岐位置はv2で上書き）
- 桜華・レイナの固定外見、縦型3:4のフレーミング、30分岐の入口／出口姿勢を優先。実写クリップはまだ作成していない。
- **LIVE CUTの時間スクラブ操作は不採用。** 全10個の選択ノードにMOTION BRANCHを適用。敵の予兆を読み、戦術を選び、設定済みカットポイントで次のショットへ。

## 主要ファイル
- docs/SPEC.md — 仕様と作業順。
- graph.js — 分岐グラフ、予兆、技の属性。
- app.js — タイミング判定、リテイク、リプレイ、動画再生。
- index.html / styles.css — iPhone画面と代替アニマティック。
- assets/manifest.json — 本編動画ファイルの割当。

## 今後の作業順
1. MVPの分岐・タイミング・選択・結果処理の動作試験。
2. 実写クリップの生成／撮影、背景・画角・動作末端の整合。
3. 分岐の前読みと接続カット、場面ごとの尺調整。
4. iPhone Safari実機での入力・再生・GPU/メモリ最適化。
5. リプレイの動画化、演舞編集、キャラクター追加。

## 制約
v0.3のキャラ映像はCSSアニマティックです。フォトリアル動画素材、実動画間のシームレスな接続、動画ファイルへのリプレイ書き出しは未実装。現在のリプレイはプレイしたルートをゲーム内で再実行する方式です。

操作: 全10個の選択シーンで「BRANCH」表示中に次の動きを選び、映像を途中で止めず定めたカットポイントで切り替えます。予兆前の早押しは失敗扱いにしません。RETAKEで直前の分岐を撮り直せます。
