# Real Estate Investment Analyzer

公開URLで確認できる表示項目・URLパラメータ・Chrome Web Store の説明文をもとに、収益物件の投資判断ロジックをブラックボックス推定して作ったプロトタイプです。

> 注意: 元サービスのソースコードや非公開ロジックをコピーしたものではありません。公開画面から見える入力・出力・説明文をもとに、要件定義と検証に使えるよう再構成した互換的な分析モデルです。

## できること

- URLパラメータから物件条件を取り込み
- 表面利回り、推定NOI、年間返済額、DSCR、月間CF、CCRを計算
- 6軸評価で 30 点満点のスコアを算出
- S / A / B / C / D / E の総合ランクを表示
- 危険条件を red flag として検出し、総点が高くても上位ランクを抑制
- クエリ例: `?price=880&str=RC&age=0&loanAmt=880&rent=0&ir=2&ly=30&br=58&name=東村山市%20戸建て`

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
| `opexRatio` | 運営費率 | % | デフォルト25% |
| `vacancyRatio` | 空室損率 | % | デフォルト5% |
| `purchaseCostRatio` | 諸費用率 | % | デフォルト7% |
| `landCoverRate` | 土地値カバー率 | % | 出口戦略の加点/減点に使用 |
| `stationWalk` | 駅徒歩 | 分 | 立地評価に使用 |
| `populationTrend` | 人口トレンド | growing / flat / declining | 立地評価に使用 |

## 起動方法

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
- [`src/analysisLogic.js`](src/analysisLogic.js): 計算・判定ロジック
- [`test/analysisLogic.test.js`](test/analysisLogic.test.js): 主要ロジックのテスト
