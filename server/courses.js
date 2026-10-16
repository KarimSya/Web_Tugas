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

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.course_name, c.color_code, COUNT(t.id)::integer AS task_count
       FROM courses c LEFT JOIN tasks t
         ON t.course_id = c.id AND t.user_id = c.user_id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.created_at ASC`,
      [req.user.id],
    );
    return res.json({ courses: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/',
  body('courseName').trim().isLength({ min: 2, max: 100 }),
  body('colorCode').matches(/^#[0-9a-fA-F]{6}$/),
  validate,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `INSERT INTO courses (user_id, course_name, color_code)
         VALUES ($1, $2, $3)
         RETURNING id, course_name, color_code`,
        [req.user.id, req.body.courseName, req.body.colorCode],
      );
      return res.status(201).json({ course: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Nama mata kuliah sudah digunakan.' });
      }
      return next(error);
    }
  },
);

router.patch(
  '/:id',
  param('id').isInt({ min: 1 }),
  body('courseName').optional().trim().isLength({ min: 2, max: 100 }),
  body('colorCode').optional().matches(/^#[0-9a-fA-F]{6}$/),
  validate,
  async (req, res, next) => {
    const values = [];
    const sets = [];
    if (Object.hasOwn(req.body, 'courseName')) {
      values.push(req.body.courseName);
      sets.push(`course_name = $${values.length + 2}`);
    }
    if (Object.hasOwn(req.body, 'colorCode')) {
      values.push(req.body.colorCode);
      sets.push(`color_code = $${values.length + 2}`);
    }
    if (!sets.length) return res.status(400).json({ message: 'Tidak ada perubahan yang dikirim.' });
    try {
      const result = await pool.query(
        `UPDATE courses SET ${sets.join(', ')}
         WHERE id = $1 AND user_id = $2
         RETURNING id, course_name, color_code`,
        [req.params.id, req.user.id, ...values],
      );
      if (!result.rowCount) return res.status(404).json({ message: 'Mata kuliah tidak ditemukan.' });
      return res.json({ course: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Nama mata kuliah sudah digunakan.' });
      }
      return next(error);
    }
  },
);

router.delete('/:id', param('id').isInt({ min: 1 }), validate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM courses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Mata kuliah tidak ditemukan.' });
    return res.status(204).end();
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ message: 'Mata kuliah masih digunakan oleh tugas.' });
    }
    return next(error);
  }
});

module.exports = router;
