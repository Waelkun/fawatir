const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── API Endpoints ─────────────────────────────────────────────────────────────
const NVIDIA_API_URL    = 'https://integrate.api.nvidia.com/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ─── Models ────────────────────────────────────────────────────────────────────
const NVIDIA_MODEL      = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
const GEMINI_MODEL      = 'gemini-2.5-flash';
const OPENROUTER_MODEL  = 'google/gemini-2.5-flash';

// NVIDIA always times out — try it fast (20s) then move to Gemini/OpenRouter
const NVIDIA_TIMEOUT_MS = 20000;
const FALLBACK_TIMEOUT_MS = 60000;

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
 * Handles: markdown code fences, <think>...</think> tags (Nemotron), extra prose.
 */
const extractJSON = (text) => {
  // Log first 500 chars to help debug unexpected model output
  console.log('[extractJSON] raw input:', text.substring(0, 500));

  // Strip <think>...</think> blocks (Nemotron reasoning in content)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fences (handle optional leading whitespace before backticks)
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

// ─── Provider 1: NVIDIA NIM ────────────────────────────────────────────────────
/**
 * Calls NVIDIA NIM API (OpenAI-compatible, supports vision + text).
 * Reasoning is disabled to stay within timeout limits.
 */
const callNvidia = async (messages, options = {}) => {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || !apiKey.trim()) throw new Error('NVIDIA_API_KEY not configured');

  // Use only standard OpenAI-compatible fields — no custom/unsupported params
  const body = {
    model: NVIDIA_MODEL,
    messages,
    temperature: options.temperature ?? 0.4,
    top_p: 0.9,
    max_tokens: options.max_tokens ?? 4096,
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
  const message = data.choices[0].message;

  // Nemotron may put reasoning in reasoning_content OR inside <think> tags in content
  if (message.reasoning_content) {
    console.log('[NVIDIA Reasoning snippet]:', message.reasoning_content.substring(0, 150));
  }

  // Return only the actual content (extractJSON will strip <think> tags if present)
  return message.content || '';
};

// ─── Provider 2: Google Gemini (direct SDK) ────────────────────────────────────
/**
 * Calls Gemini API directly via the official SDK.
 * Converts OpenAI-style messages (including image_url) to Gemini format.
 */
const callGemini = async (messages, options = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) throw new Error('GEMINI_API_KEY not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

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
          // Extract base64 data from data URL
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
    maxOutputTokens: options.max_tokens ?? 8192,
  };

  // Use Gemini's native JSON mode for guaranteed clean JSON (no code fences)
  if (options.jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
    generationConfig,
  });

  return result.response.text();
};

// ─── Provider 3: OpenRouter ────────────────────────────────────────────────────
/**
 * Calls OpenRouter API (OpenAI-compatible, supports image_url format).
 */
const callOpenRouter = async (messages, options = {}) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !apiKey.trim()) throw new Error('OPENROUTER_API_KEY not configured');

  const body = {
    model: OPENROUTER_MODEL,
    messages,
    temperature: options.temperature ?? 0.1,
    max_tokens: options.max_tokens ?? 8192,
  };

  // OpenRouter supports OpenAI-style JSON mode
  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://fawatir.app',
      'X-Title': 'Fawatir',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
};

// ─── Unified Fallback Caller ───────────────────────────────────────────────────
/**
 * Tries AI providers in order: NVIDIA → Gemini → OpenRouter.
 * Each provider gets PROVIDER_TIMEOUT_MS before the next one is tried.
 */
const callAI = async (messages, options = {}) => {
  const providers = [
    { name: 'NVIDIA',      fn: callNvidia,     timeout: NVIDIA_TIMEOUT_MS },
    { name: 'Gemini',      fn: callGemini,     timeout: FALLBACK_TIMEOUT_MS },
    { name: 'OpenRouter',  fn: callOpenRouter,  timeout: FALLBACK_TIMEOUT_MS },
  ];

  let lastError;
  for (const provider of providers) {
    try {
      console.log(`[AI] Trying ${provider.name}...`);
      const result = await withTimeout(
        provider.fn(messages, options),
        provider.timeout,
        provider.name
      );
      console.log(`[AI] ${provider.name} succeeded ✓`);
      return result;
    } catch (err) {
      console.warn(`[AI] ${provider.name} failed: ${err.message}`);
      lastError = err;
    }
  }

  throw new Error(`فشلت جميع خدمات الذكاء الاصطناعي. آخر خطأ: ${lastError?.message}`);
};

