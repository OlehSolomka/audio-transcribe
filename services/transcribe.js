const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const config = require('../config');

const execFileAsync = promisify(execFile);

const FFMPEG_TIMEOUT_MS = 30_000;
const WHISPER_TIMEOUT_MS = 120_000;

async function transcribeAudioBuffer(audioBuffer) {
  const id = randomUUID();
  const inputPath = path.join(config.tempDir, `${id}.ogg`);
  const wavPath = path.join(config.tempDir, `${id}.wav`);
  const outPrefix = path.join(config.tempDir, id); // whisper-cli appends .txt itself
  const txtPath = `${outPrefix}.txt`;

  try {
    await fs.writeFile(inputPath, audioBuffer);

    await execFileAsync(
      config.ffmpegBinary,
      [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', inputPath,
        '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
        wavPath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, killSignal: 'SIGKILL' },
    );

    await execFileAsync(
      config.whisperBinary,
      [
        '-m', config.whisperModelPath,
        '-f', wavPath,
        // Force Ukrainian rather than 'auto' -- Whisper's language
        // auto-detection frequently confuses Ukrainian for Russian (same
        // script, overlapping vocabulary), especially on the "small"
        // model. Since every caller here is a fixed Ukrainian-speaking
        // audience, there's nothing for auto-detect to usefully decide.
        '-l', 'uk',
        '-nt',
        '-otxt',
        '-of', outPrefix,
      ],
      { timeout: WHISPER_TIMEOUT_MS, killSignal: 'SIGKILL' },
    );

    const text = await fs.readFile(txtPath, 'utf8');
    return text.trim();
  } finally {
    // Runs on every path -- success, thrown error, or timeout-triggered kill.
    await Promise.all(
      [inputPath, wavPath, txtPath].map(async (filePath) => {
        try {
          await fs.unlink(filePath);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.error(`Failed to remove temp file ${filePath}:`, err);
          }
        }
      }),
    );
  }
}

module.exports = { transcribeAudioBuffer };
