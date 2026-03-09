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

## Firebase（Firestore）へ切り替える場合

速度優先ならこちらを推奨です。`public/index.html` の `window.APP_CONFIG.firebase` を設定してください。

1. Firebaseプロジェクト作成
2. Firestore Database 作成（本番モード）
3. ウェブアプリを追加して `apiKey/authDomain/projectId/appId` を取得
4. `public/index.html` の設定を更新
5. `enabled: true` に変更してデプロイ

初期ルール（まず動作確認用）:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /mercari_items/{doc} {
      allow read, write: if true;
    }
    match /mercari_archives/{doc=**} {
      allow read, write: if true;
    }
  }
}
```

※ 公開運用時は、必ず認証付きルールに締めてください。

## 本番向け（GAS依存を外す）

`GOOGLE_SERVICE_ACCOUNT_JSON` を設定すると、Google Sheets APIへ直接接続します。

1. GCPでサービスアカウントを作成
2. JSONキーを発行
3. シートをサービスアカウントに共有（編集者）
4. `.env` に `GOOGLE_SERVICE_ACCOUNT_JSON` を設定
