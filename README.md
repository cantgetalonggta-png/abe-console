# Auto-Build Engine Console (production)

TanStack Start + Nitro console for Grok Auto-Build Engine.

## Deploy to Vercel (production)

```bash
export VERCEL_TOKEN=…   # https://vercel.com/account/settings/tokens
npm install
npm run build
vercel link -y
vercel env add XAI_API_KEY production --type secret   # optional chat
vercel deploy --prebuilt --prod -y
```

Or Import this repo in the Vercel dashboard → Deploy.

Package host remains: https://auto-build-engine.vercel.app
