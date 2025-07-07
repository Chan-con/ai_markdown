# AI Markdown Editor

OpenAI APIを活用したマークダウンエディタ＆管理アプリです。

## 機能

- **マークダウンエディタ**: リアルタイムプレビュー付きのマークダウンエディタ
- **AI文章生成**: OpenAI APIを使用して、セクションごとに文章を生成
- **AI画像生成**: DALL-E 3を使用して画像を生成し、記事に挿入
- **ファイル管理**: マークダウンファイルの作成、編集、保存
- **設定管理**: OpenAI APIキーの安全な保存

## インストール

```bash
# 依存関係のインストール
npm install

# アプリの起動
npm start

# 開発モードでの起動
npm run dev
```

## ビルド

```bash
# Windows用インストーラーの作成
npm run package:win

# Mac用アプリの作成
npm run package:mac

# Linux用アプリの作成
npm run package:linux
```

## 使い方

1. アプリを起動
2. 設定からOpenAI APIキーを入力
3. マークダウンを入力してリアルタイムプレビューを確認
4. AI文章生成やAI画像生成を活用して記事を作成
5. ファイルを保存して管理

## 必要なもの

- Node.js 16以上
- OpenAI API キー

## ライセンス

MIT License