# PAA Extractor

Extracts Google "People Also Ask" questions and saves them to Google Sheets.

## Setup

```bash
npm install
```

## Run Locally

```bash
npm run serve
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

1. Push to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add these environment variables in Vercel:
   - `SERPAPI_KEY`
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_CREDENTIALS` — base64-encoded `credentials.json` (run: `base64 -w0 credentials.json`)
