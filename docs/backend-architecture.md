# バックエンド構成

Rails 8.1 (API + フロント配信の単一アプリ)。DB は PostgreSQL、ファイル本体は Active Storage (Disk service) で保存する。認証は独自実装ではなく、Cloud IAP が付与するヘッダーに委譲している。フロントエンドの統合方法 (Vite との連携) は [frontend-architecture.md](./frontend-architecture.md) を参照。

## 概要

このアプリ (HTML Vault) は、ユーザーがアップロードした静的ファイル (HTML/JS/CSS/JSON/SVG) を保存し、`/v/:public_id` という直リンクでブラウザ上にプレビュー表示できるようにするツール。管理画面 (アップロード/一覧/削除) は React SPA (`frontend/`) が担い、Rails はその API と、アップロード済みファイルの配信を担う。

## ディレクトリ構成

```
app/
  controllers/
    application_controller.rb       # 全コントローラーの基底。IAP認証ヘルパーを持つ
    fallback_controller.rb          # SPA の entry HTML を返す
    preview_controller.rb           # /v/:public_id でアップロード済みファイルを配信
    api/v1/
      base_controller.rb            # API共通の基底 (CSRF検証スキップ, 404ハンドリング)
      user_files_controller.rb      # ファイルの index/create/destroy
  models/
    user_file.rb                    # アップロードファイルのメタデータ + Active Storage 添付
  helpers/
    application_helper.rb           # Vite 連携ヘルパー (frontend-architecture.md 参照)
  views/
    fallback/index.html.erb         # SPA entry HTML (<div id="root">)
config/
  routes.rb
  database.yml                      # PostgreSQL 接続設定
  storage.yml                       # Active Storage サービス定義 (Disk)
  initializers/content_security_policy.rb  # 未設定 (コメントアウトのみ)
db/
  migrate/                          # active_storage テーブル + user_files テーブル
  schema.rb
```

## ルーティング (`config/routes.rb`)

| パス | メソッド | 遷移先 | 用途 |
|---|---|---|---|
| `/up` | GET | `rails/health#show` | ヘルスチェック (ロードバランサ等) |
| `/api/v1/user_files` | GET/POST | `Api::V1::UserFilesController#index` / `#create` | ファイル一覧取得 / アップロード |
| `/api/v1/user_files/:id` | DELETE | `Api::V1::UserFilesController#destroy` | ファイル削除 |
| `/v/:public_id` | GET | `PreviewController#show` | アップロード済みファイルの直リンク配信 |
| `/` および他の HTML GET (`*path`) | GET | `FallbackController#index` | React SPA の entry HTML を返す (SPAフォールバック) |

`get "*path"` は `constraints: ->(req) { req.format.html? }` で HTML リクエストのみに限定しており、`/api/*` や静的アセットのリクエストを誤って奪わないようにしている。このルートは他のすべてのルートより後に定義する必要がある (実際そうなっている)。

## コントローラー層

### `ApplicationController`

全コントローラーの基底。`allow_browser versions: :modern` でレガシーブラウザを弾き、`stale_when_importmap_changes` で importmap 変更時に HTML の ETag を無効化する。

認証は自前実装ではなく **Cloud IAP (Identity-Aware Proxy)** に委譲している。

```ruby
IAP_EMAIL_HEADER = "X-Goog-Authenticated-User-Email"

def current_user_email
  raw_header = request.headers[IAP_EMAIL_HEADER]
  if raw_header.present?
    raw_header.split(":").last          # "accounts.google.com:user@example.com" → "user@example.com"
  elsif Rails.env.development? || Rails.env.test?
    DEV_DUMMY_EMAIL                     # "dev@example.com"
  end
end
```

- 本番では IAP がリバースプロキシとして手前に立ち、検証済みの ID を `X-Goog-Authenticated-User-Email` ヘッダーで転送してくる想定。Rails 側でパスワードやセッションを扱わない。
- 開発/テスト環境には IAP がいないため、ヘッダーが無い場合は固定のダミーメールにフォールバックする。IAP を模した挙動を検証したい場合は `-H "X-Goog-Authenticated-User-Email: accounts.google.com:me@example.com"` を手動で付与する。
- **注意**: `current_user_email` は現状どのコントローラーからも実際には呼ばれていない (未使用)。認可 (誰のファイルか) はまだ実装されておらず、`UserFile` にもユーザーとの紐付けカラムが無いため、ログイン中の全ユーザーがファイル一覧を共有する状態になっている。

### `Api::V1::BaseController`

API 系コントローラー共通の基底。

- `skip_before_action :verify_authenticity_token` — API はブラウザの `fetch` から JSON/multipart で叩かれる想定で、Rails 標準の CSRF トークン検証 (フォーム由来) は行わない。IAP がフロントに立つ構成のため、認証はネットワーク層 (IAP) 側に委ねている前提。
- `ActiveRecord::RecordNotFound` を rescue し、`{ error: "not found" }` を 404 で返す共通ハンドリング。

