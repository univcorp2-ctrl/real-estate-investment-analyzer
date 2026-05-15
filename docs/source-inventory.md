# 情報ソース整理表

## 1. 方針

不動産投資判断の入力データは、次の3層に分けて取得する。

1. 物件固有データ: 価格、賃料、築年数、構造、面積、融資条件
2. 公的オープンデータ: 取引価格、地価、公示地価、用途地域、人口、駅、ハザード
3. 民間・自社データ: 成約賃料、募集賃料、修繕履歴、管理実績、融資実績

今回実装したプログラムは、2の公的オープンデータ取得と、1の手入力データからの計算を担当する。

## 2. 実装済みの取得ソース

### 2.1 国土交通省 不動産情報ライブラリAPI

公式URL:

- API操作説明: https://www.reinfolib.mlit.go.jp/help/apiManual/
- API利用申請: https://www.reinfolib.mlit.go.jp/api/request/

利用方法:

- API利用申請が必要
- 発行されたAPIキーを `Ocp-Apim-Subscription-Key` ヘッダーに付与
- CORS対策のため、ブラウザ直叩きではなくサーバー側から呼ぶ
- 連続大量リクエストを避ける

環境変数:

```bash
export MLIT_REINFO_API_KEY="発行されたAPIキー"
```

### 2.2 実装対象API

| 用途 | API ID | API名 | 取得目的 | 実装ファイル |
|---|---|---|---|---|
| 近隣取引事例 | XPT001 | 不動産価格（取引価格・成約価格）情報のポイントAPI | 類似取引価格、坪単価、価格妥当性 | `src/data/pipeline.js` |
| 公示地価・地価調査 | XPT002 | 地価公示・地価調査のポイントAPI | 土地単価、土地値推定、積算価格 | `src/data/pipeline.js` |
| 用途地域 | XKT002 | 都市計画決定GISデータ（用途地域）API | 再建築、容積率、出口戦略 | `src/data/pipeline.js` |
| 将来人口 | XKT013 | 国土数値情報（将来推計人口250mメッシュ）API | 立地、賃貸需要、出口 | `src/data/pipeline.js` |
| 駅別乗降客数 | XKT015 | 国土数値情報（駅別乗降客数）API | 駅力、流動性 | `src/data/pipeline.js` |
| 災害危険区域 | XKT016 | 国土数値情報（災害危険区域）API | リスク耐性、融資・出口 | `src/data/pipeline.js` |
| 大規模盛土 | XKT020 | 国土数値情報（大規模盛土造成地マップ）API | 地盤リスク | `src/data/pipeline.js` |
| 洪水 | XKT026 | 洪水浸水想定区域API | 水害リスク | `src/data/pipeline.js` |
| 津波 | XKT028 | 津波浸水想定API | 水害リスク | `src/data/pipeline.js` |
| 土砂災害 | XKT029 | 土砂災害警戒区域API | 土砂災害リスク | `src/data/pipeline.js` |
| 人口集中地区 | XKT031 | 人口集中地区API | 市街地性、出口流動性 | `src/data/pipeline.js` |

## 3. 路線価・評価倍率

### 3.1 公式ソース

国税庁 財産評価基準書:

- https://www.rosenka.nta.go.jp/

関連タックスアンサー:

- 路線価方式: https://www.nta.go.jp/taxes/shiraberu/taxanswer/hyoka/4604.htm
- 倍率方式: https://www.nta.go.jp/taxes/shiraberu/taxanswer/hyoka/4606.htm

### 3.2 実装方針

国税庁の路線価図・評価倍率表について、公式の汎用機械取得APIは確認できていない。

そのため、MVPでは次の3パターンで対応する。

1. `routeValueYenPerSqm` を手入力する
2. 路線価CSVまたは社内DBを作り、住所/緯度経度から引く
3. 商用の路線価API・地価APIのアダプタを追加する

実装済みの計算式:

```text
路線価方式の土地評価額 = routeValueYenPerSqm × landAreaSqm × landCorrectionRate
土地値カバー率 = 土地評価額 ÷ 売買価格 × 100
```

倍率地域の場合:

```text
倍率方式の土地評価額 = fixedAssetTaxValueYen × valuationMultiplier
土地値カバー率 = 土地評価額 ÷ 売買価格 × 100
```

代替推定:

```text
代替土地評価額 = 地価公示/地価調査の近傍単価 × landAreaSqm × officialToInheritanceFactor × landCorrectionRate
```

`officialToInheritanceFactor` の既定値は0.8。ただしこれは路線価そのものではなく、土地値の参考値として扱う。

## 4. 住所・緯度経度

### 4.1 推奨ソース

デジタル庁 ABRジオコーダー:

- https://lp.geocoder.address-br.digital.go.jp/

用途:

- 住所正規化
- 町字ID付与
- 緯度経度付与
- 地番・住居表示の揺れ吸収

### 4.2 実装方針

今回のMVPでは、API取得の安定性を優先して `lat` / `lon` を物件JSONに必須級入力としている。

住所から緯度経度を自動付与する場合は、サーバー側バッチでABRジオコーダーを導入する。

## 5. 国土数値情報ダウンロードサイト

公式URL:

- https://nlftp.mlit.go.jp/ksj/

用途:

- APIで取得しきれないGISデータの一括取得
- 自社PostGISなどへのロード
- 大量分析、エリア別ランキング、バッチ査定

使う候補:

- 行政区域
- 駅別乗降客数
- 地価公示
- 都道府県地価調査
- 用途地域
- 洪水・土砂災害などのハザード
- 将来推計人口メッシュ

## 6. 民間・自社DBが必要なデータ

公的データだけでは投資判断には不足する。

| データ | 理由 | 取得候補 |
|---|---|---|
| 成約賃料 | NOIの精度に直結 | 管理会社、自社管理DB、賃貸ポータル契約 |
| 募集賃料 | 空室時賃料・家賃下落耐性 | ポータル契約、自社クローラー、管理会社 |
| 修繕履歴 | 築古・出口・CFに直結 | 売主資料、管理会社、現地調査 |
| 固定資産税・都市計画税 | NOIに直結 | 納税通知書、売主資料 |
| 管理費・保険料 | NOIに直結 | 実績資料、見積 |
| 接道・再建築可否 | 出口・融資に直結 | 役所調査、重説、登記・公図 |
| 融資承認条件 | DSCR/CFに直結 | 金融機関、自社融資実績 |

## 7. 実行方法

```bash
export MLIT_REINFO_API_KEY="発行されたAPIキー"
npm run fetch:data
```

または:

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

APIキーなしで計算だけ確認する場合:

```bash
node src/cli/fetchInvestmentData.js --input data/sample-property.json --offline
```
