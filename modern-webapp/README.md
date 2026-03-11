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
実運用値は `index.html` に直書きせず、`app-config.js`（または同等のランタイム注入）で渡してください。  
最低限、`gasEndpoint` を現在の GAS Web アプリ URL に合わせれば `https://ut6119.github.io/mercari/` で動きます。

## Firebase（Firestore）へ切り替える場合

速度優先ならこちらを推奨です。`public/index.html` には実キーを置かず、`.env` の `PUBLIC_FIREBASE_*` を設定してください。

1. Firebaseプロジェクト作成
2. Firestore Database 作成（本番モード）
3. ウェブアプリを追加して `apiKey/authDomain/projectId/appId` を取得
4. App Check（Web）を作成して `siteKey` を取得
5. `.env` に `PUBLIC_FIREBASE_*` を設定
6. `PUBLIC_FIREBASE_ENABLED=true` と `PUBLIC_FIREBASE_APPCHECK_ENABLED=true` に変更して起動

最低限必要な `.env`:

```env
PUBLIC_FIREBASE_ENABLED=true
PUBLIC_REQUIRE_LOGIN=true
PUBLIC_FIREBASE_API_KEY=...
PUBLIC_FIREBASE_AUTH_DOMAIN=...
PUBLIC_FIREBASE_PROJECT_ID=...
PUBLIC_FIREBASE_APP_ID=...
PUBLIC_FIREBASE_APPCHECK_ENABLED=true
PUBLIC_FIREBASE_APPCHECK_SITE_KEY=...
```

初期ルール（まず動作確認用）:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }
    function legacyOwnerUid() {
      return exists(/databases/$(database)/documents/mercari_archives/legacy_owner)
        ? get(/databases/$(database)/documents/mercari_archives/legacy_owner).data.ownerUid
        : '';
    }
    function isLegacyOwner() {
      return signedIn() && request.auth.uid == legacyOwnerUid();
    }

    // 商品データ: mercari_items/{uid}/items/{itemId}
    match /mercari_items/{uid}/items/{itemId} {
      allow read, write: if signedIn() && request.auth.uid == uid;
    }
    // 旧フラット構造（初回移行のみ）
    match /mercari_items/{legacyDocId} {
      allow read, write: if isLegacyOwner();
    }

    // 月別アーカイブ・交通費・メタ: mercari_archives/{uid}/...
    match /mercari_archives/{uid}/{path=**} {
      allow read, write: if signedIn() && request.auth.uid == uid;
    }
    // 旧アーカイブ構造（初回移行のみ）
    match /mercari_archives/{month}/items/{itemId} {
      allow read, write: if isLegacyOwner() && month.matches('^\\d{4}-\\d{2}$');
    }
    match /mercari_archives/transport_ledger/items/{itemId} {
      allow read, write: if isLegacyOwner();
    }
    match /mercari_archives/transport_ledger {
      allow read, write: if isLegacyOwner();
    }
    match /mercari_archives/archive_meta {
      allow read, write: if isLegacyOwner();
    }

    // 旧データ所有者ロック用
    match /mercari_archives/legacy_owner {
      allow read: if signedIn();
      allow create: if signedIn() && !exists(/databases/$(database)/documents/mercari_archives/legacy_owner);
      allow update: if signedIn() && resource.data.ownerUid == request.auth.uid;
      allow delete: if false;
    }
  }
}
```

※ 既存共有データは「最初にログインした1ユーザー」に自動移行されます。  
※ 2人目以降は自分専用の空データから開始します。

## 本番向け（GAS依存を外す）

`GOOGLE_SERVICE_ACCOUNT_JSON` を設定すると、Google Sheets APIへ直接接続します。

1. GCPでサービスアカウントを作成
2. JSONキーを発行
3. シートをサービスアカウントに共有（編集者）
4. `.env` に `GOOGLE_SERVICE_ACCOUNT_JSON` を設定

## セキュア設定の要点

- `public/index.html` には実キーを書かない（プレースホルダ固定）
- 実運用値は `.env` の `PUBLIC_*` で注入する
- `.env` はGit管理しない（`.gitignore` 済み）
