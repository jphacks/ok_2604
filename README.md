# ライフRPG v3

目標をボスに変えて倒していく、ドット絵RPG風の成長記録アプリ。

## 構成
- `index.html` / `style.css` / `app.js` / `sprites.js` / `config.js` … フロント(静的ファイルのみ)
- `worker.js` / `wrangler.toml` … Cloudflare Worker(登録・ログイン・クラウドセーブ・Gemini 中継)

## ローカルで試す
```bash
python3 -m http.server 8765
```
http://localhost:8765 を開き、「ゲストで試す」で始められます(AI提案・クラウド保存は使えません。目標は手動追加)。

## Worker のデプロイ(登録・クラウド保存・AI を使う場合)
```bash
npx wrangler kv namespace create DB      # 表示された id を wrangler.toml に貼る
npx wrangler secret put GEMINI_API_KEY   # Gemini の API キー(Worker 側にだけ保存)
npx wrangler deploy
```
1. 公開後の URL(`https://liferpg-api.<name>.workers.dev`)を `config.js` の `API_BASE` に入れるか、ログイン画面の「サーバー設定」に入力する。
2. 本番では `wrangler.toml` の `ALLOWED_ORIGIN` を、フロントを公開するオリジンに限定する。
3. Gemini のモデル名は `GEMINI_MODEL` で変更可能。

## 仕様メモ
- パスワードは PBKDF2(SHA-256, 100,000回)でハッシュ化して KV に保存。ログイン失敗が10回続くと15分ロック。
- AI 呼び出しはログイン必須、1ユーザー1時間60回まで。
- ステータスは EXP とレベルのみ。能力値・レーダーチャートはありません。
- 記録の判定(Gemini):自由名のスキル1〜3個、今日の収穫、未来へのリターン、獲得EXP(10〜100)。スキルは判定画面に出すだけで保存しません。
- 目標は「木」:いちばん上が最終目標(魔王)で、どの目標も「AIに分けてもらう」(Gemini、`/split`)または手動で子目標に分けられる。何段でも分けられる。AIが「このまま取り組める」と判断すると分割を提案しない。
- 怪物は層で決まる:魔王(最終目標)→ドラゴン→ゴーレム→ゴブリン→スライム(4層目以降)。
- いちばん小さい目標を「撃破した!」にすると、子がすべて撃破された親目標も自動で撃破される。撃破の経験値は層ごとに 200 / 100 / 50 / 25 / 10。
- 最上部のアニメは最終目標の魔王を映し、各目標の「アニメに映す」で切り替えられる。
- 装備はレベルで解放(Lv2〜15、能力とは無関係)。
- レベル = floor(√(累計EXP/20)) + 1。
- AI失敗・未接続時は簡易なキーワード判定にフォールバック。
