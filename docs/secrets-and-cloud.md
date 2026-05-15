# APIキー管理・クラウド運用設計

## 1. 結論

APIキーをGitHubリポジトリに直接入れてはいけない。

入れてはいけない例:

- ソースコードに直書き
- `README.md` に貼る
- `.env` をコミットする
- GitHub Actions YAMLに直書き
- フロントエンドJavaScriptに埋め込む
- Issue、PR、コミットメッセージ、ログに貼る

GitHubに置いてよいもの:

- `.env.example` のようなダミー値テンプレート
- Secret名だけ
- Cloud Secret Managerの参照名だけ
- GitHub ActionsのVariablesに入れる非機密の設定値

## 2. 推奨構成

```text
ブラウザ
  ↓ HTTPS
Cloud Run: real-estate-investment-analyzer
  ↓ 環境変数として参照
Google Cloud Secret Manager: MLIT_REINFO_API_KEY
  ↓ APIキー付きでサーバー側から呼び出し
国交省 不動産情報ライブラリAPI
```

ポイント:

- APIキーはブラウザに渡さない
- APIキーはGitHubにコミットしない
- Cloud Runの実行サービスアカウントに、必要なSecretだけ読める権限を付ける
- GitHub ActionsからGoogle Cloudへの認証は、サービスアカウントJSONキーではなくWorkload Identity Federationを使う

## 3. 環境別の管理方法

| 環境 | APIキーの置き場所 | 用途 |
|---|---|---|
| ローカル開発 | `.env` またはシェル環境変数 | 開発者PCのみ。`.env`はgitignore対象 |
| GitHub Actions | GitHub Secrets / Variables | CI/CDの設定値。長期鍵JSONは避ける |
| 本番Cloud Run | Google Cloud Secret Manager | ランタイムでAPIキーを参照 |

## 4. GitHub側の設定

### 4.1 入れるもの

Repository Variables:

```text
GCP_PROJECT_ID
GCP_REGION
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_SERVICE_ACCOUNT
```

これらはデプロイ先や認証先を示す設定で、APIキーそのものではない。

Repository Secrets:

```text
原則なし
```

どうしてもWorkload Identity Federationが使えない場合だけ、サービスアカウントJSONをSecretに入れる選択肢はある。ただし推奨しない。

### 4.2 有効化したいGitHubセキュリティ機能

- Secret scanning
- Push protection
- Dependabot alerts
- Branch protection
- Required status checks

## 5. Google Cloud側の設定

### 5.1 Secret ManagerにAPIキーを作成

```bash
gcloud secrets create mlit-reinfo-api-key \
  --replication-policy="automatic"

printf "%s" "実際のAPIキー" | gcloud secrets versions add mlit-reinfo-api-key --data-file=-
```

### 5.2 Cloud Run実行サービスアカウントにSecret参照権限を付与

```bash
gcloud secrets add-iam-policy-binding mlit-reinfo-api-key \
  --member="serviceAccount:CLOUD_RUN_RUNTIME_SA@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 5.3 Cloud RunにSecretを環境変数として注入

GitHub Actionsのデプロイでは以下を使う。

```bash
--set-secrets MLIT_REINFO_API_KEY=mlit-reinfo-api-key:latest
```

これにより、Node.js側では通常の環境変数として読める。

```js
process.env.MLIT_REINFO_API_KEY
```

## 6. GitHub ActionsからCloud Runへデプロイ

追加済みワークフロー:

```text
.github/workflows/deploy-cloud-run.yml
```

ワークフローは以下を行う。

1. GitHub ActionsからWorkload Identity FederationでGoogle Cloudへ認証
2. Dockerイメージをビルド
3. Artifact Registryへpush
4. Cloud Runへdeploy
5. `MLIT_REINFO_API_KEY` をSecret Managerから環境変数として参照

## 7. Cloud Runサーバー

追加済みファイル:

```text
src/server.js
Dockerfile
```

Cloud Run上では以下のAPIを提供する。

```text
GET  /healthz
POST /api/analyze
```

`POST /api/analyze` に物件JSONを投げると、サーバー側で以下を実行する。

1. 収支分析
2. 国交省APIから外部データ取得
3. 土地値カバー率計算
4. 価格妥当性計算
5. 6軸スコアリング

## 8. ローカル開発

`.env.example` をコピーして使う。

```bash
cp .env.example .env
```

ただし、このリポジトリは外部ライブラリなしで環境変数を読む実装にしているため、実行時は以下のようにシェルに読み込む。

```bash
export MLIT_REINFO_API_KEY="実際のAPIキー"
npm start
```

## 9. APIキーを漏らした場合

すぐにやること:

1. そのAPIキーを無効化またはローテーション
2. Secret Managerに新バージョンを登録
3. Cloud Runを再デプロイまたは再起動
4. GitHubに混入した場合は、履歴から削除するだけでなくキー自体を必ず無効化
5. GitHub Secret scanningのアラートを確認

履歴から削除しても、既に外部に取得されている可能性があるため、キーのローテーションが必須。

## 10. 今後追加するとよいもの

- APIごとのレート制限
- リクエストキャッシュ
- 取得済み公的データのDB保存
- Cloud Schedulerによるバッチ更新
- BigQueryまたはPostgreSQL/PostGISへの蓄積
- 管理画面からSecret名・データ取得範囲を管理
- 監査ログとアクセスログ
