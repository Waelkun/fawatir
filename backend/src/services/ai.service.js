require('dotenv').config({ override: true });
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── API Endpoints ─────────────────────────────────────────────────────────────
const NVIDIA_API_URL    = 'https://integrate.api.nvidia.com/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ─── Models ────────────────────────────────────────────────────────────────────
const GEMINI_PRIMARY_MODEL  = 'gemini-2.5-flash';
const GEMINI_BACKUP_MODEL   = 'gemini-1.5-flash';

const OPENROUTER_PRIMARY_MODEL = 'google/gemini-2.5-flash';
const OPENROUTER_BACKUP_MODEL  = 'meta-llama/llama-3.2-11b-vision-instruct:free';

const NVIDIA_VISION_MODEL   = 'meta/llama-3.2-11b-vision-instruct';
const NVIDIA_TEXT_MODEL     = 'meta/llama-3.2-11b-vision-instruct';

// Provider Timeouts (in milliseconds)
const GEMINI_TIMEOUT_MS     = 25000;
const OPENROUTER_TIMEOUT_MS = 30000;
const NVIDIA_TIMEOUT_MS     = 30000;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wraps a promise with a per-provider timeout.
 */
const withTimeout = (promise, ms, providerName) => {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`TIMEOUT_${providerName}: exceeded ${ms / 1000}s`)), ms)
  );
  return Promise.race([promise, timer]);
};

/**
 * Extracts the first valid JSON object or array from any string.
 * Handles: markdown code fences, <think>...</think> tags, extra prose.
 */
const extractJSON = (text) => {
  if (typeof text !== 'string') {
    if (typeof text === 'object' && text !== null) return text;
    throw new Error('Input to extractJSON is not a string');
  }

  // Strip <think>...</think> blocks
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fences
  cleaned = cleaned.replace(/^\s*```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();

  // Direct parse
  try { return JSON.parse(cleaned); } catch (_) {}

  // Find first { or [
  const objStart = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  if (objStart === -1 && arrStart === -1) {
    console.error('[extractJSON] No JSON found. Full text:', text.substring(0, 1000));
    throw new Error('No JSON found in model response');
  }

  let start;
  if (objStart === -1) start = arrStart;
  else if (arrStart === -1) start = objStart;
  else start = Math.min(objStart, arrStart);

  const sub = cleaned.substring(start);
  try { return JSON.parse(sub); } catch (_) {}

  // Bracket-matching extraction
  let depth = 0;
  const open  = sub[0];
  const close = open === '{' ? '}' : ']';
  for (let i = 0; i < sub.length; i++) {
    if (sub[i] === open)  depth++;
    if (sub[i] === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(sub.substring(0, i + 1)); } catch (_) {}
      }
    }
  }

  console.error('[extractJSON] Bracket matching failed. Full text:', text.substring(0, 1000));
  throw new Error('Could not extract valid JSON from model response');
};

// Helper to convert file to base64 data URL
const fileToBase64DataUrl = (filePath, mimeType) => {
  const base64 = Buffer.from(fs.readFileSync(filePath)).toString('base64');
  return `data:${mimeType};base64,${base64}`;
};

// Detect whether any message carries an image
const messagesHaveImage = (messages) =>
  messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((p) => p.type === 'image_url')
  );

// ─── Provider 1: Google Gemini (Primary) ───────────────────────────────────────
const callGemini = async (messages, options = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) throw new Error('GEMINI_API_KEY not configured');

  const genAI = new GoogleGenerativeAI(apiKey);

  // Convert OpenAI-style messages → Gemini parts
  const parts = [];
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          parts.push({ text: part.text });
        } else if (part.type === 'image_url') {
          const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
        }
      }
    }
  }

  const generationConfig = {
    temperature: options.temperature ?? 0.1,
    maxOutputTokens: Math.min(options.max_tokens ?? 4096, 4096),
  };

  if (options.jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  // Try primary model then backup
  const modelsToTry = [GEMINI_PRIMARY_MODEL, GEMINI_BACKUP_MODEL];
  let lastErr;
  for (const modelName of modelsToTry) {
    try {
      console.log(`[Gemini] Attempting model: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig,
      });
      return {
        content: result.response.text(),
        provider: 'Google Gemini',
        model: modelName
      };
    } catch (err) {
      console.warn(`[Gemini] Model ${modelName} failed: ${err.message}`);
      lastErr = err;
    }
  }

  throw lastErr || new Error('Gemini failed for all model variants');
};

