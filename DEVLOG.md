# DEVLOG — セッション変更履歴

> **このファイルは Claude Code / Codex / 人間 が共同で使う変更ログです。**
> 作業開始時に直近エントリを読み、作業終了時に新しいエントリを追記してください。

## フォーマット

```
### YYYY-MM-DD HH:MM — <agent: claude-code | codex | human> — <要約 1行>
- **変更ファイル**: `path/to/file1`, `path/to/file2`
- **内容**: 何をしたか（箇条書き）
- **理由**: なぜその変更が必要だったか
- **未完了 / 注意**: 残タスクや後続作業者への注意点
- **関連コミット**: <commit hash or "uncommitted">
```

---

## ログ

### 2026-03-24 — claude-code — 入荷日・売却日を自由入力で編集可能に
- **変更ファイル**: `modern-webapp/public/app.js`, `modern-webapp/public/index.html`, `modern-webapp/server.js`
- **内容**: 入荷日・売却日セルをテキスト入力フィールドに変更。M/D形式で自由入力→タイムスタンプに変換して保存。auto-save対応。
- **理由**: ユーザーが後から日付を修正できるようにする要望
- **未完了 / 注意**: なし
- **関連コミット**: 9bf8aa0

### 2026-03-18 — claude-code — エージェント間共有ワークフロー構築
- **変更ファイル**: `DEVLOG.md`, `AGENTS.md`, `CLAUDE.md`（プロジェクトルート）
- **内容**: Claude Code / Codex 間で変更履歴を共有する仕組みを導入
- **理由**: 複数エージェントが同一コードベースで作業する際の情報断絶を防止
- **未完了 / 注意**: なし
- **関連コミット**: uncommitted

### 2026-03-20 15:54 — agent: codex — モデル環境でログイン必須化とゲスト無効化
- **変更ファイル**: `modern-webapp/public/index.html`, `DEVLOG.md`
- **内容**: `?env=model` 時に `appConfig.requireLogin = true` を強制し、`appConfig.guestMode.enabled = false` を強制
- **理由**: URL共有時の無制限利用リスクを下げ、アクセスをGoogleログイン利用者に限定するため
- **未完了 / 注意**: reCAPTCHAキー削除はサービスアカウント権限不足（`recaptchaenterprise.keys.list` denied）で自動実行不可。Google Cloud Console側で手動削除が必要
- **関連コミット**: uncommitted

### 2026-03-20 15:57 — agent: codex — 未使用 reCAPTCHA キーを削除
- **変更ファイル**: `DEVLOG.md`
- **内容**: OAuth（`~/.clasprc.json`）経由で reCAPTCHA Enterprise API を実行し、`projects/589698327361/keys/6LcneYUsAAAAAEHJc5Fg9fNWxkeyZejEv_awMQwB` を削除。再一覧で keys=0 を確認
- **理由**: 「You aren't protected」警告の原因になっていた未使用キーを整理するため
- **未完了 / 注意**: App Checkを将来使う場合は、新しいキーを作成して再設定が必要
- **関連コミット**: uncommitted

### 2026-03-20 15:59 — agent: codex — 本番向けにログイン必須・ゲスト無効を適用
- **変更ファイル**: `modern-webapp/public/app-config.js`, `modern-webapp/public/index.html`, `DEVLOG.md`
- **内容**: 本番/モデル共通で `requireLogin=true` を強制し、`guestMode.enabled=false` を固定。`env=model` 時の `*_model` コレクション分離は継続
- **理由**: URL共有時の無制限アクセスを防ぎ、利用者をGoogleログインユーザーに限定するため
- **未完了 / 注意**: なし
- **関連コミット**: uncommitted
