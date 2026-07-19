const rateLimit = require('express-rate-limit');

// Defense-in-depth for the CPU-bound transcription pipeline (each request
// ties up ffmpeg + whisper-cli for seconds). HMAC verification already
// rejects unauthorized traffic, but a flood of even correctly-signed
// requests (a bug, a leaked secret, a retry loop) could still exhaust the
// single instance -- this caps request volume regardless of auth outcome.
const transcribeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests' },
});

module.exports = transcribeLimiter;
