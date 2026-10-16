require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pool = require('./server/db');
const { router: authRouter } = require('./server/auth');
const requireAuth = require('./server/auth-middleware');
const taskRouter = require('./server/tasks');
const courseRouter = require('./server/courses');
const { router: pushRouter, configureVapid } = require('./server/push');
const { startReminderWorker } = require('./server/reminders');

const app = express();
const port = Number(process.env.PORT) || 3000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters.');
}

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
}));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Terlalu banyak percobaan. Coba lagi beberapa saat.' },
});

app.use('/api/auth', authLimiter, authRouter);
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));
app.use('/api/tasks', requireAuth, taskRouter);
app.use('/api/courses', requireAuth, courseRouter);
app.use('/api/push', requireAuth, pushRouter);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Endpoint tidak ditemukan.' });
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
});

async function start() {
  await pool.query('SELECT 1');
  configureVapid();
  app.listen(port, () => {
    console.log(`Task Reminder berjalan di http://localhost:${port}`);
    startReminderWorker();
  });
}

start().catch((error) => {
  console.error('Server gagal dimulai:', error);
  process.exitCode = 1;
});
