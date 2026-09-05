FROM node:22.23.1-bookworm-slim

WORKDIR /app
# リポジトリが使用するnpmとインストーラーのバージョンを合わせる。
RUN npm install --global npm@11.18.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
# Client生成だけを行う。DBへの接続・migration・seedは実行しない。
RUN DATABASE_URL=postgresql://unused:unused@localhost:5432/unused \
    DIRECT_URL=postgresql://unused:unused@localhost:5432/unused \
    npx prisma generate

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