### `Api::V1::UserFilesController`

`/api/v1/user_files` の CRUD (一覧・作成・削除のみ、更新は無し)。

| アクション | 処理内容 |
|---|---|
| `index` | `UserFile.order(created_at: :desc)` を取得し、`serialize` で JSON 配列化して返す |
| `create` | `params[:file]` (multipart アップロード) を受け取り、拡張子から `file_type` を、ファイル名 (拡張子除く) から `title` のデフォルト値を決定。`UserFile#file` に添付して保存。バリデーション失敗時は `422` + `errors` |
| `destroy` | `@user_file.file.purge` で Active Storage 上の実体を削除してから `destroy` |

`create` のバリデーションはコントローラーではなくモデル (`UserFile`) 側に寄せてある (許可拡張子・サイズ上限など)。

`serialize` の返却形:

```json
{
  "id": 1,
  "public_id": "aB3dEf9k",
  "title": "sample",
  "filename": "sample.html",
  "file_type": "html",
  "created_at": "2026-08-09T12:00:00+09:00",
  "preview_url": "/v/aB3dEf9k"
}
```

### `PreviewController`

`/v/:public_id` — アップロード済みファイルをブラウザで直接開けるようにする、認証不要 (誰でもリンクを知っていれば開ける) のエンドポイント。

```ruby
response.set_header("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-modals;")
response.set_header("X-Content-Type-Options", "nosniff")
send_data user_file.file.download, type: user_file.content_type, filename: user_file.filename, disposition: "inline"
```

- ユーザーがアップロードした **信頼できない HTML/JS** をそのまま配信するため、`sandbox` ディレクティブ付き CSP でこのレスポンスを親アプリから隔離している。`allow-same-origin` を **含めていない** のがポイントで、これによりサンドボックス化されたドキュメントはこのアプリの Cookie/セッション/localStorage を一切読めない (別オリジン扱いになる)。
- `allow-scripts` / `allow-forms` / `allow-modals` は許可しているため、アップロードされた HTML 内の JS 実行やフォーム操作、`alert()` 等は動作する。
- `X-Content-Type-Options: nosniff` で、ブラウザによる MIME タイプの推測 (スニッフィング) を防止。
- レコードが見つからない場合は `404` を返す (`rescue_from` ではなく `rescue` 節で individually 処理。`Api::V1::BaseController` を継承していないため、共通の `rescue_from` は効かない)。
- `content_type` は `UserFile#content_type` で拡張子から決定 (下記モデル参照)。

### `FallbackController`

`layout false` で `app/views/fallback/index.html.erb` をそのまま返すだけの薄いコントローラー。ここが React SPA の entry point になる。詳細は [frontend-architecture.md](./frontend-architecture.md) を参照。

## モデル: `UserFile`

```ruby
class UserFile < ApplicationRecord
  ALLOWED_EXTENSIONS = %w[html js css json svg].freeze
  MAX_FILE_SIZE = 10.megabytes

  has_one_attached :file
  before_validation :assign_public_id, on: :create
  ...
end
```

| カラム | 型 | 説明 |
|---|---|---|
| `public_id` | string, unique | `/v/:public_id` で使う外部公開用 ID。`SecureRandom.alphanumeric(8)` で生成し、`create` 時に重複が無いことを DB に問い合わせながら採番 (`assign_public_id`)。内部の `id` (連番) を外部に晒さないための仕組み |
| `filename` | string | アップロード時の元ファイル名 |
| `title` | string | 表示用タイトル。未指定時は拡張子を除いたファイル名がデフォルト (コントローラー側で設定) |
| `file_type` | string | 拡張子 (`html`/`js`/`css`/`json`/`svg` のいずれか) |
| `file` (Active Storage) | — | ファイル本体。`has_one_attached :file` |

バリデーション:
- `public_id` / `filename` / `title` / `file_type` の presence、`public_id` の uniqueness
- `file_type` は `ALLOWED_EXTENSIONS` に含まれること
- `file_attached`: `file.attached?` であること
- `file_extension_allowed`: 添付ファイルの拡張子 (`file.filename.extension_without_delimiter`) が許可リストに含まれること — `file_type` パラメータとは独立に、実ファイルの拡張子でも二重にチェックしている
- `file_size_within_limit`: `MAX_FILE_SIZE` (10MB) 以下であること

`content_type` はプレビュー配信時の `Content-Type` ヘッダーを `file_type` から決定するメソッド (例: `html` → `text/html; charset=utf-8`)。Active Storage が推測する content type ではなく、こちらの固定マッピングを優先して使っている。

## データベース

PostgreSQL。主なテーブルは 2 系統:

- **Active Storage 標準テーブル** (`active_storage_blobs` / `active_storage_attachments` / `active_storage_variant_records`) — Rails の Active Storage エンジン提供のマイグレーションそのまま
- **`user_files`** — アプリ固有のテーブル。`public_id` にユニークインデックス

