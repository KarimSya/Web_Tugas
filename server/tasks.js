const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('./db');

const router = express.Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Data tidak valid.', errors: errors.array() });
  }
  next();
}

const taskFields = `
  t.id, t.course_id, t.title, t.description, t.deadline, t.priority,
  t.is_completed, t.created_at, c.course_name, c.color_code`;

router.get('/', async (req, res, next) => {
  try {
    const values = [req.user.id];
    const conditions = ['t.user_id = $1'];
    if (req.query.courseId) {
      values.push(req.query.courseId);
      conditions.push(`t.course_id = $${values.length}`);
    }
    if (req.query.status === 'active') conditions.push('t.is_completed = FALSE');
    if (req.query.status === 'completed') conditions.push('t.is_completed = TRUE');
    if (req.query.q) {
      values.push(`%${String(req.query.q).slice(0, 100)}%`);
      conditions.push(`(t.title ILIKE $${values.length} OR t.description ILIKE $${values.length})`);
    }
    const result = await pool.query(
      `SELECT ${taskFields}
       FROM tasks t JOIN courses c
         ON c.id = t.course_id AND c.user_id = t.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.is_completed ASC, t.deadline ASC`,
      values,
    );
    return res.json({ tasks: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/',
  body('title').trim().isLength({ min: 1, max: 200 }),
  body('description').optional().isString().isLength({ max: 5000 }),
  body('courseId').isInt({ min: 1 }),
  body('deadline').isISO8601({ strict: true }),
  body('priority').isIn(['low', 'medium', 'high']),
  validate,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `INSERT INTO tasks (user_id, course_id, title, description, deadline, priority)
         SELECT $1, c.id, $3, $4, $5, $6
         FROM courses c WHERE c.id = $2 AND c.user_id = $1
         RETURNING id`,
        [
          req.user.id,
          req.body.courseId,
          req.body.title,
          req.body.description || '',
          req.body.deadline,
          req.body.priority,
        ],
      );
      if (!result.rowCount) {
        return res.status(400).json({ message: 'Mata kuliah tidak ditemukan.' });
      }
      const task = await getTask(req.user.id, result.rows[0].id);
      return res.status(201).json({ task });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/:id',
  param('id').isInt({ min: 1 }),
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().isString().isLength({ max: 5000 }),
  body('courseId').optional().isInt({ min: 1 }),
  body('deadline').optional().isISO8601({ strict: true }),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('isCompleted').optional().isBoolean(),
  validate,
  async (req, res, next) => {
    const allowed = {
      title: ['title', req.body.title],
      description: ['description', req.body.description],
      courseId: ['course_id', req.body.courseId],
      deadline: ['deadline', req.body.deadline],
      priority: ['priority', req.body.priority],
      isCompleted: ['is_completed', req.body.isCompleted],
    };
    const updates = Object.entries(allowed)
      .filter(([key]) => Object.hasOwn(req.body, key))
      .map(([, value]) => value);
    if (!updates.length) {
      return res.status(400).json({ message: 'Tidak ada perubahan yang dikirim.' });
    }
    try {
      const courseUpdateIndex = updates.findIndex(([column]) => column === 'course_id');
      const columns = updates.map(([column], index) => `${column} = $${index + 3}`);
      const values = [req.user.id, req.params.id, ...updates.map(([, value]) => value)];
      const result = await pool.query(
        `UPDATE tasks t SET ${columns.join(', ')}
         WHERE t.user_id = $1 AND t.id = $2
         ${courseUpdateIndex >= 0
           ? `AND EXISTS (SELECT 1 FROM courses c WHERE c.id = $${courseUpdateIndex + 3} AND c.user_id = $1)`
           : ''}
         RETURNING t.id`,
        values,
      );
      if (!result.rowCount) {
        const exists = await pool.query(
          'SELECT 1 FROM tasks WHERE id = $1 AND user_id = $2',
          [req.params.id, req.user.id],
        );
        return res.status(exists.rowCount ? 400 : 404).json({
          message: exists.rowCount ? 'Mata kuliah tidak ditemukan.' : 'Tugas tidak ditemukan.',
        });
      }
      return res.json({ task: await getTask(req.user.id, req.params.id) });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete('/:id', param('id').isInt({ min: 1 }), validate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Tugas tidak ditemukan.' });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

async function getTask(userId, taskId) {
  const result = await pool.query(
    `SELECT ${taskFields}
     FROM tasks t JOIN courses c
       ON c.id = t.course_id AND c.user_id = t.user_id
     WHERE t.id = $1 AND t.user_id = $2`,
    [taskId, userId],
  );
  return result.rows[0];
}

module.exports = router;
