FROM ruby:4.0-slim

# ビルドに必要なパッケージ
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libyaml-dev \
    curl \
    git \
    node-gyp \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 以下がないとdocker compose downのたびに bundle installしないといけない
# ※ installしたgemはコンテナの書き込み可能レイヤー（コンテナ固有の差分領域）に置かれているだけのため
# インストール済みのgemを永続化する別の方法として、ホスト側のディレクトリをコンテナ内のgemのインストール先にマウントする方法もある
# しかし、イメージ単体では完結しなくなる。イメージをどこか別の環境（本番サーバー、CI、他の人のPC）に持っていっても、対応するvolumeがなければgemが入っていない状態になる。つまり「イメージをビルドすれば誰でも同じ環境が再現できる」という自己完結性が失われる
COPY Gemfile Gemfile.lock ./
RUN bundle install
