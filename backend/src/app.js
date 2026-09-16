const cors = require('cors');
const express = require('express');

const identityRoutes = require('./routes/identityRoutes');
const developerRoutes = require('./routes/developerRoutes');
const verificationRoutes = require('./routes/verificationRoutes');
const assetRoutes = require('./routes/assetRoutes');
const roleRoutes = require('./routes/roleRoutes');
const auditRoutes = require('./routes/auditRoutes');

const app = express();
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : null;

app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'BLAuth backend',
  });
});

app.use('/identity', identityRoutes);
app.use('/developer', developerRoutes);
app.use('/verify', verificationRoutes);
app.use('/asset', assetRoutes);
app.use('/role', roleRoutes);
app.use('/audit', auditRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist.',
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;

  if (status >= 500) {
    console.error('Unexpected server error', {
      name: err.name,
      code: err.code || 'UNKNOWN',
    });

    return res.status(500).json({
      error: 'Internal server error',
    });
  }

  res.status(status).json({
    error: 'Request Error',
    message: err.message,
  });
});

module.exports = app;
