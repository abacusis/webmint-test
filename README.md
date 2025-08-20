# WebMint – Remix + Tailwind + OpenAI (Cloudflare Pages/Workers)

## Prerequisites
- Node.js 18+ (recommended: 20.x)
- npm 9+
- An OpenAI API key

## Install
```
npm install
```

## Environment variables
- Local (development):
  - macOS/Linux: `export OPENAI_API_KEY=sk-...`
  - Windows (new terminal after setting): `setx OPENAI_API_KEY "sk-..."`
- Cloudflare Pages/Workers: add `OPENAI_API_KEY` in project settings (Environment Variables).

## Run in development
Remix is configured to use Node in dev.
```
npm run dev
```
- App: http://127.0.0.1:3000
- On the home page, click "Use example" to load `public/prompt.txt`, then "Generate".

## Build for production (Cloudflare)
Production build targets Cloudflare Pages/Workers.
```
NODE_ENV=production npm run build
```
Outputs:
- Client assets: `build/client`
- Server bundle (used by Pages Functions): `build/server`

## Deploy to Cloudflare Pages
1) Create a Pages project and connect this folder.
2) Build command: `npm run build`
3) Output directory: `build/client`
4) Functions directory: `functions`
5) Environment variables: add `OPENAI_API_KEY`
6) Deploy

## Scripts
```
{
  "dev": "vite",
  "build": "vite build",
  "start": "remix-serve build/server/index.js"
}
```

## Notes
- API route `app/routes/api.generate.jsx` uses `@remix-run/cloudflare` and reads the key from `context.cloudflare.env.OPENAI_API_KEY` on Cloudflare, and falls back to `process.env.OPENAI_API_KEY` locally.
- Tailwind is included via `app/tailwind.css` and imported in `app/root.jsx`.


npx remix vite:build && npx remix-serve build/server/index.js