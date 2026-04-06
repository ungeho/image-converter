# Image Converter

React + Vite で作成した、ブラウザ完結型の画像変換アプリです。  
ドラッグ＆ドロップ、ファイル選択、クリップボード貼り付けから画像を取り込み、PNG / JPEG / WebP / AVIF へ変換できます。

![Image Converter overview](./docs/readme/overview.png)

## できること

- 複数画像の一括読み込みと一括変換
- PNG / JPEG / WebP / AVIF への変換
- 変換前 / 変換後プレビュー
- JPEG / WebP / AVIF の品質調整
- リサイズ指定
- 縦横比の維持 / 解除
- 圧縮前後のサイズ比較
- 個別ダウンロード
- 個別ファイルの一括ダウンロード
- ZIP ひとまとめでの一括保存
- 変換後画像のクリップボード再コピー
- レスポンシブ対応 UI

## デモ

変換フローのイメージです。

![Image Converter workflow](./docs/readme/workflow.gif)

## 画面イメージ

### 読み込み直後

![Loaded state](./docs/readme/step-02-loaded.png)

### 設定変更中

![Settings state](./docs/readme/step-03-settings.png)

### 出力アクション

![Actions state](./docs/readme/step-04-actions.png)

## 対応形式

入力:

- ブラウザが読み込める画像ファイル
- クリップボード上の画像データ

出力:

- PNG
- JPEG
- WebP
- AVIF

## 主な仕様

- 画像変換はブラウザの `canvas` を使って実行します。
- サーバーアップロードなしで動作します。
- PNG は可逆圧縮のため、品質スライダーは実質無効です。
- JPEG は透過を保持できないため、透明部分は白背景で出力します。
- AVIF はブラウザが出力エンコードに対応している場合のみ選択肢に表示されます。
- クリップボードへの画像書き込みは、対応ブラウザでのみ動作します。
- ZIP 保存では、変換済み画像を 1 つの `.zip` ファイルにまとめて保存します。
- リサイズ時は、指定サイズと縦横比設定に応じて出力解像度が変化します。

## 使い方

### 画像を変換する

1. 画像をドラッグ＆ドロップするか、`画像を選択` から読み込みます。
2. `出力形式` を選びます。
3. 必要に応じて品質やリサイズ設定を調整します。
4. 一覧から確認したい画像を選びます。
5. 変換後、個別ダウンロード・一括ダウンロード・ZIP 保存のいずれかで保存します。

### クリップボード画像を使う

1. スクリーンショットなどをクリップボードにコピーします。
2. アプリ画面をアクティブにします。
3. `Ctrl + V` で貼り付けます。
4. 読み込まれた画像を通常どおり変換します。

### 変換後画像をクリップボードに戻す

1. 一覧から対象画像を選びます。
2. `変換後をクリップボードにコピー` を押します。
3. 対応アプリへ貼り付けます。

## セットアップ

```bash
npm install
```

## 開発サーバー

```bash
npm run dev
```

## 本番ビルド

```bash
npm run build
```

## README 用アセットの再生成

README に使用しているスクリーンショットと GIF は、先にローカルサーバーを起動したうえで次のスクリプトから再生成できます。

```bash
npm run dev -- --host 127.0.0.1 --port 4173
```

```bash
node ./scripts/capture-readme-assets.mjs
```

別ポートを使う場合は `APP_URL` 環境変数で変更できます。

生成先:

- `docs/readme/overview.png`
- `docs/readme/step-01-empty.png`
- `docs/readme/step-02-loaded.png`
- `docs/readme/step-03-settings.png`
- `docs/readme/step-04-actions.png`
- `docs/readme/workflow.gif`

サンプル入力画像:

- `docs/sample-inputs/sample-landscape.svg`
- `docs/sample-inputs/sample-card.svg`

## 技術スタック

- React 18
- Vite 5
- JSZip
- Playwright Core

## ディレクトリ構成

```text
image-converter/
├─ docs/
│  ├─ readme/
│  └─ sample-inputs/
├─ scripts/
│  └─ capture-readme-assets.mjs
├─ src/
│  ├─ App.jsx
│  ├─ main.jsx
│  └─ styles.css
├─ index.html
├─ package.json
└─ vite.config.js
```
