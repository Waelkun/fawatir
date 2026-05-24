const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const register = async (req, res) => {
  const { email, password, name, baseCurrency } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان.' });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        baseCurrency: baseCurrency || 'SAR'
      }
    });

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'super-secret-fintech-ai-key-1337',
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        baseCurrency: user.baseCurrency
      }
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الحساب.' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'super-secret-fintech-ai-key-1337',
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        baseCurrency: user.baseCurrency
      }
    });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول.' });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        baseCurrency: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود.' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب بيانات الملف الشخصي.' });
  }
};

const simpleLogin = async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'الاسم مطلوب.' });
  }

  const cleanName = name.trim();
  try {
    let user = await prisma.user.findFirst({
      where: { name: cleanName }
    });

    if (!user) {
      // Create a unique dummy email matching unique constraint
      const dummyEmail = `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}@fawatir.local`;
      const hashedPassword = await bcrypt.hash('simple-no-password-login', 10);
      user = await prisma.user.create({
        data: {
          email: dummyEmail,
          password: hashedPassword,
          name: cleanName,
          baseCurrency: 'SAR'
        }
      });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'super-secret-fintech-ai-key-1337',
      { expiresIn: '365d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        baseCurrency: user.baseCurrency
      }
    });
  } catch (error) {
    console.error('Error in simple login:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول بالاسم.' });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  simpleLogin
};
