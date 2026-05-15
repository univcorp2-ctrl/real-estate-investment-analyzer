'use strict';

const REINFO_BASE_URL = 'https://www.reinfolib.mlit.go.jp/ex-api/external';

const PUBLIC_SOURCES = {
  reinfo: {
    name: '国土交通省 不動産情報ライブラリAPI',
    baseUrl: REINFO_BASE_URL,
    apiKeyHeader: 'Ocp-Apim-Subscription-Key',
    officialDocs: 'https://www.reinfolib.mlit.go.jp/help/apiManual/',
    applicationUrl: 'https://www.reinfolib.mlit.go.jp/api/request/',
    endpoints: {
      transactions: {
        id: 'XPT001',
        name: '不動産価格（取引価格・成約価格）情報のポイント API',
        use: '価格妥当性の類似取引比較、キャップレート推定',
        requiredParams: ['response_format', 'z', 'x', 'y', 'from', 'to'],
        optionalParams: ['priceClassification', 'landTypeCode']
      },
      landPricePoints: {
        id: 'XPT002',
        name: '地価公示・地価調査のポイント API',
        use: '土地単価、土地値カバー率の代替推定、価格妥当性',
        requiredParams: ['response_format', 'z', 'x', 'y', 'year'],
        optionalParams: ['priceClassification', 'useCategoryCode']
      },
      zoning: {
        id: 'XKT002',
        name: '都市計画決定GISデータ（用途地域）API',
        use: '用途地域、建ぺい率、容積率、出口戦略、再建築チェック',
        requiredParams: ['response_format', 'z', 'x', 'y']
      },
      futurePopulation250m: {
        id: 'XKT013',
        name: '国土数値情報（将来推計人口250mメッシュ）API',
        use: '人口トレンド、立地評価、出口流動性'
      },
      stationRidership: {
        id: 'XKT015',
        name: '国土数値情報（駅別乗降客数）API',
        use: '駅力、賃貸需要、流動性評価'
      },
      dangerousArea: {
        id: 'XKT016',
        name: '国土数値情報（災害危険区域）API',
        use: 'リスク耐性、融資・出口減点'
      },
      largeEmbankment: {
        id: 'XKT020',
        name: '国土数値情報（大規模盛土造成地マップ）API',
        use: '地盤リスク、修繕・出口リスク'
      },
      landslide: {
        id: 'XKT029',
        name: '国土数値情報（土砂災害警戒区域）API',
        use: '土砂災害リスク、保険・融資・出口評価'
      },
      flood: {
        id: 'XKT026',
        name: '国土数値情報（洪水浸水想定区域・想定最大規模）API',
        use: '洪水リスク、保険・融資・出口評価'
      },
      tsunami: {
        id: 'XKT028',
        name: '国土数値情報（津波浸水想定）API',
        use: '津波リスク、保険・融資・出口評価'
      },
      did: {
        id: 'XKT031',
        name: '国土数値情報（人口集中地区）API',
        use: '市街地性、流動性、出口戦略'
      }
    }
  },
  nta: {
    name: '国税庁 財産評価基準書 路線価図・評価倍率表',
    url: 'https://www.rosenka.nta.go.jp/',
    use: '相続税路線価、評価倍率、土地値カバー率',
    machineReadableApi: false,
    implementationNote: '公式の機械取得APIは確認できないため、MVPでは手入力・CSV取込・商用APIアダプタで対応する。'
  },
  digitalAgencyAbr: {
    name: 'デジタル庁 アドレス・ベース・レジストリ / ABRジオコーダー',
    url: 'https://lp.geocoder.address-br.digital.go.jp/',
    use: '住所正規化、緯度経度、町字ID。サーバー側バッチ処理向け。'
  },
  ksj: {
    name: '国土数値情報ダウンロードサイト',
    url: 'https://nlftp.mlit.go.jp/ksj/',
    use: 'APIで足りないGISデータを一括DLし、自社DB化する。'
  }
};

module.exports = {
  REINFO_BASE_URL,
  PUBLIC_SOURCES
};
