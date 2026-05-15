# Real Estate Investment Analyzer

公開URLで確認できる表示項目・URLパラメータ・Chrome Web Store の説明文をもとに、収益物件の投資判断ロジックをブラックボックス推定して作ったプロトタイプです。

> 注意: 元サービスのソースコードや非公開ロジックをコピーしたものではありません。公開画面から見える入力・出力・説明文をもとに、要件定義と検証に使えるよう再構成した互換的な分析モデルです。

## できること

- URLパラメータから物件条件を取り込み
- 表面利回り、推定NOI、年間返済額、DSCR、月間CF、CCRを計算
- 6軸評価で 30 点満点のスコアを算出
- S / A / B / C / D / E の総合ランクを表示
- 危険条件を red flag として検出し、総点が高くても上位ランクを抑制
- 国交省 不動産情報ライブラリAPIから、取引事例・地価・用途地域・人口・駅・ハザードを取得するCLIを追加
- 路線価/倍率/地価公示から土地値カバー率を計算
- 類似取引・収益還元・積算の3方式で価格妥当性を推定
- Cloud Run上で動くサーバーAPIを追加
- GitHub ActionsからCloud Runへデプロイするワークフローを追加

## APIキー管理

APIキーはGitHubに直接入れないでください。

- ローカル: `.env` またはシェル環境変数。`.env`はgitignore対象
- GitHub Actions: GitHub Secrets / Variables。ただしサービスアカウントJSONキーは避け、Workload Identity Federationを推奨
- 本番Cloud Run: Google Cloud Secret Manager

詳細:

- [`docs/secrets-and-cloud.md`](docs/secrets-and-cloud.md): APIキー管理・クラウド運用設計
- [`docs/cloud-run-setup.md`](docs/cloud-run-setup.md): Google Cloud Run セットアップ手順

## 推定した主要パラメータ

| パラメータ | 意味 | 単位 | 備考 |
|---|---:|---:|---|
| `price` | 物件価格 | 万円 | 880 = 880万円 |
| `str` | 構造 | 文字列 | RC / SRC / S / 木造 など |
| `age` | 築年数 | 年 | 法定耐用年数・出口評価に使用 |
| `loanAmt` | 借入額 | 万円 | DSCR / CF / LTV に使用 |
| `rent` | 月額賃料 | 万円 | 0 の場合は `br` を補助賃料として読む |
| `br` | 推定月額賃料 | 千円 | `58` は 5.8万円/月として扱う推定 |
| `ir` | 金利 | %/年 | 2 = 年2% |
| `ly` | 返済期間 | 年 | 30 = 30年 |
| `landAreaSqm` | 土地面積 | m2 | 土地値カバー率に使用 |
| `buildingAreaSqm` | 建物面積 | m2 | 積算価格・類似取引価格に使用 |
| `lat` / `lon` | 緯度経度 | 度 | 公的API取得のキー |
| `routeValueYenPerSqm` | 路線価 | 円/m2 | 国税庁路線価、CSV、商用API、手入力 |
| `fixedAssetTaxValueYen` | 固定資産税評価額 | 円 | 倍率方式に使用 |
| `valuationMultiplier` | 評価倍率 | 倍 | 倍率方式に使用 |
| `landCoverRate` | 土地値カバー率 | % | 現状UIでは手入力値。CLI/APIでは自動計算も可能 |

## Cloud Runで動かす

```bash
npm install
npm start
```

Cloud Run用:

```bash
export MLIT_REINFO_API_KEY="発行されたAPIキー"
PORT=8080 npm start
```

API:

```text
GET  /healthz
POST /api/analyze
```

## データ取得CLI

### APIキーあり

```bash
export MLIT_REINFO_API_KEY="発行されたAPIキー"
npm install
npm run fetch:data
```

### 任意ファイルで実行

```bash
node src/cli/fetchInvestmentData.js \
  --input data/sample-property.json \
  --out data/output.json \
  --from 20241 \
  --to 20254 \
  --year 2025 \
  --tileRadius 1 \
  --landTypeCode 01,02,07
```

### APIキーなし・手入力値だけで計算

```bash
node src/cli/fetchInvestmentData.js --input data/sample-property.json --offline
```

## 重要: インプット元データについて

現状のWeb UIは外部APIから自動取得していません。URLパラメータ、画面フォームの手入力、デフォルト値を元に判定しています。

データ取得CLI/APIでは、国交省 不動産情報ライブラリAPIから次を取得できます。

- 不動産価格（取引価格・成約価格）情報
- 地価公示・地価調査
- 用途地域
- 将来推計人口
- 駅別乗降客数
- 洪水・津波・土砂災害・災害危険区域・大規模盛土などのハザード
- 人口集中地区

路線価は国税庁の公式APIが確認できないため、MVPでは `routeValueYenPerSqm` の手入力、CSV、自社DB、商用APIアダプタで対応します。

## Web UI起動方法

静的HTMLなので、そのまま `index.html` をブラウザで開けます。

Node.js がある場合:

```bash
npm install
npm test
npm run dev
```

その後、ブラウザで `http://localhost:4173` を開きます。

## ロジック資料

- [`docs/requirements.md`](docs/requirements.md): リバースエンジニアリング結果と要件定義
- [`docs/input-data-sources.md`](docs/input-data-sources.md): インプット元データ・価格妥当性・土地値カバー率の算出仕様
- [`docs/source-inventory.md`](docs/source-inventory.md): 情報ソース整理表
- [`docs/data-pipeline.md`](docs/data-pipeline.md): データ取得・算出パイプライン仕様
- [`docs/secrets-and-cloud.md`](docs/secrets-and-cloud.md): APIキー管理・クラウド運用設計
- [`docs/cloud-run-setup.md`](docs/cloud-run-setup.md): Google Cloud Run セットアップ手順
- [`src/analysisLogic.js`](src/analysisLogic.js): 計算・判定ロジック
- [`src/data/pipeline.js`](src/data/pipeline.js): 公的データ取得と統合処理
- [`src/data/landValuation.js`](src/data/landValuation.js): 土地値カバー率・価格妥当性計算
- [`src/server.js`](src/server.js): Cloud Run互換のHTTPサーバー
- [`test/analysisLogic.test.js`](test/analysisLogic.test.js): 主要ロジックのテスト
