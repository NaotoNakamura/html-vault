# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## このアプリについて

HTML Vault: ユーザーがアップロードした静的ファイル (HTML/JS/CSS/JSON/SVG) を保存し、直リンクでサンドボックス化されたiframe上にプレビュー表示できるツール。アップロードは常に `Bundle` (`Bundle` has_many `UserFile`) 単位で行い、1ファイルの単体アップロードも「要素数1の`Bundle`」として扱う特別扱いをしない設計。HTML内の相対パス参照 (`<link href="style.css">`) が正しく解決されるよう、バンドル配下のファイルは共通の名前空間 `/preview/:bundle_public_id/*filename` で配信される。管理画面 (アップロード/一覧/削除) は `frontend/` 配下のReact SPAが担い、Railsはその API とファイル配信ルートを担当する。

以下2つの詳細ドキュメントが既に存在する。該当領域を大きく変更する場合はゼロから設計を導出せず、まずこれらを読み、変更後は更新すること:
- `docs/backend-architecture.md` — ルーティング表、コントローラー、モデル、DBスキーマ、セキュリティ設計 (CSPサンドボックス化、CSRF処理)、Active Storage構成、既知の制約 (認可未実装、本番でもディスクストレージ)
- `docs/frontend-architecture.md` — `vite_rails`/`vite_ruby` gemを**使わずに** Vite製React SPAをRailsに統合している方法 (手動でのdev-server用scriptタグ生成、Fast Refresh preamble注入、本番時のmanifest解決)

## コマンド

### バックエンド (Rails。Dockerコンテナ内で実行する — ローカルにPostgreSQLは無い)

```bash
docker compose up -d db                      # Postgres起動
docker compose up -d --build web              # Railsコンテナのビルド・起動
docker compose exec web bash -c "bin/rails db:prepare db:migrate"
docker compose exec web bash -c "rm -f tmp/pids/server.pid && bundle exec rails server -b 0.0.0.0"
```

`web` コンテナ起動後は `http://localhost:3000` でアクセス可能 (`compose.yml` で `3000:3000` を公開)。

Lint / セキュリティチェック (`bin/ci` / `config/ci.rb` と同内容。コンテナ内、またはローカルにRubyがあれば `bin/...` で実行):
```bash
bin/rubocop                                                              # Rubyスタイル (rubocop-rails-omakase)
bin/bundler-audit                                                        # gemの脆弱性監査
bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error           # 静的セキュリティ解析
bin/ci                                                                   # 上記すべてを ActiveSupport::ContinuousIntegration 経由で実行
```

**テストスイートは存在しない** (`--skip-test --skip-system-test` で生成されたアプリのため)。検証はcurl (API) やブラウザ (UI) での手動確認で行う。

### フロントエンド (`frontend/`。TypeScript + React 19 + Tailwind v4 + Vite。素の`pnpm`/`npm`のみ、テストランナー無し)

```bash
cd frontend
pnpm dev             # Vite dev server (:5173 固定ポート、strictPort: true — frontend-architecture.md 参照)
npx tsc -b            # 型チェックのみ
pnpm build            # tsc -b && vite build → ../public/assets, ../public/.vite/manifest.json に出力
```

`docker compose exec web ... rails server` と `pnpm dev` を両方起動した状態で `http://localhost:3000/` を開く。Railsがentry HTMLを返し、そこからVite dev server上のモジュールを直接読み込む仕組み (詳細は `docs/frontend-architecture.md`)。

`public/assets/` と `public/.vite/` はビルド成果物 (`/public/assets` は `.gitignore` 対象)。`pnpm build` で再生成されるためコミットしないこと。

## アーキテクチャ

- **単一のRailsアプリで、別建てのAPIサーバーは無い。** `Api::V1::*` コントローラーがJSONを返し、`PreviewController` がアップロード済みファイルの実体を直接配信し、`root`は`AdminController`が管理画面のentry HTMLを返す。`vite_rails` gemは使わず、Rails/Vite統合は `app/helpers/application_helper.rb` に自前実装されている (詳細は `docs/frontend-architecture.md`)。
- **認証はCloud IAPに委譲**しており、アプリ内には実装が無い。`ApplicationController#current_user_email` が `X-Goog-Authenticated-User-Email` ヘッダーを読む (ローカルではダミーメールにフォールバック) が、現状どこからも呼ばれておらず未使用。ユーザーごとのデータの絞り込み・認可は無く、認証さえ通れば誰でも全ファイルを閲覧・削除できる (`docs/backend-architecture.md` に既知の制約として記載)。
- **コンテンツを表すモデルは2つ**: `Bundle` (アップロードの単位。`has_many :user_files, dependent: :destroy`、`public_id` [`SecureRandom.alphanumeric(8)`、DB側で重複チェック] で内部の連番`id`を外部に晒さない) と `UserFile` (Bundle配下の1ファイル、`has_one_attached :file`、`belongs_to :bundle` は必須)。`UserFile`自身は`public_id`を持たない — 常に`Bundle`の`public_id` + `filename`の組でルックアップされるため。API/配信エンドポイントは`Api::V1::BundlesController`と`/preview/:bundle_public_id/*filename`の1系統のみで、単体アップロード専用の別エンドポイントは無い。
- **ファイル配信 (`PreviewController`)** はActive Storageのblobを `send_data` で直接ストリーミングする。`sandbox` CSP (意図的に `allow-same-origin` を含めない) でアップロードされた信頼できないHTML/JSを親アプリのCookie/セッションから隔離しており、加えて `skip_forgery_protection` を指定している — Railsの標準CSRF機構はクロスオリジンからのJavaScriptレスポンスへのGETをデフォルトでブロックする (レガシーなJSONP型攻撃を防ぐための仕組み) ため、これが無いと`<script src="app.js">`のプレビューが壊れる。
- **バンドルのルーティング**: `/preview/:bundle_public_id/*filename` はグロブセグメントに `format: false` を指定している。指定しないと `.css` のような末尾の拡張子がRailsによってレスポンスフォーマットとして解釈・除去され、キャプチャされたファイル名が壊れてルックアップに失敗する。
- **Active Storageの添付は削除時に自動パージされない**ため、`UserFile` は明示的に `before_destroy :purge_file` を持つ。これにより `UserFile` の直接削除と、`Bundle` 削除に伴うカスケード削除のどちらでもblobが正しく削除される。
- **ストレージ**: 全環境 (本番含む) でActive Storageの `Disk` サービスを使用 (`config/storage.yml`)。S3/GCS等への切り替えは未実施という既知の制約がある。
- **DB**: PostgreSQLのみ、Docker Compose経由で使用 (`compose.yml`: `db` = `postgres:16`、`web` = 本アプリをバインドマウントし `DATABASE_URL` で接続)。
