# audio-transcript

Standalone Express service that transcribes Telegram voice messages for the studio bot's "Ask AI" feature, using self-hosted [whisper.cpp](https://github.com/ggml-org/whisper.cpp). Deployed separately from the bot backend (NestJS, sibling repo) because whisper.cpp inference is CPU-bound and shouldn't contend with the bot process or bloat its deploy image — this service has its own HTTP contract, deploy, and scaling.

## How it works

1. The bot backend sends `POST /transcribe` with a raw OGG voice note and HMAC signature headers.
2. The signature is verified (HMAC-SHA256 over `timestamp + audio bytes`, compared with `crypto.timingSafeEqual`, rejecting anything outside a 5-minute window).
3. The audio is converted to 16kHz mono WAV via `ffmpeg`.
4. `whisper-cli` transcribes it (multilingual auto-detect, `-l auto`).
5. Response: `{ "text": "..." }`.

Temp files for each request are written under `temp/` with a random UUID and cleaned up afterward regardless of success or failure.

## API

### `POST /transcribe`

Headers:
- `Content-Type: audio/ogg`
- `X-Timestamp` — unix seconds
- `X-Signature` — hex HMAC-SHA256 of `Buffer.concat([Buffer.from(`${timestamp}.`), rawAudioBuffer])`, signed with `TRANSCRIPTION_SHARED_SECRET`

Body: raw binary audio (OGG/Opus), max 10MB.

Responses: `{ "text": "..." }` (200) · 401 (bad/missing/expired signature) · 400 (empty body) · 429 (rate limited) · 500/504 (pipeline failure/timeout).

Rate limited to 30 requests / 5 minutes per IP.

### `GET /health`

`{ "status": "ok" }` — used by the deploy platform's healthcheck.

## Local development

```bash
brew install ffmpeg whisper-cpp
npm install
npm run models:download    # downloads ggml-small.bin (~465MB) into models/
cp .env.example .env       # fill in TRANSCRIPTION_SHARED_SECRET -- must match the bot backend's copy exactly
npm run start:dev
```

The service listens on port 4000 by default, since the bot backend's local config already expects it there (and to avoid colliding with the bot backend's own default port, 3000).

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `TRANSCRIPTION_SHARED_SECRET` | yes | — | Must match the bot backend's copy exactly; the process refuses to start without it |
| `PORT` | no | `4000` | The deploy platform injects its own at deploy time, so this only matters locally |
| `WHISPER_BINARY` | no | `whisper-cli` | Override only if the binary isn't on `PATH` |
| `WHISPER_MODEL_PATH` | no | `./models/ggml-small.bin` | |
| `FFMPEG_BINARY` | no | `ffmpeg` | Override only if the binary isn't on `PATH` |
| `TEMP_DIR` | no | `./temp` | Per-request pipeline files |

The optional variables' defaults already match both local Homebrew installs and the Docker image's layout, so they typically don't need to be set anywhere.

## Deployment

Deploys from the `Dockerfile` (multi-stage: compiles whisper.cpp from source, downloads the model, assembles a slim runtime image with no build tools left in it). `railway.toml` configures the build and health check for the target platform.

`TRANSCRIPTION_SHARED_SECRET` has to be set manually as an environment variable on the deploy platform — it can't live in the repo.

## Project structure

```
server.js                  # app assembly: middleware, routes, listen()
config.js                  # env loading + validation, single source of truth
middleware/
  verifySignature.js       # HMAC verification
  rateLimiter.js           # per-IP rate limiting on /transcribe
routes/
  transcribe.js            # POST /transcribe wiring (raw body parsing, middleware order)
services/
  transcribe.js            # the actual pipeline: ffmpeg -> whisper-cli -> cleanup
```
