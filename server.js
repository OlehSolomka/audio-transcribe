const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const transcribeRouter = require('./routes/transcribe');

const app = express();

// The deploy platform terminates TLS and proxies every request through one
// hop before it reaches this container. Without this, req.ip always
// resolves to that proxy's internal address instead of the real caller --
// which would make the rate limiter below bucket all traffic as a single
// "client" instead of limiting per actual source.
app.set('trust proxy', 1);

app.use(helmet());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(transcribeRouter);

app.use((req, res) => {
  res.status(404).json({ message: 'Not found page' });
});

app.use((err, req, res, next) => {
  const { status = 500, message = 'Server Error' } = err;
  res.status(status).json({ message });
});

const server = app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});
server.on('error', (error) => {
  console.error('Error starting the server:', error);
  process.exit(1);
});
