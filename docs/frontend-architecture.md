# フロントエンド構成

React (Vite/TypeScript/Tailwind) を Rails アプリに統合する際、`vite_rails` / `vite_ruby` gem を **使わずに** 手動で統合している。この文書はその構成と、各判断の理由を残すためのもの。

## 前提: なぜ `vite_rails` を使わないか

`frontend/` を Rails から独立したディレクトリとして管理し、Gemfile 経由の依存を増やさない方針のため。デメリットとして、通常 gem が肩代わりする以下の処理を自前で実装している。

- 開発時: entry HTML から Vite dev server 上のモジュールを読み込むための `<script>` タグ生成
- 開発時: React Fast Refresh の preamble 注入
- 本番時: `vite build` が出力する manifest からハッシュ付きファイルを解決してタグ生成

これらは `app/helpers/application_helper.rb` に実装されている。

## ゴール: `http://localhost:3000/` だけで完結させる

開発時、ブラウザで開く URL は Rails の `:3000` 一つだけ。Vite の dev server (`:5173`) は裏で起動しているが、アドレスバーに入力する必要はない。

```
ブラウザ → http://localhost:3000/         (Rails: 未加工の Ruby サーバー)
              ├─ HTML (ERB) はここが返す
              ├─ /api/*, /v/*             (Rails が直接処理、同一オリジン)
              └─ HTML内の <script src="http://localhost:5173/...">
                   → ブラウザが直接 Vite dev server にアクセス (別オリジン, CORSで許可)
```

`/api/*` へのフロントエンドの `fetch` はページと同一オリジン (`:3000`) なので、Vite 側にプロキシ設定は不要 (`vite.config.ts` からも `server.proxy` は削除済み)。

## リクエストフロー

### 開発環境 (development)

1. ブラウザが `http://localhost:3000/` にアクセス
2. `config/routes.rb` の `root to: "fallback#index"` (それ以外の HTML GET は `get "*path"` の SPA フォールバックも同じ経路) により `FallbackController#index` が呼ばれる
3. `FallbackController` (`layout false`) が `app/views/fallback/index.html.erb` をそのままレンダリング
4. このビューが `ApplicationHelper#vite_client_tag` / `#vite_entry_tag` を呼び、`Rails.env.development?` が true なので次の3つの `<script>` を出力する
   1. `http://localhost:5173/@vite/client` — Vite の HMR クライアント
   2. React Fast Refresh の preamble (後述)
   3. `http://localhost:5173/src/main.tsx` — アプリの entry module
5. ブラウザはこれらを **Vite dev server (`:5173`) に対して直接** リクエストする。Vite は `vite.config.ts` の `server.cors` のデフォルト (`true`) により、`:3000` からのクロスオリジンアクセスを許可している
6. `main.tsx` 以降の相対 import (`@/AdminApp` など) は、import 元のモジュール自身が `:5173` から取得されているため、すべて `:5173` を基準に解決される。`:3000` に飛ぶことはない
7. React アプリ内から `fetch("/api/v1/user_files")` 等を呼ぶと、実行元のページが `:3000` なので **そのまま Rails に届く**(プロキシ不要)

### 本番環境 (production) ※ 未検証・保留中

1. `frontend/` で `pnpm build` を実行 → `vite build` が `src/main.tsx` を entry に `public/assets/` 以下へビルドし、`public/.vite/manifest.json` を出力する (`vite.config.ts` の `build.manifest: true`, `build.rollupOptions.input`)
2. `Rails.env.development?` が false のため、`ApplicationHelper#vite_entry_tag` は `vite_manifest_entry_tag` に分岐
3. `public/.vite/manifest.json` を読み、`src/main.tsx` エントリに対応する `file` (JS) / `css` (CSS配列) を取得し、ハッシュ付きの実ファイルパスへの `<script>` / `<link rel="stylesheet">` を出力
4. Rails が `public/assets/xxxx.js` 等を静的ファイルとして配信する想定 (Thruster は `--skip-thruster` で除外済みのため配信経路は未検討)

