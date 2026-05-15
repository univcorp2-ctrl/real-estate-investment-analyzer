# テスト・検査レポート

## 検査日

2026-05-15

## 検査対象

- 収支分析ロジック
- 6軸スコアリング
- ランク判定ゲート
- 土地値カバー率計算
- 価格妥当性計算
- 不動産情報ライブラリAPIクライアント
- 公的データ統合パイプライン
- CLI入力からのオフライン計算

## CI確認

GitHub Actions の直近CIを確認したところ、以下の状態だった。

- Workflow: CI
- Run: `Add tests for data pipeline #17`
- Status: Success
- Job: test
- Job result: succeeded
- Duration: 6s

警告として、GitHub Actions 側で Node.js 20 Actions ランタイムの非推奨警告が出ている。これはテスト失敗ではないが、将来的には `actions/checkout` と `actions/setup-node` のメジャーバージョン更新を検討する。

## 追加した検査

`test/pipelineIntegration.test.js` を追加した。

### 1. オフライン計算テスト

APIキーがない状態でも、手入力データだけで以下が計算できることを確認する。

- `br=58` を 5.8万円/月として解釈
- 表面利回りが計算される
- 路線価方式で土地評価額を計算
- 土地値カバー率を計算
- 妥当価格を計算
- 外部APIスキップ警告が出る

期待値例:

```text
物件価格: 880万円
土地面積: 90㎡
路線価: 120,000円/㎡
土地評価額: 10,800,000円
土地値カバー率: 122.7%
```

### 2. モックAPI統合テスト

不動産情報ライブラリAPIを実際に叩かず、モックGeoJSONで以下の統合処理を検査する。

- 地価公示・地価調査ポイントの抽出
- 近隣取引事例の抽出
- 取引事例の中央値単価計算
- 最寄り駅データ抽出
- 洪水ポリゴンとの重なり判定
- 外部データを含めた妥当価格計算
- データ品質スコアの算出

## テストコマンド

```bash
npm install
npm test
```

オフラインCLI確認:

```bash
node src/cli/fetchInvestmentData.js --input data/sample-property.json --offline
```

APIキーありの確認:

```bash
export MLIT_REINFO_API_KEY="発行されたAPIキー"
node src/cli/fetchInvestmentData.js \
  --input data/sample-property.json \
  --out data/output.json \
  --from 20241 \
  --to 20254 \
  --year 2025 \
  --tileRadius 1
```

## 検査結果まとめ

- 既存CIは成功している
- 主要ロジックの単体テストは用意済み
- データ取得系の単体テストは用意済み
- 今回、オフライン計算とモックAPI統合テストを追加した
- 実API接続テストは、APIキーが必要なためCIでは実行しない設計にしている

## 未検査・今後必要な検査

1. 実APIキーを使った不動産情報ライブラリAPIの疎通確認
2. 実物件住所での緯度経度精度確認
3. 国税庁路線価のCSV/手入力値との照合
4. 近隣取引事例のAPIレスポンス実データに対するプロパティ名確認
5. ハザードAPIの実ポリゴンでの点内判定確認
6. ブラウザUIでの手動操作テスト

## 判定

現時点では、ローカル計算・単体テスト・モック統合テストで検査可能な範囲は正常に動く構成になっている。

実API連携まで含めて「本番利用可能」と判断するには、APIキーを設定した実データ疎通テストが必要。
