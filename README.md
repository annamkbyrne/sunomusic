# SunoMusic

An AI music generator web app powered by [SunoAPI.org](https://docs.sunoapi.org/).
Users describe a song (or write their own title, style and lyrics), and the app
generates two full tracks they can stream, play and download.

## Features

- **Simple mode** – describe the song in plain words.
- **Custom mode** – title, style tags, your own lyrics, exclude styles, vocal gender,
  style influence and weirdness sliders.
- **✨ AI lyrics** – generate lyrics from a short idea (SunoAPI lyrics endpoint).
- Instrumental toggle and model picker (V6, V6 Mini, V6 Wild).
- Live status polling, streaming preview while the track finishes, MP3 download,
  cover art, lyrics view, and a song history saved in the browser.
- Remaining credits shown in the header.

## Tech stack

- Static front-end (plain HTML/CSS/JS, no build step) in `public/`.
- [Netlify Functions](https://docs.netlify.com/functions/overview/) in
  `netlify/functions/` proxy every call to `https://api.sunoapi.org`, so the API key
  is **never exposed to the browser**.

| Route | Function | SunoAPI endpoint |
| --- | --- | --- |
| `POST /api/generate` | `generate.mjs` | `POST /api/v1/generate` |
| `GET /api/status?taskId=` | `status.mjs` | `GET /api/v1/generate/record-info` |
| `POST /api/lyrics` / `GET /api/lyrics?taskId=` | `lyrics.mjs` | `POST /api/v1/lyrics`, `GET /api/v1/lyrics/record-info` |
| `GET /api/credits` | `credits.mjs` | `GET /api/v1/generate/credit` |
| `POST /api/callback` | `callback.mjs` | receives SunoAPI's required `callBackUrl` pings |

## Deploying to Netlify

1. In Netlify, **Add new site → Import an existing project** and pick this repo.
   Build settings are read from `netlify.toml` (publish `public`, functions
   `netlify/functions`, no build command needed).
2. Go to **Site configuration → Environment variables** and add:
   - `SUNO_API_KEY` = your key from <https://sunoapi.org/api-key>
3. Trigger a redeploy so the functions pick up the variable.

## Local development

```bash
npm install -g netlify-cli
cp .env.example .env   # then put your key in .env
netlify dev
```

> Note: anyone who can open the deployed site can spend your SunoAPI credits.
> Add Netlify password protection or authentication if the site is public.
