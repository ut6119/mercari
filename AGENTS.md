# Agent Instructions — mercari_inventory_webapp

## モデル先行デプロイ（絶対遵守）
- すべての変更は **モデル版（`?env=model`）でのみ有効** にして実装する。
- 本番（prod）への反映は、ユーザーの指示に **「本番に実装」** という文言が含まれている場合のみ行う。
- 「本番に実装」の文言がない限り、`index.html` / `app.js` の変更はモデル環境チェック（`appConfig.environment === 'model'`）で囲むこと。
- モデルへの変更は完了後 **必ず即座に commit + push** する。確認は不要。

## Release Guard
- UI文言を変更した場合、GAS UI (`Index.html`) と Pages UI (`modern-webapp/public/index.html`, `modern-webapp/public/app.js`) の両方を同じターンで更新する。
- 完了前に旧ラベル（例: `前月をアーカイブ`, `前月アーカイブ`）が残っていないか文字列チェックを行う。
- ユーザー向け修正は両デプロイ先に反映する:
  1. GAS: `npm run deploy`
  2. GitHub Pages: commit + push `main`（ワークフロートリガー: `modern-webapp/public/**`）
- デプロイ後に公開エンドポイントを確認する:
  - GAS Web App URL（`.gas-deployment-id` 参照）
  - `https://ut6119.github.io/mercari/`
