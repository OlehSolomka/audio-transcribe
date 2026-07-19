const crypto = require('node:crypto');
const config = require('../config');

const MAX_CLOCK_SKEW_SECONDS = 300;
// SHA-256 hex digest is always exactly 64 hex chars -- this regex guarantees
// Buffer.from(header, 'hex') below always yields 32 bytes, so timingSafeEqual
// (which throws RangeError on length mismatch) can never throw here.
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function verifySignature(req, res, next) {
  const timestampHeader = req.get('X-Timestamp');
  const signatureHeader = req.get('X-Signature');

  if (!timestampHeader || !signatureHeader) {
    return res.status(401).json({ message: 'Missing signature headers' });
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp)) {
    return res.status(401).json({ message: 'Invalid timestamp' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    return res.status(401).json({ message: 'Request expired' });
  }

  if (!HEX_SHA256_PATTERN.test(signatureHeader)) {
    return res.status(401).json({ message: 'Invalid signature' });
  }

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ message: 'Expected raw audio body' });
  }

  const payload = Buffer.concat([Buffer.from(`${timestamp}.`), req.body]);
  const expectedHex = crypto
    .createHmac('sha256', config.transcriptionSharedSecret)
    .update(payload)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(expectedHex, 'hex'),
    Buffer.from(signatureHeader, 'hex'),
  );

  if (!isValid) {
    return res.status(401).json({ message: 'Invalid signature' });
  }

  next();
}

module.exports = verifySignature;