```ruby
create_table "user_files" do |t|
  t.string "public_id", null: false
  t.string "filename", null: false
  t.string "title", null: false
  t.string "file_type", null: false
  t.timestamps
end
add_index :user_files, :public_id, unique: true
```

`user_files` にユーザーを表す外部キーは無い (現状は全ユーザー共有)。

### 接続設定 (`config/database.yml`)

- development: `app_development` / test: `app_test` / production: `app_production`
- production は `username: app`、パスワードは `APP_DATABASE_PASSWORD` 環境変数から
- `max_connections` は `RAILS_MAX_THREADS` 環境変数 (デフォルト 5) に連動

## ファイルストレージ (Active Storage)

`config/storage.yml` は `Disk` サービスのみ定義済み (S3/GCS はコメントアウトされたテンプレートのまま、未設定)。

| 環境 | サービス | 保存先 |
|---|---|---|
| test | Disk | `tmp/storage` |
| development / production | Disk (`local`) | `storage/` (development.rb, production.rb 双方で `config.active_storage.service = :local`) |

**注意**: `production.rb` でも `local` (ディスク) サービスを使う設定のままになっている。コンテナ/Pod が再作成されると `storage/` 配下のファイルは消えるため、実運用時は S3 等の外部サービスへの切り替えが必要 (現状未対応)。

## セキュリティまわりの設計判断

- **CSRF**: API (`Api::V1::BaseController`) はトークン検証をスキップ。フォーム由来の CSRF 対策が前提としている「ブラウザセッション認証」をこのアプリは使っておらず (IAP 委譲)、かつ SPA からの `fetch` はトークンを持たないため。
- **アップロードファイルの隔離**: `PreviewController` が配信するレスポンスは `sandbox` CSP (allow-same-origin なし) で親アプリから完全に隔離。ユーザーが `<script>alert(document.cookie)</script>` を含む HTML をアップロードしても、サンドボックス内では本体アプリの Cookie/セッションにアクセスできない。
- **拡張子ホワイトリスト**: `ALLOWED_EXTENSIONS` (html/js/css/json/svg) 以外は拒否。SVG は XSS ベクタになり得るが `sandbox` 配信により影響を局所化している。
- **ファイルサイズ上限**: 10MB (`MAX_FILE_SIZE`)。
- **CSP (initializer)**: `config/initializers/content_security_policy.rb` はテンプレートのままコメントアウトされており、アプリ全体 (SPA 側) の CSP は未設定。`PreviewController` のヘッダー設定はそのレスポンス限定。

## 環境別設定の要点

- **development**: `config.active_storage.service = :local`、`consider_all_requests_local = true`、`cache_store = :memory_store`
- **production**: `config.assume_ssl = true` / `config.force_ssl = true` (SSL終端はリバースプロキシ front で行う想定)、`eager_load = true`、ログは STDOUT へタグ付き出力、`silence_healthcheck_path = "/up"`

## Docker / ローカル起動

`compose.yml`:

- `db`: `postgres:16`、`db_data` ボリュームで永続化
- `web`: リポジトリルートをバインドマウント (`.:/app`)、`3000:3000` を公開、`DATABASE_URL` で `db` サービスに接続

`Dockerfile` は `ruby:4.0-slim` ベースで `bundle install` まで (CMD は親イメージ依存)。イメージ内で bundle install した gem はコンテナの書き込みレイヤーにのみ存在するため、`docker compose down` の度に再インストールが走らないよう、実際にはリポジトリ全体をバインドマウントして bundle 済み gem をホスト側 (Bundler のデフォルトパス) に永続化する構成になっている。

起動:

```bash
docker compose up
docker compose exec web bash -c "rm -f tmp/pids/server.pid && bundle exec rails server -b 0.0.0.0"
```

フロントエンド (Vite dev server) を含めた完全な起動手順は [frontend-architecture.md](./frontend-architecture.md#起動手順-開発環境) を参照。

## 既知の制約・未検証事項

- **認可なし**: `current_user_email` はどこからも呼ばれておらず、`UserFile` はユーザーに紐付いていない。IAP でログインした任意のユーザーが全ファイルを閲覧・削除できる。将来的にファイル所有者を絞り込む場合は `user_files` にオーナー用カラムの追加と、コントローラー側での絞り込み/認可チェックが必要。
- **本番のストレージ**: `production.rb` が `Disk` サービスを指したままで、S3 等への切り替えが未実施。
- **CSP (アプリ全体)**: `content_security_policy.rb` initializer は未設定。SPA 側の XSS 対策は個別のブラウザ標準保護に依存している。
- **IAP 前提の未検証部分**: 本番で実際に IAP が手前に立ち、ヘッダーが期待通り渡ってくるかは未検証 (開発ではダミーメールにフォールバックするのみ)。
