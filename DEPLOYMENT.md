# SetATime Deployment Runbook

Operational runbook for deploying SetATime to AWS (`us-west-2`).

## Primary flow: push to `main` (GitHub Actions + OIDC)

**This is the normal way to deploy. No credentials anywhere.**

```
git checkout main
git pull --ff-only
# make changes, or merge a feature branch
git push origin main
```

That's it. The workflow at `.github/workflows/deploy.yml` runs on every push
to `main` (and can also be triggered manually from the Actions tab via
`workflow_dispatch`). It:

1. Checks out the repo, installs deps (`npm ci`), builds the frontend with
   the `VITE_*` env vars baked in.
2. Assumes IAM role `arn:aws:iam::158291236521:role/setatime-github-deploy`
   via GitHub OIDC — no long-lived AWS keys stored anywhere.
3. Diffs against the previous commit and only re-deploys Lambdas whose
   `lambda/<name>/` directory actually changed. Frontend always deploys.
4. `aws s3 sync dist s3://setatime-frontend-us-west-2 --delete`.
5. CloudFront invalidation on `/*` for distribution `E26AJUHQAV6UYQ`.
6. Writes a deploy summary with the frontend URL.

Guardrails baked into the setup:

- **Branch-scoped trust.** The IAM role's trust policy only allows assumption
  from `repo:haranathg/setatime:ref:refs/heads/main`. Pushes to any other
  branch cannot deploy even if a workflow runs.
- **Permissions.** The role has `SetATimeManageOnly` attached — scoped to
  existing SetATime resources; cannot create/delete new resources, cannot
  touch unrelated account resources.
- **Concurrency lock.** `concurrency.group: deploy-main` prevents overlapping
  deploys from racing. In-progress deploys are not cancelled.
- **Lambda secrets stay on the Lambda.** `ANTHROPIC_API_KEY` and
  `ALLOWED_KEY_HASHES` live as Lambda env vars and are never passed through
  the workflow, never in GitHub secrets, never in this repo.

### To deploy a change

1. Work on a feature branch.
2. Open a PR to `main`, get it reviewed.
3. Merge → deploy fires automatically.
4. Watch the run in the **Actions** tab; verify the deploy summary and hit
   https://d1bycim0bytkm9.cloudfront.net. CloudFront invalidation takes
   ~1–2 min to propagate.

### Manual trigger (e.g. redeploy without a code change)

GitHub UI → **Actions** → **Deploy SetATime** → **Run workflow** → pick
`main`. A `workflow_dispatch` run redeploys the frontend **and both
Lambdas** (the change-detection step falls through to "deploy both" when
there's no `before` SHA).

---

## Fallback: manual CLI deploy from a workstation

Only use this if GitHub Actions is unavailable (e.g. GitHub outage) or you
need to hotfix and the workflow is broken. Requires a scoped AWS profile on
the workstation. **Do not commit the profile name or credentials.**

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
