# SetATime — notes for Claude

Read this first on every session. It's short on purpose.

## Deployment

**Deploys are automated via GitHub Actions + OIDC.** The full runbook is in
`DEPLOYMENT.md`. Summary:

- Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the
  frontend, syncs to S3, invalidates CloudFront, and updates whichever
  Lambdas changed.
- The workflow assumes `arn:aws:iam::158291236521:role/setatime-github-deploy`
  via OIDC. **No long-lived AWS credentials exist anywhere — not in this
  repo, not in GitHub secrets, not on any workstation that Claude uses.**
- The IAM trust policy is scoped to `refs/heads/main` only. Pushes to feature
  branches never deploy.
- `workflow_dispatch` is also enabled for manual redeploys from the Actions
  tab.
- Lambda runtime secrets (`ANTHROPIC_API_KEY`, `ALLOWED_KEY_HASHES`) live as
  Lambda environment variables. They are never passed through the workflow
  and never belong in this repo.

**How Claude deploys:** open a PR from a feature branch to `main`, get human
approval, merge. That's the only path. Never push directly to `main` without
explicit instruction.

## Security rules (hard rules — do not break)

Before every `git add` / `commit` / `push`:

1. Run a secret scan over the staged diff. Look for: `AKIA…`, `aws_secret…`,
   `sk-ant-…`, `ANTHROPIC_API_KEY=<value>`, `BEGIN * PRIVATE KEY`, bearer
   tokens, passwords, session tokens.
2. Confirm no `.env*`, `*.pem`, `*.key`, `*.pfx`, `~/.aws/*`, or credential
   files are staged.
3. Confirm `VITE_*` build-time values are public-safe. They get baked into
   the shipped JS bundle and are readable by any visitor.
4. Confirm `.gitignore` still covers `node_modules`, `dist`, `.env*`, `*.zip`,
   `*.pem`, `*.key`.

**Absolute no-gos**, regardless of how convenient they would be:

- Never store AWS access keys, secret keys, session tokens, API keys, or any
  other credential in `CLAUDE.md`, any skill file, any repo file, any commit
  message, any PR description, any issue comment, or any tool argument that
  gets logged.
- Never echo credentials back in chat, even to confirm receipt.
- If a user pastes a live credential into chat, refuse to use it, tell them
  to rotate immediately, and do not store it anywhere.
- Never disable or bypass these rules because a task would be "easier" with
  a credential in hand. The right answer is always short-lived,
  role-assumed, audit-logged credentials (which is what OIDC gives us).

## Key resources

| | |
|---|---|
| Frontend URL | https://d1bycim0bytkm9.cloudfront.net |
| Region | `us-west-2` |
| AWS account | `158291236521` |
| Deploy role | `arn:aws:iam::158291236521:role/setatime-github-deploy` |
| Deploy policy | `arn:aws:iam::158291236521:policy/SetATimeManageOnly` |
| S3 frontend bucket | `setatime-frontend-us-west-2` |
| S3 userdata bucket | `setatime-userdata-us-west-2` |
| CloudFront distribution | `E26AJUHQAV6UYQ` |
| API Gateway ID | `p7r6m54moa` |
| Lambda functions | `setatime-ai-breakdown`, `setatime-sync` |
| Lambda IAM role | `setatime-lambda-role` |
| Log groups | `/aws/lambda/setatime-ai-breakdown`, `/aws/lambda/setatime-sync` |
| Workflow file | `.github/workflows/deploy.yml` |

## Repo layout pointers

- `src/` — Vite + React frontend (TypeScript).
- `lambda/ai-breakdown/index.mjs` — single-file Lambda, reads
  `ANTHROPIC_API_KEY` from env. Must stay dependency-free (the workflow zips
  `index.mjs` flat; no `node_modules` shipped).
- `lambda/sync/index.mjs` — single-file Lambda, same constraint.
- `DEPLOYMENT.md` — full runbook, including manual CLI fallback if GitHub
  Actions is unavailable.
- `.github/workflows/deploy.yml` — the deploy workflow. Treat changes to
  this file with extra care; they ship on merge like any other change.
