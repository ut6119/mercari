# mercari_inventory_webapp

Googleスプレッドシート `メルカリ` シートをデータソースにする Apps Script Webアプリです。

## 通常Webアプリ版（GAS UIを使わない）

`modern-webapp/` に、通常のWebアプリ版を追加済みです。  
`Express + Google Sheets API` で動作し、UIは `http://localhost:3000` で開けます。

詳細手順:
- [modern-webapp/README.md](/Users/ookuboyuuta/Documents/New%20project/mercari_inventory_webapp/modern-webapp/README.md)

## ファイル

- `Code.gs`: サーバー処理
- `Index.html`: UI
- `appsscript.json`: Apps Script マニフェスト
- `scripts/deploy-webapp.sh`: 1コマンドデプロイ
- `.gas-deployment-id`: 固定URL用のデプロイID

## ローカル運用（最短）

1. `npm ci`
2. `npx clasp login`（初回のみ）
3. `npm run deploy`

`npm run deploy` は以下を順番実行します。

1. `clasp push --force`
2. `clasp version`
3. 既存デプロイIDがあれば `clasp redeploy`（URL固定）
4. なければ `clasp deploy` して `.gas-deployment-id` に保存

新規URLを発行したいときだけ `npm run deploy:new` を使います。

## GitHub Actions 自動デプロイ

`.github/workflows/deploy-gas.yml` を同梱済みです。`main` への push で自動デプロイします。

GitHub リポジトリ側で以下の Secrets を設定してください。

- `CLASPRC_JSON`: ローカルの `~/.clasprc.json` の中身
- `GAS_DEPLOYMENT_ID`（任意）: 固定URLを維持したいときのデプロイID

macOSなら以下で値をクリップボードへコピーできます。

- `npm run copy:secret:clasprc`
- `npm run copy:secret:deployid`

## 期待するシート構成

- シート名: `メルカリ`
- A: 名前
- B: 売上
- C: 手数料
- D: 送料
- E: 原価
- F: 利益
- G: 利益率
- H: 合計収支