// ──────────────────────────────────────────────────────────────────────────────
// Business Functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parses a receipt image and returns structured financial data.
 * Uses the unified fallback chain: NVIDIA → Gemini → OpenRouter.
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

    const text = await callAI(messages, { temperature: 0.1, max_tokens: 16384, jsonMode: true });
    console.log('AI Parse Output:', text.substring(0, 300));
    return extractJSON(text);

  } catch (error) {
    console.error('Error in parseReceipt AI service:', error.message);
    if (error.message.toLowerCase().includes('timeout') || error.message.toLowerCase().includes('exceeded')) {
      throw new Error('انتهت مهلة الاتصال بالذكاء الاصطناعي. يرجى التحقق من اتصالك بالإنترنت والمحاولة مجدداً.');
    }
    if (error.message.includes('429') || error.message.toLowerCase().includes('quota') || error.message.toLowerCase().includes('limit')) {
      throw new Error('تجاوزت الحد المسموح لطلب تحليل الفاتورة حالياً. يرجى الانتظار دقيقة واحدة والمحاولة مرة أخرى.');
    }
    throw new Error(`فشل الذكاء الاصطناعي في قراءة الفاتورة: ${error.message}`);
  }
};


/**
 * Normalizes a scanned product name, translating it to clean Arabic and classifying it.
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

    const text = await callAI([{ role: 'user', content: prompt }], { temperature: 0.2, jsonMode: true });
    return extractJSON(text);
  } catch (error) {
    console.error('Error in normalizeProductName AI service:', error);
    return {
      normalizedName: scannedName.trim().substring(0, 50),
      category: 'أخرى',
    };
  }
};

/**
 * Generates a short, professional product description in Arabic.
 */
const generateProductDescription = async (productName) => {
  try {
    const prompt = `اكتب وصفاً تسويقياً/مالياً قصيراً ومحترفاً جداً باللغة العربية لمنتج استهلاكي يسمى "${productName}". الوصف يجب ألا يتجاوز جملتين مفيدتين. أرجع النص فقط بدون أي تنسيق.`;

    const text = await callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
    return text.trim();
  } catch (error) {
    console.error('Error in generateProductDescription AI service:', error);
    return `منتج استهلاكي مصنف ضمن المصاريف الشخصية.`;
  }
};

/**
 * Generates smart financial insights based on recent user expenses.
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

    const text = await callAI([{ role: 'user', content: prompt }], { temperature: 0.4, max_tokens: 4096, jsonMode: true });
    const parsed = extractJSON(text);
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

const getMockReceiptData = () => {
  return {
    storeName: 'هايبر بنده (Hyper Panda)',
    date: new Date().toISOString().split('T')[0],
    time: '18:30',
    currency: 'SAR',
    tax: 15.00,
    discount: 5.00,
    total: 115.00,
    confidence: 0.95,
    items: [
      {
        originalName: 'حليب طويل الأجل المراعي 4*1 لتر',
        normalizedName: 'حليب كامل الدسم',
        category: 'طعام ومشروبات',
        description: 'حليب سائل كامل الدسم معقم ومناسب للاستهلاك اليومي.',
        quantity: 1,
        price: 22.00,
        discount: 2.00,
        total: 20.00,
      },
      {
        originalName: 'أرز بسمتي الشعلان 5 كج',
        normalizedName: 'أرز بسمتي',
        category: 'طعام ومشروبات',
        description: 'أرز بسمتي هندي أبيض طويل الحبة ممتاز للوجبات الرئيسية.',
        quantity: 1,
        price: 45.00,
        discount: 0.00,
        total: 45.00,
      },
      {
        originalName: 'دجاج مجمد دو 1000 جرام',
        normalizedName: 'دجاج مجمد',
        category: 'طعام ومشروبات',
        description: 'دجاج كامل مجمد جاهز للطهي.',
        quantity: 2,
        price: 20.00,
        discount: 0.00,
        total: 40.00,
      },
      {
        originalName: 'صابون يدين لايفبوي 200 مل',
        normalizedName: 'صابون يدين',
        category: 'صحة وعناية شخصية',
        description: 'منظف ومطهر سائل للعناية باليدين وحمايتهما من الجراثيم.',
        quantity: 1,
        price: 15.00,
        discount: 3.00,
        total: 12.00,
      },
    ],
  };
};

/**
 * Translates an Arabic product name into a simple English keyword for image lookup.
 */
const translateProductToEnglishKeyword = async (productName) => {
  try {
    const prompt = `
    Translate this Arabic item/product name to a single, general English noun suitable for search (e.g., "banana" for "موز", "milk" for "حليب كامل الدسم", "water" for "مياه معدنية", "chicken" for "صدر دجاج", "soap" for "صابون يدين").
    Product name: "${productName}"
    Return ONLY the English word, no other text or explanation.
    `;

    const text = await callAI([{ role: 'user', content: prompt }], { temperature: 0.1, max_tokens: 20 });
    const cleanWord = text.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z-]/g, '');
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
