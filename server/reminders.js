const cron = require('node-cron');
const webpush = require('web-push');
const pool = require('./db');

const reminderTypes = [
  { type: '24h', interval: '24 hours' },
  { type: '3h', interval: '3 hours' },
];

async function deliver(task, deliveryId) {
  const subscriptions = task.push_subscription;
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    await pool.query(
      `UPDATE reminder_deliveries
       SET status = 'sent', attempts = attempts + 1, sent_at = NOW()
       WHERE id = $1`,
      [deliveryId],
    );
    return;
  }

  const payload = JSON.stringify({
    title: task.reminder_type === '24h' ? 'Deadline besok' : 'Deadline tinggal 3 jam',
    body: `${task.title} · ${task.course_name}`,
    url: '/',
    taskId: task.id,
  });
  const outcomes = await Promise.allSettled(
    subscriptions.map((subscription) => webpush.sendNotification(subscription, payload)),
  );
  const invalidEndpoints = [];
  const failures = [];
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'rejected') {
      failures.push(outcome.reason.message || 'Pengiriman push gagal.');
      if (outcome.reason.statusCode === 404 || outcome.reason.statusCode === 410) {
        invalidEndpoints.push(subscriptions[index].endpoint);
      }
    }
  });

  if (invalidEndpoints.length) {
    const remaining = subscriptions.filter(
      (subscription) => !invalidEndpoints.includes(subscription.endpoint),
    );
    await pool.query(
      'UPDATE users SET push_subscription = $2::jsonb WHERE id = $1',
      [task.user_id, JSON.stringify(remaining)],
    );
  }

  if (failures.length === 0) {
    await pool.query(
      `UPDATE reminder_deliveries
       SET status = 'sent', attempts = attempts + 1, sent_at = NOW(), last_error = NULL
       WHERE id = $1`,
      [deliveryId],
    );
  } else {
    await pool.query(
      `UPDATE reminder_deliveries
       SET attempts = attempts + 1, last_error = $2
       WHERE id = $1`,
      [deliveryId, failures.join('; ').slice(0, 1000)],
    );
    console.error(`Push reminder delivery ${deliveryId} failed:`, failures.join('; '));
  }
}

async function checkReminders() {
  for (const reminder of reminderTypes) {
    const candidates = await pool.query(
      `SELECT t.id, t.user_id, t.title, c.course_name, u.push_subscription,
              d.id AS delivery_id
       FROM tasks t
       JOIN users u ON u.id = t.user_id
       JOIN courses c ON c.id = t.course_id AND c.user_id = t.user_id
       LEFT JOIN reminder_deliveries d
         ON d.task_id = t.id AND d.reminder_type = $1
       WHERE t.is_completed = FALSE
         AND t.deadline > NOW()
         AND (
           d.status = 'pending'
           OR (
             d.id IS NULL
             AND t.deadline <= NOW() + $2::interval
             AND t.deadline > NOW() + $2::interval - INTERVAL '12 minutes'
           )
         )
       ORDER BY t.deadline ASC
       LIMIT 100`,
      [reminder.type, reminder.interval],
    );

    for (const task of candidates.rows) {
      let deliveryId = task.delivery_id;
      if (!deliveryId) {
        const inserted = await pool.query(
          `INSERT INTO reminder_deliveries (task_id, reminder_type)
           VALUES ($1, $2)
           ON CONFLICT (task_id, reminder_type) DO NOTHING
           RETURNING id`,
          [task.id, reminder.type],
        );
        if (!inserted.rowCount) continue;
        deliveryId = inserted.rows[0].id;
      }
      await deliver({ ...task, reminder_type: reminder.type }, deliveryId);
    }
  }
}

function startReminderWorker() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('Web Push disabled: VAPID keys are not configured.');
    return;
  }
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await checkReminders();
    } catch (error) {
      console.error('Reminder worker failed:', error);
    } finally {
      running = false;
    }
  };
  cron.schedule('*/10 * * * *', run);
  run();
}

module.exports = { startReminderWorker, checkReminders };
