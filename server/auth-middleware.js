const jwt = require('jsonwebtoken');
const { COOKIE_NAME } = require('./auth');

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ message: 'Silakan masuk untuk melanjutkan.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'task-reminder',
    });
    req.user = { id: payload.sub, name: payload.name };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Sesi berakhir. Silakan masuk kembali.' });
  }
}

module.exports = requireAuth;
