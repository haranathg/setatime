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
- **Lambda secrets stay out of the workflow.** The Anthropic key lives in
  Secrets Manager (`setatime/anthropic-api-key`, readable only by
  `setatime-lambda-role`); `ALLOWED_KEY_HASHES` lives as a Lambda env var.
  Neither is passed through the workflow, stored in GitHub secrets, or committed.

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

Effect is immediate. The Lambda reads the Anthropic key from Secrets Manager
(`setatime/anthropic-api-key`); nothing key-related needs configuring here.

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
| Anthropic key secret | `setatime/anthropic-api-key` (Secrets Manager, `us-west-2`) |
| CloudWatch log groups | `/aws/lambda/setatime-ai-breakdown`, `/aws/lambda/setatime-sync` |

---

## Calendar feed fetching (`setatime-sync`)

The sync Lambda also serves `action: 'fetchCalendars'`, which fetches
subscribed `.ics` feeds on the frontend's behalf — browsers can't, because
school and Outlook feeds send no CORS headers.

It is deliberately narrow: https only, every resolved address checked
against private and link-local ranges (the metadata service above all),
redirects re-validated rather than followed, 8s timeout, 5MB cap, and at
most 10 URLs per call.

**Feed URLs are never logged.** A calendar feed URL is an unauthenticated
credential, and CloudWatch keeps whatever is printed. Fetch errors are
caught and replaced with a fixed message rather than surfaced, because the
underlying error embeds the URL.

Access is gated on `ALLOWED_KEY_HASHES` (comma-separated sha256 hashes of
permitted secret keys) **when that variable is set on this Lambda**. It is
not set there today, so the fallback applies: the key must already own a
data object in the bucket. Setting `ALLOWED_KEY_HASHES` on
`setatime-sync` is the way to tighten this to an explicit allowlist.

---

## Anthropic API key (Secrets Manager)

The AI Lambda (`setatime-ai-breakdown`) reads its Anthropic key from the
Secrets Manager secret `setatime/anthropic-api-key` in `us-west-2`. The key
is not a Lambda environment variable, is not in GitHub secrets, and never
passes through the deploy workflow.

- **Who can read it.** `setatime-lambda-role` needs
  `secretsmanager:GetSecretValue` on this secret's ARN (plus `kms:Decrypt`
  if it is encrypted with a customer-managed KMS key). Nothing else needs
  read access.
- **When it is read.** Once per cold start; each warm Lambda instance keeps
  the value in memory. A changed secret is therefore picked up only by new
  instances (see rotation below).
- **Override.** The secret name can be overridden with the
  `ANTHROPIC_SECRET_ID` Lambda environment variable. It is not set today,
  and only needs setting if the secret is ever renamed.
- **Logging.** The Lambda never logs the key or the raw secret response.
  On failure it logs only the error name.

### Rotate the key

1. Create a new key in the Anthropic Console.
2. Store it as the new secret value, using credentials that can write this
   secret. Either use the AWS console (Secrets Manager →
   `setatime/anthropic-api-key` → **Retrieve secret value** → **Edit**), or
   use the CLI reading from stdin so the key never lands in shell history:

   ```bash
   aws secretsmanager put-secret-value \
     --secret-id setatime/anthropic-api-key \
     --secret-string file:///dev/stdin \
     --profile "$AWS_PROFILE" --region us-west-2
   # paste the key, press Enter, then Ctrl-D
   ```

   The Lambda trims surrounding whitespace, so the trailing newline is fine.
   Never put the key on the command line, in a file in this repo, or in chat.
3. Force fresh Lambda instances so the new value is read. Warm instances
   otherwise keep the old key until AWS recycles them. The credential-free
   way is **Actions → Deploy SetATime → Run workflow** on `main`: a manual
   run redeploys both Lambdas.
4. Verify by logging an entry in Garden. It should be categorized within a
   few seconds.
5. Revoke the old key in the Anthropic Console.

### Troubleshooting

| Symptom (shown inline on the Garden entry) | Meaning | Fix |
|---|---|---|
| `HTTP 500: API key not configured` | The Lambda could not read the secret, or it is empty. CloudWatch shows `Could not read Anthropic secret: <ErrorName>` or `Anthropic secret is empty`. | `AccessDeniedException`: check the role's `GetSecretValue` permission. `ResourceNotFoundException`: check the secret name and region. Empty: store a value. |
| `HTTP 502: AI service error (401)` | The secret was read, but Anthropic rejected the key. | The key is wrong, revoked, or expired. Rotate it (steps above). |

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
