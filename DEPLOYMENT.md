# SetATime Deployment Runbook

Operational runbook for deploying SetATime to AWS (`us-west-2`).

> Deploys run from a developer workstation with a scoped AWS profile that has
> programmatic-only access to SetATime resources. The profile name, local
> workstation paths, and any credentials are intentionally **not** stored in
> this repo — keep them in your shell env / `~/.aws/credentials`.

Set these once per shell before running any commands below:

```bash
export AWS_PROFILE=<your-scoped-setatime-profile>
export AWS_REGION=us-west-2
```

---

## 1. Deploy Frontend (build → S3 → CloudFront invalidate)

This is the most common deploy — run the three commands together.

```bash
# From repo root
VITE_AI_API_URL=https://p7r6m54moa.execute-api.us-west-2.amazonaws.com/ai-breakdown \
VITE_SYNC_API_URL=https://p7r6m54moa.execute-api.us-west-2.amazonaws.com/sync \
npm run build

aws s3 sync dist s3://setatime-frontend-us-west-2 --delete \
  --profile "$AWS_PROFILE" --region "$AWS_REGION"

aws cloudfront create-invalidation \
  --distribution-id E26AJUHQAV6UYQ \
  --paths "/*" \
  --profile "$AWS_PROFILE" --region "$AWS_REGION"
```

CloudFront invalidation takes ~1–2 minutes to propagate.

> ⚠️ `VITE_*` values are **baked into the public JS bundle**. Only put
> non-secret values there (API Gateway URLs are fine; API keys are not).

---

## 2. Deploy AI Breakdown Lambda

```bash
cd lambda/ai-breakdown
zip -j /tmp/setatime-ai.zip index.mjs
aws lambda update-function-code \
  --function-name setatime-ai-breakdown \
  --zip-file fileb:///tmp/setatime-ai.zip \
  --profile "$AWS_PROFILE" --region "$AWS_REGION"
```

Effect is immediate. `ANTHROPIC_API_KEY` must be configured as a Lambda
environment variable (never committed).

---

## 3. Deploy Sync Lambda

```bash
cd lambda/sync
zip -j /tmp/setatime-sync.zip index.mjs
aws lambda update-function-code \
  --function-name setatime-sync \
  --zip-file fileb:///tmp/setatime-sync.zip \
  --profile "$AWS_PROFILE" --region "$AWS_REGION"
```

> The `zip -j` flag flattens paths and zips a **single file**. These Lambdas
> must stay dependency-free (no `node_modules`). If a dependency is added,
> switch to `npm ci --omit=dev && zip -r … .` and update this runbook.

---

## Check Lambda logs (debugging)

```bash
aws logs describe-log-streams \
  --log-group-name '/aws/lambda/setatime-ai-breakdown' \
  --order-by LastEventTime --descending --max-items 1 \
  --profile "$AWS_PROFILE" --region "$AWS_REGION"
```

Swap the log group name for `/aws/lambda/setatime-sync` as needed.

---

## Resource reference

| Resource | Value |
|---|---|
| Region | `us-west-2` |
| Frontend URL | https://d1bycim0bytkm9.cloudfront.net |
| S3 frontend bucket | `setatime-frontend-us-west-2` |
| S3 userdata bucket | `setatime-userdata-us-west-2` |
| CloudFront distribution | `E26AJUHQAV6UYQ` |
| API Gateway ID | `p7r6m54moa` |
| AI API URL | `https://p7r6m54moa.execute-api.us-west-2.amazonaws.com/ai-breakdown` |
| Sync API URL | `https://p7r6m54moa.execute-api.us-west-2.amazonaws.com/sync` |
| Lambda functions | `setatime-ai-breakdown`, `setatime-sync` |
| Lambda IAM role | `setatime-lambda-role` |
| CloudWatch log groups | `/aws/lambda/setatime-ai-breakdown`, `/aws/lambda/setatime-sync` |

---

## Notes

- CloudFront invalidation: ~1–2 min to propagate.
- Frontend deploy (step 1) is the common path; the 3 commands are usually run together.
- Lambda deploys take effect immediately.
- The scoped deploy profile is expected to manage **only** SetATime resources
  and have no create/delete authority over unrelated account resources.

---

## Security checklist (run before every `git push`)

1. `git diff --staged` — scan for `AKIA…`, `aws_secret…`, `sk-ant-…`,
   `ANTHROPIC_API_KEY=`, `BEGIN * PRIVATE KEY`, bearer tokens, passwords.
2. Confirm no `.env*`, `*.pem`, `*.key`, `~/.aws/*` files are staged.
3. Confirm `VITE_*` build args contain only public-safe values (they end up
   in the shipped JS bundle).
4. Confirm `.gitignore` still covers `node_modules`, `dist`, `.env*`, `*.zip`,
   `*.pem`, `*.key`.
5. If anything looks off, **stop** and investigate before pushing.
