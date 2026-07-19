const express = require('express');
const rateLimiter = require('../middleware/rateLimiter');
const verifySignature = require('../middleware/verifySignature');
const { transcribeAudioBuffer } = require('../services/transcribe');

const router = express.Router();

// Generous relative to real payloads (60s Opus voice note ~240KB worst case)
// but still bounded.
const MAX_AUDIO_BODY_SIZE = '10mb';

router.post(
  '/transcribe',
  // Rate limit first, before spending any cycles on body parsing or HMAC
  // verification -- cheapest possible rejection point for a flood.
  rateLimiter,
  // type: '*/*' -- parse the body as a raw Buffer regardless of what
  // Content-Type the client sends. The client always sends audio/ogg, but
  // Content-Type is documentation here, not the trust boundary -- the HMAC
  // is. Restricting `type` would make express.raw() silently skip parsing
  // on any mismatch, leaving req.body as {} instead of a Buffer.
  express.raw({ type: '*/*', limit: MAX_AUDIO_BODY_SIZE }),
  verifySignature,
  async (req, res) => {
    try {
      const text = await transcribeAudioBuffer(req.body);
      res.json({ text });
    } catch (err) {
      // Never let the raw pipeline error (full file paths, command line,
      // ffmpeg/whisper-cli stderr) reach the client -- log it for the
      // operator, respond with something generic.
      console.error('Transcription pipeline failed:', err);
      const publicError = new Error('Transcription failed');
      publicError.status = err.killed ? 504 : 500;
      throw publicError; // Express 5 forwards this to the error-handling middleware.
    }
  },
);

module.exports = router;
