const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('./db');

const router = express.Router();
const COOKIE_NAME = 'task_session';
const SESSION_DAYS = 7;

const defaultCourses = [
  ['Algoritma & Pemrograman', '#6c63ff'],
  ['Struktur Data', '#f97316'],
  ['Basis Data', '#0ea5e9'],
  ['Matematika Diskrit', '#ec4899'],
  ['Jaringan Komputer', '#14b8a6'],
  ['Sistem Operasi', '#8b5cf6'],
  ['Rekayasa Perangkat Lunak', '#eab308'],
  ['Kecerdasan Buatan', '#ef4444'],
  ['Interaksi Manusia & Komputer', '#22c55e'],
];

function validationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Data tidak valid.', errors: errors.array() });
  }
  next();
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function setSessionCookie(res, user) {
  const token = jwt.sign(
    { sub: String(user.id), name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: `${SESSION_DAYS}d`, issuer: 'task-reminder' },
  );
  res.cookie(COOKIE_NAME, token, sessionCookieOptions());
}

router.post(
  '/register',
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('password')
    .isString()
    .isLength({ min: 8, max: 72 })
    .custom((value) => Buffer.byteLength(value, 'utf8') <= 72),
  validationErrors,
  async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const passwordHash = await bcrypt.hash(req.body.password, 12);
      const result = await client.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        [req.body.name, req.body.email, passwordHash],
      );
      const user = result.rows[0];
      for (const [courseName, colorCode] of defaultCourses) {
        await client.query(
          'INSERT INTO courses (user_id, course_name, color_code) VALUES ($1, $2, $3)',
          [user.id, courseName, colorCode],
        );
      }
      await client.query('COMMIT');
      setSessionCookie(res, user);
      return res.status(201).json({ user });
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Registration rollback failed:', rollbackError);
        }
      }
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Email tersebut sudah terdaftar.' });
      }
      return next(error);
    } finally {
      if (client) client.release();
    }
  },
);

router.post(
  '/login',
  body('email').trim().isEmail().normalizeEmail(),
  body('password')
    .isString()
    .isLength({ min: 1, max: 72 })
    .custom((value) => Buffer.byteLength(value, 'utf8') <= 72),
  validationErrors,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        'SELECT id, name, email, password_hash FROM users WHERE email = $1',
        [req.body.email],
      );
      const user = result.rows[0];
      const validPassword = user
        ? await bcrypt.compare(req.body.password, user.password_hash)
        : false;
      if (!validPassword) {
        return res.status(401).json({ message: 'Email atau kata sandi tidak sesuai.' });
      }
      setSessionCookie(res, user);
      return res.json({ user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.status(204).end();
});

module.exports = { router, COOKIE_NAME };
