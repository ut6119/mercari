# modern-webapp

GASの `HtmlService` を使わない、通常のWebアプリ版です。  
`Express` が API と静的フロントを提供し、データは Google Sheets API で直接読み書きします。

## 1. 事前準備

1. GCPでサービスアカウントを作成
2. JSONキーを発行
3. 対象スプレッドシートをサービスアカウントのメールアドレスに共有（編集者）

## 2. 環境変数

`.env.example` を `.env` にコピーして設定します。

- `GOOGLE_SERVICE_ACCOUNT_JSON`: サービスアカウントJSON（生JSON or base64）
- `SPREADSHEET_ID`: 対象スプレッドシートID
- `SHEET_NAME`: 通常は `メルカリ`

## 3. 起動

```bash
cd modern-webapp
npm install
npm run dev
```

起動後:

- Web UI: `http://localhost:3000`
- API:
  - `GET /api/dashboard`
  - `POST /api/items`
  - `DELETE /api/items/:id`
  - `POST /api/archive`