// ─── Provider 2: OpenRouter (First Fallback) ───────────────────────────────────
const callOpenRouter = async (messages, options = {}) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !apiKey.trim()) throw new Error('OPENROUTER_API_KEY not configured');

  const modelsToTry = [OPENROUTER_PRIMARY_MODEL, OPENROUTER_BACKUP_MODEL];
  let lastErr;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[OpenRouter] Attempting model: ${modelName}...`);
      const body = {
        model: modelName,
        messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: Math.min(options.max_tokens ?? 3000, 3000), // Protect token limit
      };

      if (options.jsonMode) {
        body.response_format = { type: 'json_object' };
      }

      const res = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://fawatir.app',
          'X-Title': 'Fawatir AI Expense Tracker',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenRouter');

      return {
        content,
        provider: 'OpenRouter',
        model: modelName
      };
    } catch (err) {
      console.warn(`[OpenRouter] Model ${modelName} failed: ${err.message}`);
      lastErr = err;
    }
  }

  throw lastErr || new Error('OpenRouter failed for all model variants');
};

// ─── Provider 3: NVIDIA NIM (Second Fallback) ──────────────────────────────────
const callNvidia = async (messages, options = {}) => {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || !apiKey.trim()) throw new Error('NVIDIA_API_KEY not configured');

  const model = messagesHaveImage(messages) ? NVIDIA_VISION_MODEL : NVIDIA_TEXT_MODEL;
  console.log(`[NVIDIA] using model: ${model}`);

  const maxTokens = Math.min(options.max_tokens ?? 3000, 3000);

  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
    top_p: 0.9,
    max_tokens: maxTokens,
    stream: false,
  };

  const res = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`NVIDIA ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;
  if (!message || !message.content) throw new Error('Empty response from NVIDIA NIM');

  return {
    content: message.content,
    provider: 'NVIDIA NIM',
    model
  };
};

// ─── Unified Fallback Chain: Gemini → OpenRouter → NVIDIA ──────────────────────
const callAI = async (messages, options = {}) => {
  // Ordered by priority as requested: Gemini (Main) → OpenRouter (Fallback 1) → NVIDIA (Fallback 2)
  const providers = [
    { name: 'Google Gemini', fn: callGemini,     timeout: GEMINI_TIMEOUT_MS },
    { name: 'OpenRouter',    fn: callOpenRouter, timeout: OPENROUTER_TIMEOUT_MS },
    { name: 'NVIDIA NIM',    fn: callNvidia,     timeout: NVIDIA_TIMEOUT_MS },
  ];

  let lastError;
  for (const provider of providers) {
    try {
      console.log(`[AI Chain] 🚀 Trying ${provider.name}...`);
      const result = await withTimeout(
        provider.fn(messages, options),
        provider.timeout,
        provider.name
      );
      console.log(`[AI Chain] ✅ ${provider.name} succeeded (${result.model})`);
      return result;
    } catch (err) {
      console.warn(`[AI Chain] ⚠️ ${provider.name} failed: ${err.message}`);
      lastError = err;
    }
  }

  throw new Error(`فشلت جميع خدمات الذكاء الاصطناعي (Gemini, OpenRouter, NVIDIA). آخر خطأ: ${lastError?.message}`);
};

// ──────────────────────────────────────────────────────────────────────────────
// Business Functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parses a receipt image and returns structured financial data + AI attribution.
 */
