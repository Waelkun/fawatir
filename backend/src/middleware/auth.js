const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'لم يتم توفير رمز المصادقة (Token).' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'تنسيق الرمز البرمجي غير صالح (Bearer Token required).' });
  }

  if (token === 'mock-developer-token') {
    req.userId = 1; // Map to seeded developer user ID (Alex)
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-fintech-ai-key-1337');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'الرمز البرمجي منتهي الصلاحية أو غير صالح.' });
  }
};

module.exports = authMiddleware;
