# データ取得・算出パイプライン仕様

## 1. 全体フロー

```text
物件JSON
  ↓
入力正規化
  - 価格、賃料、借入、金利、返済年数
  - 所在地、緯度経度
  - 土地面積、建物面積
  ↓
既存の収支分析
  - 表面利回り
  - NOI
  - DSCR
  - 月間CF
  - CCR
  ↓
公的データ取得
  - 不動産取引価格・成約価格
  - 地価公示・地価調査
  - 用途地域
  - 将来人口
  - 駅別乗降客数
  - ハザード
  ↓
外部データ抽出
  - 近傍地価ポイント
  - 近隣取引事例
  - 対象地に重なるリスクポリゴン
  - 最寄り駅/駅力
  ↓
土地値カバー率
  ↓
価格妥当性
  - 類似取引価格
  - 収益還元価格
  - 積算価格
  ↓
6軸スコアリングに入力
```

## 2. 入力JSON

例: `data/sample-property.json`

```json
{
  "name": "東村山市 戸建て サンプル",
  "propertyType": "戸建て賃貸",
  "address": "東京都東村山市",
  "lat": 35.7546,
  "lon": 139.4685,
  "price": 880,
  "str": "RC",
  "age": 0,
  "loanAmt": 880,
  "rent": 0,
  "br": 58,
  "ir": 2,
  "ly": 30,
  "landAreaSqm": 90,
  "buildingAreaSqm": 70,
  "routeValueYenPerSqm": 120000,
  "landCorrectionRate": 1.0,
  "capRatePct": 8.0
}
```

## 3. データ取得プログラム

実行ファイル:

```text
src/cli/fetchInvestmentData.js
```

中核ロジック:

```text
src/data/pipeline.js
```

APIクライアント:

```text
src/data/reinfoClient.js
```

計算ロジック:

```text
src/data/landValuation.js
```

## 4. APIキー

不動産情報ライブラリAPIを使う場合は、環境変数を設定する。

```bash
export MLIT_REINFO_API_KEY="発行されたAPIキー"
```

APIキーが無い場合や、`--offline` を指定した場合は、公的API取得をスキップし、手入力データだけで土地値・価格妥当性を計算する。

## 5. 取得する公的データ

### 5.1 取引事例

API: `XPT001`

用途:

- 類似取引価格
- 近隣単価
- 価格乖離率
- キャップレート補助

抽出する項目:

- 取引価格総額
- 面積
- 平米単価
- 構造
- 建築年
- 取引時点
- 取引種類
- 対象物件からの距離

### 5.2 地価公示・地価調査

API: `XPT002`

用途:

- 近傍土地単価
- 路線価が無い場合の代替土地評価
- 積算価格
- 土地値カバー率の参考値

抽出する項目:

- 当年価格 円/m2
- 用途区分
- 所在地
- 最寄駅
- 駅距離
- 用途地域
- 対象物件からの距離

### 5.3 用途地域

API: `XKT002`

用途:

- 用途地域
- 建ぺい率
- 容積率
- 再建築性
- 出口戦略

### 5.4 将来人口

API: `XKT013`

用途:

- 人口トレンド
- 賃貸需要
- 出口流動性

### 5.5 駅別乗降客数

API: `XKT015`

用途:

- 最寄り駅の駅力
- 賃貸需要
- 流動性

### 5.6 ハザード

API:

- `XKT016`: 災害危険区域
- `XKT020`: 大規模盛土造成地
- `XKT026`: 洪水浸水想定区域
- `XKT028`: 津波浸水想定
- `XKT029`: 土砂災害警戒区域

用途:

- 保険・修繕・融資リスク
- 出口リスク
- 総合ランクのゲート判定

## 6. 土地値カバー率の算出

### 6.1 路線価方式

入力:

- `routeValueYenPerSqm`
- `landAreaSqm`
- `landCorrectionRate`
- `price`

