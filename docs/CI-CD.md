# CI/CD pipeline — abe-console

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|--------|
| `ci.yml` | push / PR to `main` | `npm ci` → typecheck → test → production build; uploads `.vercel/output` artifact |
| `vercel-preview.yml` | pull requests | Preview deploy when `VERCEL_TOKEN` is set; comments URL on PR |
| `vercel-prod-deploy.yml` | push to `main` + manual | Typecheck + build + `vercel deploy --prebuilt --prod` (scope `echo-ec69`) |
| `live-smoke.yml` | schedule 12h / after prod / manual | HTTP smoke of package host + optional console URL |

## Secrets (repository → Settings → Secrets → Actions)

| Secret | Required | Purpose |
|--------|----------|--------|
| `VERCEL_TOKEN` | **Yes** for deploy | [Create token](https://vercel.com/account/settings/tokens) |
| `VERCEL_ORG_ID` | Optional | Skip interactive link |
| `VERCEL_PROJECT_ID` | Optional | Skip interactive link |
| `XAI_API_KEY` | Optional | Sets Production Secret for Grok chat RPC |

## Variables (optional)

| Variable | Purpose |
|----------|--------|
| `CONSOLE_PRODUCTION_URL` | Full console `*.vercel.app` URL for `live-smoke` |

## Local deploy helper

```bash
export VERCEL_TOKEN=…   # never commit
# from Drive / artifacts: deploy-vercel.sh targets --scope echo-ec69
npm ci && npm run build
npx vercel link --yes --scope echo-ec69 --project abe-console
npx vercel deploy --prebuilt --prod --yes --scope echo-ec69
```

## One-click without token in Actions

Import repo in Vercel (Git integration builds on push):

https://vercel.com/new/clone?repository-url=https://github.com/cantgetalonggta-png/abe-console

## Package host (separate static site)

https://auto-build-engine.vercel.app — already on Git → Vercel; verified by `live-smoke` and `auto-build-engine` `live-verify` workflow.