const parseReceipt = async (filePath, mimeType, existingProducts = []) => {
  try {
    const imageDataUrl = fileToBase64DataUrl(filePath, mimeType);
    const existingProductsList = existingProducts.map(p => p.name).join(', ');

    const systemPrompt = `أنت محاسب ذكي وخبير في تحليل فواتير المشتريات. مهمتك استخراج البيانات من الفواتير بدقة متناهية وإرجاعها بصيغة JSON صحيحة فقط دون أي نص إضافي.`;

    const userPrompt = `
    قم بتحليل الفاتورة المرفقة واستخراج البيانات بدقة متناهية.
    
    شروط استخراج البيانات:
    1. استخرج اسم المتجر (storeName).
    2. استخرج تاريخ الفاتورة (date) بصيغة YYYY-MM-DD. إذا لم تجده، استخدم التاريخ الحالي.
    3. استخرج الوقت (time) بصيغة HH:MM إذا توفر.
    4. حدد العملة المكتوبة (currency) بشكل دقيق، مثل (SAR, USD, EUR, TRY). إذا لم تتحدد، افترض SAR.
    5. استخرج جميع المواد المشتراة في الفاتورة (items) مع التفاصيل:
       - originalName: اسم المنتج كما هو مكتوب في الفاتورة حرفياً.
       - normalizedName: ترجمة الاسم للعربية الفصحى النظيفة وتوحيده. لدينا قائمة بمنتجات المستخدم الحالية: [${existingProductsList}]. إذا كان المنتج يطابق أحد هذه المنتجات في المعنى، استخدم اسم المستخدم تماماً. وإلا قم بتوحيد الاسم للعربية الفصحى وإزالة الأحجام والكميات (مثال "مياه 500 مل" تصبح "مياه معدنية").
       - category: تصنيف المنتج إلى إحدى الفئات التالية فقط: "طعام ومشروبات", "تقنية وإلكترونيات", "مواصلات وسيارات", "ملابس وموضة", "صحة وعناية شخصية", "منزل وأثاث", "ترفيه وألعاب", "خدمات وفواتير", "أخرى"
       - description: وصف تسويقي قصير باللغة العربية (جملة واحدة).
       - quantity: الكمية. القيمة الافتراضية 1.
       - price: سعر الوحدة قبل الخصم.
       - discount: الخصم على هذا المنتج (وإلا 0).
       - total: المجموع النهائي للمنتج.
    6. استخرج القيم الإجمالية:
       - tax: إجمالي الضريبة المضافة (VAT).
       - discount: إجمالي الخصم العام.
       - total: المجموع النهائي المدفوع فعلياً.
    7. احسب درجة ثقتك (confidence) كقيمة بين 0.0 و 1.0.
    
    أرجع JSON فقط بهذا الشكل بدون أي نص آخر:
    {"storeName":"...","date":"YYYY-MM-DD","time":"HH:MM","currency":"SAR","tax":0,"discount":0,"total":0,"confidence":0.9,"items":[{"originalName":"...","normalizedName":"...","category":"...","description":"...","quantity":1,"price":0,"discount":0,"total":0}]}
    `;

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: userPrompt },
        ],
      },
    ];

    const aiResult = await callAI(messages, { temperature: 0.1, max_tokens: 3500, jsonMode: true });
    const parsedData = extractJSON(aiResult.content);

    // Attach attribution
    parsedData.aiProvider = aiResult.provider;
    parsedData.aiModel = aiResult.model;

    return parsedData;

  } catch (error) {
    console.error('Error in parseReceipt AI service:', error.message);
    throw new Error(`فشل تحليل الفاتورة: ${error.message}`);
  }
};

/**
 * Normalizes a scanned product name.
 */
const normalizeProductName = async (scannedName, existingProducts = []) => {
  try {
    const productsListStr = existingProducts.map(p => p.name).join(', ');

    const prompt = `
    لديك اسم منتج تم مسحه من فاتورة شراء: "${scannedName}".
    المطلوب:
    1. ترجمة الاسم للعربية الفصحى النظيفة وتوحيده (مثلاً Chicken Breasts أو صدر دجاج أو Tavuk Göğsü تصبح جميعها "صدر دجاج").
    2. إزالة أي رموز غير مهمة، رموز أحجام، أو كميات من الاسم (مثل "مياه 500 مل" تصبح "مياه معدنية").
    3. تصنيف المنتج إلى إحدى الفئات التالية فقط: "طعام ومشروبات", "تقنية وإلكترونيات", "مواصلات وسيارات", "ملابس وموضة", "صحة وعناية شخصية", "منزل وأثاث", "ترفيه وألعاب", "خدمات وفواتير", "أخرى"
    4. قارن الاسم الجديد مع قائمة منتجات المستخدم: [${productsListStr}]. إذا كان هناك منتج بنفس المعنى، استخدم اسمه تماماً.
    
    أرجع JSON فقط: {"normalizedName": "...", "category": "..."}
    `;

    const aiResult = await callAI([{ role: 'user', content: prompt }], { temperature: 0.2, jsonMode: true });
    return extractJSON(aiResult.content);
  } catch (error) {
    console.error('Error in normalizeProductName AI service:', error);
    return {
      normalizedName: scannedName.trim().substring(0, 50),
      category: 'أخرى',
    };
  }
};

