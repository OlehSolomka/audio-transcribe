const express = require('express');

const app = express();

app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT


app.use((req, res) => {
  res.status(404).json({ message: 'Not found page' });
});

app.use((err, req, res, next) => {
  const { status = 500, message = 'Server Error' } = err;
  res.status(status).json({ message });
});

try {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
} catch (error) {
  console.error('Error starting the server:', error);
  process.exit(1);
}
