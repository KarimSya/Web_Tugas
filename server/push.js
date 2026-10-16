const express = require('express');
const webpush = require('web-push');
const pool = require('./db');

const router = express.Router();

function configureVapid() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  return true;
}

router.get('/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(503).json({ message: 'Notifikasi belum dikonfigurasi di server.' });
  }
  return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post('/subscription', async (req, res, next) => {
  const subscription = req.body;
  if (
    !subscription ||
    typeof subscription.endpoint !== 'string' ||
    !subscription.endpoint.startsWith('https://') ||
    !subscription.keys ||
    typeof subscription.keys.p256dh !== 'string' ||
    typeof subscription.keys.auth !== 'string'
  ) {
    return res.status(400).json({ message: 'Data subscription notifikasi tidak valid.' });
  }
  try {
    const result = await pool.query(
      `UPDATE users
       SET push_subscription =
         COALESCE(
           (SELECT jsonb_agg(item)
            FROM jsonb_array_elements(users.push_subscription) AS entries(item)
            WHERE item->>'endpoint' <> $2),
           '[]'::jsonb
         ) || $3::jsonb
       WHERE id = $1`,
      [req.user.id, subscription.endpoint, JSON.stringify([subscription])],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    return res.status(201).json({ message: 'Notifikasi berhasil diaktifkan.' });
  } catch (error) {
    return next(error);
  }
});

router.delete('/subscription', async (req, res, next) => {
  const endpoint = req.body && req.body.endpoint;
  if (typeof endpoint !== 'string') {
    return res.status(400).json({ message: 'Endpoint subscription wajib diisi.' });
  }
  try {
    await pool.query(
      `UPDATE users
       SET push_subscription = COALESCE(
         (SELECT jsonb_agg(item)
          FROM jsonb_array_elements(users.push_subscription) AS entries(item)
          WHERE item->>'endpoint' <> $2),
         '[]'::jsonb
       )
       WHERE id = $1`,
      [req.user.id, endpoint],
    );
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = { router, configureVapid };