式:

```text
土地評価額 = routeValueYenPerSqm × landAreaSqm × landCorrectionRate
土地値カバー率 = 土地評価額 ÷ 物件価格 × 100
```

### 6.2 倍率方式

入力:

- `fixedAssetTaxValueYen`
- `valuationMultiplier`
- `price`

式:

```text
土地評価額 = fixedAssetTaxValueYen × valuationMultiplier
土地値カバー率 = 土地評価額 ÷ 物件価格 × 100
```

### 6.3 地価公示・地価調査による代替推定

入力:

- `officialLandPriceYenPerSqm`
- `landAreaSqm`
- `officialToInheritanceFactor`
- `landCorrectionRate`
- `price`

式:

```text
代替土地評価額 = officialLandPriceYenPerSqm × landAreaSqm × officialToInheritanceFactor × landCorrectionRate
土地値カバー率 = 代替土地評価額 ÷ 物件価格 × 100
```

注意:

- これは路線価そのものではない
- `officialToInheritanceFactor` の既定値は0.8
- 精密評価では、国税庁路線価、奥行補正、側方路線影響加算、不整形地補正、セットバック等が必要

## 7. 価格妥当性の算出

### 7.1 類似取引価格

```text
類似取引価格 = median(近隣取引事例の平米単価) × 対象面積
```

対象面積は、建物面積があれば建物面積、なければ土地面積を使う。

### 7.2 収益還元価格

```text
収益還元価格 = NOI ÷ キャップレート
```

`capRatePct` が入力されていればそれを使う。未入力時は構造・築年数・市場価格水準から簡易推定する。

### 7.3 積算価格

```text
積算価格 = 土地評価額 + 建物残存価値
```

建物残存価値:

```text
建物残存価値 = 建物面積 × 構造別再調達単価 × 残存価値率
残存価値率 = max((法定耐用年数 - 築年数) ÷ 法定耐用年数, 最低残存率)
```

### 7.4 妥当価格

```text
妥当価格 = 類似取引価格 × weight.comparable
        + 収益還元価格 × weight.income
        + 積算価格 × weight.cost
```

デフォルトウェイト:

| 物件タイプ | 類似取引 | 収益還元 | 積算 |
|---|---:|---:|---:|
| 区分マンション | 50% | 40% | 10% |
| 戸建て賃貸 | 35% | 35% | 30% |
| 一棟アパート/マンション | 30% | 50% | 20% |
| 土地値重視/古家 | 20% | 20% | 60% |
| 未指定 | 34% | 33% | 33% |

### 7.5 価格乖離率

```text
価格乖離率 = 売買価格 ÷ 妥当価格
```

判定目安:

| 価格乖離率 | 判定 |
|---:|---|
| 0.85以下 | 割安 |
| 0.85〜0.95 | やや割安 |
| 0.95〜1.05 | 妥当 |
| 1.05〜1.15 | やや割高 |
| 1.15〜1.30 | 割高 |
| 1.30超 | かなり割高 |

## 8. 出力JSON

主な出力:

```text
cashFlowAnalysis
  - 既存のDSCR、CF、CCR、6軸判定
external
  - APIから取得したGeoJSON
  - meta.errors にAPIエラー

derived
  - nearestOfficialLandPrice
  - transactionComparables
  - nearestStation
  - risks
  - landValue
  - fairValue
  - capRatePct

dataQuality
  - score
  - missing
  - warnings
  - sourceErrors
```

## 9. 注意点

- APIキーはGitHubにコミットしない
- 不動産情報ライブラリAPIはブラウザ直叩きせずサーバー側から呼ぶ
- タイルAPIは、ズームやタイル半径を大きくすると取得量が増える
- 路線価はMVPでは自動取得ではなく、手入力・CSV・商用API差し替え前提
- 価格妥当性は公的データだけでは不足するため、賃貸成約DBと修繕履歴を必ず追加する