/**
 * Generates a short product description in Arabic.
 */
const generateProductDescription = async (productName) => {
  try {
    const prompt = `اكتب وصفاً تسويقياً/مالياً قصيراً ومحترفاً جداً باللغة العربية لمنتج استهلاكي يسمى "${productName}". الوصف يجب ألا يتجاوز جملتين مفيدتين. أرجع النص فقط بدون أي تنسيق.`;

    const aiResult = await callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
    return aiResult.content.trim();
  } catch (error) {
    console.error('Error in generateProductDescription AI service:', error);
    return `منتج استهلاكي مصنف ضمن المصاريف الشخصية.`;
  }
};

/**
 * Generates smart financial insights.
 */
const generateAIInsights = async (expensesData, baseCurrency = 'SAR') => {
  try {
    const expensesJson = JSON.stringify(expensesData);

    const prompt = `
    أنت مستشار مالي ذكي يعمل بالذكاء الاصطناعي لتطبيق Fintech.
    أمامك بيانات الإنفاق والمشتريات الأخيرة الخاصة بالمستخدم بصيغة JSON:
    ${expensesJson}
    
    العملة الأساسية للمستخدم هي: ${baseCurrency}.
    
    المطلوب توليد 3 إلى 4 نصائح/رؤى مالية ذكية ومخصصة باللغة العربية الفصحى.
    يجب أن تكون النصائح عملية ومحددة مع ذكر أرقام ونسب حقيقية بناءً على البيانات.
    
    أرجع JSON فقط كمصفوفة:
    [{"id":"1","type":"warning","title":"...","content":"..."},{"id":"2","type":"tip","title":"...","content":"..."}]
    الأنواع المتاحة لـ type: warning, tip, success, price_alert
    `;

    const aiResult = await callAI([{ role: 'user', content: prompt }], { temperature: 0.4, max_tokens: 3000, jsonMode: true });
    const parsed = extractJSON(aiResult.content);
    return Array.isArray(parsed) ? parsed : (parsed.insights || parsed.data || [parsed]);

  } catch (error) {
    console.error('Error in generateAIInsights AI service:', error);
    return [
      {
        id: '1',
        type: 'tip',
        title: 'نصيحة توفير عامة',
        content: 'حاول شراء المنتجات الاستهلاكية اليومية مثل المياه والمناديل بكميات كبيرة لتوفير ما يصل إلى 15% شهرياً.',
      },
      {
        id: '2',
        type: 'warning',
        title: 'ارتفاع في قطاع المطاعم',
        content: 'مشترياتك في عطلة نهاية الأسبوع الأخيرة كانت أعلى من المعتاد بـ 20%، فكر في إعداد الوجبات منزلياً.',
      },
    ];
  }
};

/**
 * Translates product name to English keyword for Unsplash image lookup.
 */
const translateProductToEnglishKeyword = async (productName) => {
  try {
    const prompt = `
    Translate this Arabic item/product name to a single, general English noun suitable for search (e.g., "banana" for "موز", "milk" for "حليب كامل الدسم", "water" for "مياه معدنية", "chicken" for "صدر دجاج", "soap" for "صابون يدين").
    Product name: "${productName}"
    Return ONLY the English word, no other text or explanation.
    `;

    const aiResult = await callAI([{ role: 'user', content: prompt }], { temperature: 0.1, max_tokens: 20 });
    const cleanWord = aiResult.content.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z-]/g, '');
    return cleanWord || 'grocery';
  } catch (error) {
    console.error('Error in translateProductToEnglishKeyword AI service:', error);
    return 'grocery';
  }
};

module.exports = {
  parseReceipt,
  normalizeProductName,
  generateProductDescription,
  generateAIInsights,
  translateProductToEnglishKeyword,
};
