const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const tempDir = process.env.TEMP_DIR || path.join(__dirname, 'temp');
fs.mkdirSync(tempDir, { recursive: true });

module.exports = {
  port: Number(process.env.PORT) || 4000,
  transcriptionSharedSecret: required('TRANSCRIPTION_SHARED_SECRET'),
  tempDir,
  ffmpegBinary: process.env.FFMPEG_BINARY || 'ffmpeg',
  whisperBinary: process.env.WHISPER_BINARY || 'whisper-cli',
  whisperModelPath: process.env.WHISPER_MODEL_PATH || path.join(__dirname, 'models', 'ggml-small.bin'),
};
