# mc-command-testbed

マインクラフトのコマンドを、人を集めず、コマンドブロックも置かずに、複数人分まとめて試すための道具です。

1つのコマンドで、手元に使い捨ての公式サーバー(Java 版)が立ちます。そこへ偽のプレイヤーを N 人入れて、「だれが実行するか」を1行ずつ書いたコマンドの台本を流します。終わると結果の表が出て、どの行が通り、どの行が失敗したか、何秒かかったかが分かる。

```
$ mctestbed run examples/broken.mcfunction --accept-eula
...
6     Alice  this_is_not_a_command foo              FAIL    77ms  Unknown or incomplete command. ...
9     -      #@ assert if score Bob pts matches 99  FAIL    9ms   Test failed

4/6 steps passed, 2 failed (script lines: 6, 9)
test run: 0.4s  (server start: 10.1s, players joined: 2.0s, total: 13.7s)
```

実際の出力は [docs/demo-broken.txt](docs/demo-broken.txt) と [docs/demo-three-players.txt](docs/demo-three-players.txt) にあります。

## 向いている人

コマンドをたくさん使う企画(アドベンチャーマップ、ミニゲーム、動画、サーバーのイベント)を作っていて、撮影や公開の前に「AさんBさんCさんがそれぞれ動いたら最後まで動くか」を確かめたい人です。mod もプラグインもデータパックも要りません。

データパックを作っていて mod を入れられるなら、[PackTest](https://github.com/misode/packtest) か [Ward](https://github.com/mcbookshelf/ward) のほうが合うかもしれません。違いは [docs/existing-tools.md](docs/existing-tools.md) に書きました。

## できること(v0.1)

- 公式サーバー(既定は 1.21.11)を、毎回まっさらなワールドで立てます。つなげるのは自分のパソコンの中だけ(localhost)で、オフラインモードです。外のサーバーにはつなぎません。
- サーバー本体は、自分で公式から取ります。`mctestbed fetch-server` が Mojang の公式の配布元から取り、sha1 を確かめて手元に置きます。このリポジトリには入れず、再配布もしません。[EULA](https://aka.ms/MinecraftEULA) に同意する場合だけ `--accept-eula` を付けてください。
- 偽のプレイヤーを [mineflayer](https://github.com/PrismarineJS/mineflayer) で入れて、オペレーターにします。
- プレイヤーの行は、そのプレイヤー自身のチャットとして送ります(既定)。`@s` や権限や返事が、本物のプレイヤーと同じになります。`--as-mode execute` なら、コンソールから `execute as ... run ...` で実行します。
- 結果は、`execute if/unless` の条件(スコアボード・ブロック・エンティティ・チーム・タグ)、チャットの返事の正規表現、スコアボードやエンティティ数の一覧で確かめます。
- 失敗した行の番号と、テストが何秒かかったかを出します。サーバーの起動とプレイヤーの参加の時間は別に数えます。
- 終了コードは、全部通れば 0、失敗があれば 1、準備の失敗は 2 です。`--json` と `--out` で機械向けの出力も出せます。

## はじめかた

必要なもの: Node.js 20 以上、Java 21 以上。

```sh
git clone https://github.com/Y0ssh1i/mc-command-testbed
cd mc-command-testbed
npm install
node bin/mctestbed.js run examples/three-players.mcfunction --accept-eula
```

初回はサーバー本体(約 54 MB)を取るので少し待ちます。1回の実行は 10〜15 秒ほどで、ほとんどがサーバーの起動です。

## 台本の書き方

`.mcfunction` と同じ形です。`#@` で始まる行以外は、すべてコマンドです(先頭の `/` は付けても付けなくても構いません)。

```mcfunction
#@ players Alice Bob Carol
scoreboard objectives add pts dummy
#@ as Alice
give @s minecraft:diamond 3
scoreboard players add @s pts 5
#@ expect Alice /Added 5 to \[pts\]/
#@ as console
#@ wait 500ms
#@ assert if score Alice pts matches 5
#@ expect-fail
scoreboard players get Nobody pts
#@ show scores
```

指示の一覧は [README.md](README.md) の表を見てください。`mctestbed check <台本>` は、台本の書き方の誤りだけを調べます。

## Claude と組み合わせる(試験的・まだ自動ではありません)

JSON の結果を Claude に渡して、「この企画のコマンドを書いて」→ 試す → 失敗した行を渡して直させる、という輪にするのが狙いです。今は手で回します。使える頼み方は [docs/claude-loop.md](docs/claude-loop.md) にあります。

## 限界(v0.1)

- Java 版のみ、確かめた版は 1.21.11 だけです。統合版(Bedrock)は対応していません。
- コンソールと `execute` モードの失敗の判定は、既知のエラー文言で見ています。珍しい文言の失敗は見落とすことがあるので、`assert` を足してください。
- ゲームルールやコマンドの書き方は版で変わります(例: `doDaylightCycle` は 1.21.11 で名前が変わり、旧名は失敗した行として出ます)。
- 負荷試験の道具ではありません。
- 使い方の動画は、まだありません。

## ライセンス

MIT です。Mojang・Microsoft とは関係がありません。このリポジトリに Minecraft のコードや素材は入っていません。