本番向けの Docker ビルド、`config.public_file_server.enabled` の要否、実際に `vite build` を通して manifest の形が想定通りか、などは一切確認していない。本番の話を再開するときに最初にやること。

## React Fast Refresh の preamble ハックについて

`@vitejs/plugin-react` は、JSX を含むファイルに Fast Refresh 用のコードを注入する際、「preamble が読み込まれているか」をチェックするコードも一緒に埋め込む。通常この preamble は、Vite が自分自身で `index.html` を解釈するとき (`transformIndexHtml`) に自動で差し込まれる。

このアプリでは entry HTML を **Rails が返している**ため、ブラウザは Vite の `index.html` 処理を一切経由しない (`/src/main.tsx` を直接リクエストするだけ)。そのため preamble が自動で入らず、何もしないと `@vitejs/plugin-react` のランタイムが `Uncaught Error: @vitejs/plugin-react can't detect preamble. Something is wrong.` を投げてアプリ全体が起動しない (真っ白画面になる)。

これを避けるため、`vite_client_tag` が `@vite/client` の読み込みに続けて次の preamble を手動で注入している。

```html
<script type="module">
  import RefreshRuntime from "http://localhost:5173/@react-refresh"
  RefreshRuntime.injectIntoGlobalHook(window)
  window.$RefreshReg$ = () => {}
  window.$RefreshSig$ = () => (type) => type
  window.__vite_plugin_react_preamble_installed__ = true
</script>
```

これは `vite_rails` gem が内部で提供している `vite_react_refresh_tag` ヘルパーと同一の定型コード。gem を使わない代わりに、この最小限の部分だけ手動で再現している。Vite / `@vitejs/plugin-react` のメジャーアップデートでこの内部契約 (`__vite_plugin_react_preamble_installed__` というグローバル変数名など) が変わった場合はここの追従が必要 — が、これは長年安定しているため、頻繁に壊れるものではない。

## ファイル一覧

| ファイル | 役割 |
|---|---|
| `app/controllers/fallback_controller.rb` | entry HTML を返すコントローラー。`layout false` で `application.html.erb` を経由しない |
| `app/views/fallback/index.html.erb` | entry HTML 本体。`<div id="root">` と Vite 関連タグを出力 |
| `app/helpers/application_helper.rb` | `vite_client_tag` / `vite_entry_tag` を定義。開発/本番の分岐、preamble 注入、manifest 解決を担う |
| `config/routes.rb` | `root` と SPA フォールバック (`get "*path"`) が `fallback#index` を指す |
| `frontend/vite.config.ts` | `server.port: 5173` を固定 (ヘルパー側でハードコードしているため)、`build.manifest: true`、entry を `src/main.tsx` に固定、`emptyOutDir: false` で Rails 管理下の `public/` 直下ファイルを消さないようにしている |
| `frontend/index.html` | ビルドやヘルパー経由のアクセスでは使われない。`pnpm dev` 中に `http://localhost:5173` に直接アクセスして単体プレビューしたい場合のためだけに残置 |
| `frontend/src/main.tsx` | entry module。`starter(AdminApp)` を呼ぶ |

## 起動手順 (開発環境)

```bash
# Rails (Docker コンテナ内)
docker compose exec web bash -c "rm -f tmp/pids/server.pid && bundle exec rails server -b 0.0.0.0"

# Vite dev server (ホスト側、frontend/ ディレクトリで)
pnpm dev
```

両方を起動した状態で `http://localhost:3000/` を開けば、Rails が返す HTML が Vite dev server 上のモジュールを読み込み、React アプリが立ち上がる。

## 既知の制約

- `:5173` はヘルパー側 (`VITE_DEV_SERVER_URL`) にハードコードしているため、Vite dev server がポート競合等で別ポードに逃げると壊れる。`vite.config.ts` 側で `strictPort: true` にしてあるのはこのため (競合時は自動フォールバックせずエラーで気付けるようにしている)
- 本番の manifest 経由配信は未検証 (前述)
- `frontend/index.html` はビルドに使われなくなったので、内容が entry HTML (`app/views/fallback/index.html.erb`) と乖離しても気付きにくい。手で更新する場合は両方揃える
