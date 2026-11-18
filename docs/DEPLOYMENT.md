# Deployment (personal use)

Sourced runs on three managed services, all free at personal use — the same setup as EquipTrack.

```
 Browser ──HTTPS──▶ Vercel (static React app)
    │
    └──HTTPS + Bearer token──▶ Azure Container Apps     FastAPI + pdflatex, scales to zero
                                   │            │
                                   │ TLS        └──HTTPS──▶ GitHub API: kb.md from the private
                                   ▼                         resume-knowledge-base repo (read-only token)
                               Neon Postgres               history (résumés, LaTeX, PDFs)
```

| Piece | Service | Why |
|---|---|---|
| Frontend | Vercel (Hobby) | Static Vite build, deploys on every push to `main`. |
| API | Azure Container Apps (Consumption) | Same Docker image as local; 1 GiB memory for pdflatex; scales to zero; covered by the monthly free grant at personal use. |
| Image | GitHub Container Registry (public) | Free. The image holds only code that's already public — no KB, no history, no secrets (see `backend/.dockerignore`). |
| History | Neon Postgres | Free, never expires. Container Apps has no lasting disk, so SQLite would be wiped. |
| Knowledge base | Your private GitHub repo | Read on demand with a token that can only read that one repo. `kb.md` never sits on the server's disk; edits pushed by the kb-ingest skill show up within a minute. |

**Login:** one password (`APP_PASSWORD`). The browser trades it for a signed 30-day token and keeps
the token, never the password. A token instead of a cookie because the frontend and API are on
different domains, and browsers increasingly block cookies sent across domains.

**LaTeX sandbox:** the editor sends any LaTeX to the API, and LaTeX can read files by path. pdflatex
therefore runs as the `nobody` user with no secrets in its environment, no shell escape, and writes
limited to its temp folder (`backend/services/latex_service.py`).

## How a change reaches production

1. Push to `main` → **CI** (`.github/workflows/ci.yml`): backend installs and imports; frontend lint + build.
2. If CI passes → **Deploy** (`deploy.yml`): build `backend/Dockerfile`, push
   `ghcr.io/vedpawar1410/sourced-api:<commit>`, point the Container App at it, poll `/api/health` until
   it answers with pdflatex available.
3. Vercel deploys the frontend on its own.

**Rollback:** `az containerapp update -n sourced-api -g sourced-rg --image ghcr.io/vedpawar1410/sourced-api:<older-commit>`

## First-time setup (once)

Use the same region family throughout (examples: Singapore).

### 1. Neon (history database)

