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
