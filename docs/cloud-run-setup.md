# Google Cloud Run セットアップ手順

## 1. 前提

必要なもの:

- Google Cloudプロジェクト
- 課金の有効化
- `gcloud` CLI
- GitHubリポジトリの管理権限
- 国交省 不動産情報ライブラリAPIキー

## 2. Google Cloud APIを有効化

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com
```

## 3. Secret ManagerにAPIキーを登録

```bash
gcloud secrets create mlit-reinfo-api-key \
  --replication-policy="automatic"

printf "%s" "実際のAPIキー" | gcloud secrets versions add mlit-reinfo-api-key --data-file=-
```

## 4. サービスアカウントを作成

### 4.1 Cloud Run実行用

```bash
gcloud iam service-accounts create re-analyzer-runtime \
  --display-name="Real estate analyzer runtime"
```

Secret参照権限:

```bash
gcloud secrets add-iam-policy-binding mlit-reinfo-api-key \
  --member="serviceAccount:re-analyzer-runtime@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 4.2 GitHub Actionsデプロイ用

```bash
gcloud iam service-accounts create re-analyzer-deployer \
  --display-name="Real estate analyzer GitHub deployer"
```

必要ロール例:

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:re-analyzer-deployer@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:re-analyzer-deployer@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud iam service-accounts add-iam-policy-binding \
  re-analyzer-runtime@PROJECT_ID.iam.gserviceaccount.com \
  --member="serviceAccount:re-analyzer-deployer@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## 5. Workload Identity Federation

サービスアカウントJSONキーをGitHub Secretsに入れるのではなく、GitHub ActionsのOIDCトークンをGoogle Cloudで信頼する。

作成後、GitHub Repository Variablesに以下を登録する。

```text
GCP_PROJECT_ID=PROJECT_ID
GCP_REGION=asia-northeast1
GCP_WORKLOAD_IDENTITY_PROVIDER=projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID
GCP_SERVICE_ACCOUNT=re-analyzer-deployer@PROJECT_ID.iam.gserviceaccount.com
```

## 6. GitHub Actionsでデプロイ

追加済みワークフロー:

```text
.github/workflows/deploy-cloud-run.yml
```

GitHubのActions画面から `Deploy to Cloud Run` を手動実行するか、`main` にpushすると実行される。

## 7. 手動デプロイする場合

```bash
gcloud artifacts repositories create real-estate-investment-analyzer \
  --repository-format docker \
  --location asia-northeast1

docker build -t asia-northeast1-docker.pkg.dev/PROJECT_ID/real-estate-investment-analyzer/real-estate-investment-analyzer:manual .

docker push asia-northeast1-docker.pkg.dev/PROJECT_ID/real-estate-investment-analyzer/real-estate-investment-analyzer:manual

gcloud run deploy real-estate-investment-analyzer \
  --image asia-northeast1-docker.pkg.dev/PROJECT_ID/real-estate-investment-analyzer/real-estate-investment-analyzer:manual \
  --region asia-northeast1 \
  --platform managed \
  --service-account re-analyzer-runtime@PROJECT_ID.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-secrets MLIT_REINFO_API_KEY=mlit-reinfo-api-key:latest
```

## 8. 動作確認

```bash
curl https://YOUR_CLOUD_RUN_URL/healthz
```

分析API:

```bash
curl -X POST https://YOUR_CLOUD_RUN_URL/api/analyze \
  -H 'content-type: application/json' \
  -d @data/sample-property.json
```

## 9. 本番で追加検討すること

- `--allow-unauthenticated` を外し、認証付きAPIにする
- Cloud ArmorまたはAPI Gatewayを前段に置く
- リクエスト単位の課金・レート制限
- 取得結果のキャッシュ
- BigQuery/PostgreSQL/PostGISへの保存
- APIキーのローテーション手順
- 監査ログ、エラーログ、アラート
