# modern-webapp

GASの `HtmlService` を使わない、通常Webアプリ版です。

## 最短起動（設定ほぼ不要）

このモードは、`~/.clasprc.json` があれば Apps Script API 経由で動きます。
（既に `clasp login` 済みなら追加設定なし）

```bash
cd modern-webapp
cp .env.example .env
npm install
npm run dev
```

開くURL: `http://localhost:3000`

もし `~/.clasprc.json` が無い環境では、`.env` の `GAS_WEBAPP_URL` を使うフォールバックになります。

## GitHub Pages で公開する場合

このフォルダの `public/` は GitHub Pages 用です。  
`public/index.html` の `window.APP_CONFIG.gasEndpoint` を現在の GAS Web アプリ URL に合わせれば、  
`https://ut6119.github.io/mercari/` で動きます。

## 本番向け（GAS依存を外す）

`GOOGLE_SERVICE_ACCOUNT_JSON` を設定すると、Google Sheets APIへ直接接続します。

1. GCPでサービスアカウントを作成
2. JSONキーを発行
3. シートをサービスアカウントに共有（編集者）
4. `.env` に `GOOGLE_SERVICE_ACCOUNT_JSON` を設定