1. Create a project at neon.tech — Postgres 16, region **AWS Asia Pacific (Singapore)**.
2. **Connect** → turn **Connection pooling off** (PgBouncer breaks asyncpg's prepared statements) and
   copy the *direct* connection string exactly as shown. That's `DATABASE_URL`; the app converts it for
   asyncpg itself. Tables are created on the API's first start.

### 2. GitHub token for the knowledge base

GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new token**:
- Repository access: **Only select repositories → `resume-knowledge-base`**
- Permissions: **Contents → Read-only** (nothing else)
- Expiration: 1 year (put a reminder in your calendar)

That's `GITHUB_TOKEN`. It can read `kb.md` and nothing else.

### 3. Publish the image once

Merge this to `main`. CI runs, then Deploy builds and pushes `ghcr.io/vedpawar1410/sourced-api`
(the `deploy` job shows as *skipped* — expected). Then on GitHub: **your profile → Packages →
sourced-api → Package settings → Change visibility → Public**, so Azure can pull it without a password.

### 4. Azure

```bash
az login
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App --wait
az group create --name sourced-rg --location southeastasia
az containerapp env create --name sourced-env --resource-group sourced-rg \
  --location southeastasia --logs-destination none
```

Read the secrets into your shell without echoing them or saving them in history:

```bash
read -s "ANTHROPIC_API_KEY?Anthropic key: "; echo
read -s "DATABASE_URL?Neon URL: "; echo
read -s "GITHUB_TOKEN?GitHub KB token: "; echo
read -s "APP_PASSWORD?Password for the app: "; echo
AUTH_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
```

Create the app (secrets are stored encrypted and referenced with `secretref:`):

```bash
az containerapp create --name sourced-api --resource-group sourced-rg \
  --environment sourced-env --image ghcr.io/vedpawar1410/sourced-api:latest \
  --ingress external --target-port 8000 \
  --cpu 0.5 --memory 1.0Gi --min-replicas 0 --max-replicas 1 \
  --secrets anthropic-key="$ANTHROPIC_API_KEY" database-url="$DATABASE_URL" \
            github-token="$GITHUB_TOKEN" app-password="$APP_PASSWORD" auth-secret="$AUTH_SECRET" \
  --env-vars ANTHROPIC_API_KEY=secretref:anthropic-key DATABASE_URL=secretref:database-url \
             GITHUB_TOKEN=secretref:github-token APP_PASSWORD=secretref:app-password \
             AUTH_SECRET=secretref:auth-secret \
             KB_GITHUB_REPO=VedPawar1410/resume-knowledge-base \
  --query properties.configuration.ingress.fqdn --output tsv
```

The last line prints the API address (`sourced-api.<random>.southeastasia.azurecontainerapps.io`).
Check it: `curl https://<fqdn>/api/health` → `{"status":"ok","pdflatex_available":true}` (first call
waits ~20–30 s for a cold start).

**Budget:** Azure portal → **Cost Management → Budgets → Add**: $5/month, email alerts at $1 and $5.

### 5. Let GitHub deploy to Azure (OIDC — no stored password)

```bash
SUB=$(az account show --query id -o tsv)
TENANT=$(az account show --query tenantId -o tsv)
APP_ID=$(az ad app create --display-name sourced-github-deploy --query appId -o tsv)
az ad sp create --id "$APP_ID" --output none
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:VedPawar1410/resume-modifier:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'
az role assignment create --assignee "$APP_ID" --role Contributor \
  --scope "/subscriptions/$SUB/resourceGroups/sourced-rg"
echo "AZURE_CLIENT_ID=$APP_ID  AZURE_TENANT_ID=$TENANT  AZURE_SUBSCRIPTION_ID=$SUB"
```

If the first deploy fails with `AADSTS700213: No matching federated identity record`, GitHub sent its
newer subject format: copy the `subject claim` the `azure/login` step printed and update the
credential with `az ad app federated-credential update` (same as EquipTrack).

GitHub repo → **Settings → Environments → New environment `production`** → secrets
`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. Then **Settings → Secrets and variables →
Actions → Variables**: `AZURE_CONTAINERAPP_NAME` = `sourced-api`, `AZURE_RESOURCE_GROUP` = `sourced-rg`.
Run **Actions → Deploy → Run workflow** once to check the whole path.

### 6. Vercel (frontend)

1. **Add New → Project** → import `resume-modifier`. **Root Directory** `frontend`; framework **Vite**
   (detected).
2. **Environment Variables**: `VITE_API_BASE_URL` = `https://<fqdn from step 4>` (no trailing slash).
3. Deploy, then allow that Vercel address to call the API:

```bash
az containerapp update -n sourced-api -g sourced-rg \
  --set-env-vars CORS_ORIGINS=https://<your-project>.vercel.app
```

Open the Vercel URL, sign in with your `APP_PASSWORD`, generate a résumé. Done.

## Cost guardrails

| Guardrail | Setting |
|---|---|
| Can't scale out | `--max-replicas 1` |
| Free when idle | `--min-replicas 0` |
| No log-ingestion charges | environment created with `--logs-destination none` |
| No registry charges | public GHCR image |
| No database charges | Neon free plan (writes stop at the limit, never billed) |
| API spend | behind the password; ~1.5–2¢ per résumé on Claude Haiku 5.5 |
| Early warning | $5 budget with alerts at $1 and $5 (alerts don't stop spending) |

**Kill switch:** `az containerapp ingress disable -n sourced-api -g sourced-rg` (nothing can wake it).
Back on: `az containerapp ingress enable -n sourced-api -g sourced-rg --type external --target-port 8000`.
**Remove everything on Azure:** `az group delete -n sourced-rg`.

**Change the password:** update the `app-password` secret and restart the revision. To sign every
device out as well, also replace `auth-secret`.

## Try deployed mode locally

`.claude/launch.json` has `backend-deployed-mode` (port 8001: password `local-test`, KB read from GitHub
with your `gh` login) and `frontend-deployed-mode` (port 5174, pointed at it).
