const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

// Initialize Gemini API
const getGenAIInstance = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY غير موجود في إعدادات السيرفر.");
  }
  return new GoogleGenerativeAI(apiKey);
};

// Mock GenerativeModel with Fallback
const getGenerativeModelWithFallback = (modelName) => {
  return {
    generateContent: async (params) => {
      let promptText = "";
      let imagePart = null;
      let jsonSchema = null;
      let temperature = 0.1;
      let responseMimeType = null;

      const isString = typeof params === 'string';
      if (isString) {
        promptText = params;
      } else {
        const parts = params.contents && params.contents[0] && params.contents[0].parts;
        if (parts) {
          for (const part of parts) {
            if (part.text) promptText = part.text;
            if (part.inlineData) imagePart = part;
          }
        }
        if (params.generationConfig) {
          jsonSchema = params.generationConfig.responseSchema;
          temperature = params.generationConfig.temperature || 0.1;
          responseMimeType = params.generationConfig.responseMimeType;
        }
      }

      try {
        const openRouterKey = process.env.OPENROUTER_API_KEY;
        if (openRouterKey && openRouterKey.trim() !== "") {
          const content = [];
          
          let finalPrompt = promptText;
          if (responseMimeType === "application/json" && jsonSchema) {
            finalPrompt += "\n\nIMPORTANT: You must return ONLY a valid JSON object that adheres exactly to this JSON schema:\n" + JSON.stringify(jsonSchema);
          }

          content.push({ type: "text", text: finalPrompt });

          if (imagePart) {
            content.push({
              type: "image_url",
              image_url: { url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` }
            });
          }

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openRouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost:5000",
              "X-Title": "Fawatir"
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "user", content: content }],
              temperature: temperature,
              response_format: responseMimeType === "application/json" ? { type: "json_object" } : undefined
            })
          });

          if (response.ok) {
            const data = await response.json();
            let text = data.choices[0].message.content;
            
            if (responseMimeType === "application/json") {
              text = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
            }
            console.log("OpenRouter API used successfully.");
            return { response: { text: () => text } };
          } else {
            const errText = await response.text();
            console.warn(`OpenRouter failed with status ${response.status}: ${errText}. Falling back to Gemini...`);
          }
        }
      } catch (err) {
        console.warn(`OpenRouter error: ${err.message}. Falling back to Gemini...`);
      }

      console.log("Using Gemini SDK fallback.");
      const genAI = getGenAIInstance();
      const model = genAI.getGenerativeModel({ model: modelName });
      return model.generateContent(params);
    }
  };
};

// Helper to convert file to generative part
const fileToGenerativePart = (path, mimeType) => {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
};

/**
 * Parses a receipt image and returns structured financial data using Gemini 1.5 Flash
 */
const parseReceipt = async (filePath, mimeType, existingProducts = []) => {
  try {
    const model = getGenerativeModelWithFallback("gemini-2.5-flash");

    const imagePart = fileToGenerativePart(filePath, mimeType);
    
    const existingProductsList = existingProducts.map(p => p.name).join(', ');

    const prompt = `
    أنت محاسب ذكي وخبير في تحليل فواتير المشتريات.
    قم بتحليل الفاتورة المرفقة واستخراج البيانات بدقة متناهية.
    
    شروط استخراج البيانات:
    1. استخرج اسم المتجر (storeName).
    2. استخرج تاريخ الفاتورة (date) بصيغة YYYY-MM-DD. إذا لم تجده، استخدم التاريخ الحالي.
    3. استخرج الوقت (time) بصيغة HH:MM إذا توفر.
    4. حدد العملة المكتوبة (currency) بشكل دقيق، مثل (SAR, USD, EUR, TRY). إذا لم تتحدد، افترض SAR.
    5. استخرج جميع المواد المشتراة في الفاتورة (items) مع التفاصيل:
       - originalName: اسم المنتج كما هو مكتوب في الفاتورة حرفياً.
       - normalizedName: ترجمة الاسم للعربية الفصحى النظيفة وتوحيده. لدينا قائمة بمنتجات المستخدم الحالية: [${existingProductsList}]. إذا كان المنتج الممسوح يطابق أحد هذه المنتجات في المعنى أو اللفظ (مثلاً "أرز بسمتي" يطابق منتج المستخدم "رز وائل" أو "صدر دجاج" يطابق "دجاج صدور")، فيجب عليك استخدام اسم منتج المستخدم الحالي تماماً كـ normalizedName لتفادي التكرار والاعتماد على التسميات المخصصة للمستخدم. وإذا لم يكن له مثيل، قم بتوحيد الاسم للعربية الفصحى النظيفة وإزالة الرموز والأحجام والكميات (مثال "مياه 500 مل" تصبح "مياه معدنية").
       - category: تصنيف المنتج إلى إحدى الفئات التالية فقط:
         * "طعام ومشروبات"
         * "تقنية وإلكترونيات"
         * "مواصلات وسيارات"
         * "ملابس وموضة"
         * "صحة وعناية شخصية"
         * "منزل وأثاث"
         * "ترفيه وألعاب"
         * "خدمات وفواتير"
         * "أخرى"
       - description: اكتب وصفاً تسويقياً/مالياً قصيراً جداً باللغة العربية لهذا المنتج (جملة واحدة مفيدة).
       - quantity: الكمية (عدد أو وزن). القيمة الافتراضية 1.
       - price: سعر الوحدة قبل الخصم.
       - discount: الخصم المطبق على هذا المنتج (إذا وجد، وإلا 0).
       - total: المجموع النهائي للمنتج (الكمية * السعر) - الخصم.
    6. استخرج القيم الإجمالية للفاتورة:
       - tax: إجمالي الضريبة المضافة (VAT).
       - discount: إجمالي خصم الفاتورة العام (إن وجد).
       - total: المجموع النهائي والكامل للفاتورة المدفوع فعلياً.
    7. احسب درجة ثقتك بقراءة البيانات (confidence) كقيمة عشرية بين 0.0 و 1.0. إذا كانت الفاتورة ضبابية أو صعبة القراءة، خفض القيمة.
    `;

    // Schema for structured JSON response
    const jsonSchema = {
      type: "object",
      properties: {
        storeName: { type: "string" },
        date: { type: "string" },
        time: { type: "string" },
        currency: { type: "string" },
        tax: { type: "number" },
        discount: { type: "number" },
        total: { type: "number" },
        confidence: { type: "number" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              originalName: { type: "string" },
              normalizedName: { type: "string" },
              category: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              price: { type: "number" },
              discount: { type: "number" },
              total: { type: "number" }
            },
            required: ["originalName", "normalizedName", "category", "description", "quantity", "price", "total"]
          }
        }
      },
      required: ["storeName", "date", "currency", "total", "items", "confidence"]
    };

    // Add a 90-second timeout to prevent infinite hanging
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT: Gemini API took too long (>90s)')), 90000)
    );

    const aiPromise = model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            imagePart,
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: jsonSchema,
        temperature: 0.1,
      }
    });

    const result = await Promise.race([aiPromise, timeoutPromise]);

    const text = result.response.text();
    console.log("Gemini Raw Parse Output:", text.substring(0, 200));
    return JSON.parse(text);
  } catch (error) {
    console.error("Error in parseReceipt AI service:", error.message);
    if (error.message.includes('TIMEOUT')) {
      throw new Error("انتهت مهلة الاتصال بالذكاء الاصطناعي. يرجى التحقق من اتصالك بالإنترنت والمحاولة مجدداً.");
    }
    if (error.status === 429 || error.message.includes('429') || error.message.toLowerCase().includes('quota') || error.message.toLowerCase().includes('limit')) {
      throw new Error("تجاوزت الحد المسموح لطلب تحليل الفاتورة حالياً. يرجى الانتظار دقيقة واحدة والمحاولة مرة أخرى.");
    }
    throw new Error(`فشل الذكاء الاصطناعي في قراءة الفاتورة: ${error.message}`);
  }
};


/**
 * Normalizes a scanned product name, translating it to clean Arabic, classifying it,
 * and checking if it matches any existing user products.
 */
const normalizeProductName = async (scannedName, existingProducts = []) => {
  try {
    const model = getGenerativeModelWithFallback("gemini-2.5-flash");

    const productsListStr = existingProducts.map(p => p.name).join(', ');

    const prompt = `
    لديك اسم منتج تم مسحه من فاتورة شراء: "${scannedName}".
    المطلوب:
    1. ترجمة الاسم للعربية الفصحى النظيفة وتوحيده (مثلاً Chicken Breasts أو صدر دجاج أو Tavuk Göğsü تصبح جميعها "صدر دجاج").
    2. إزالة أي رموز غير مهمة، رموز أحجام، أو كميات من الاسم (مثل "مياه 500 مل" تصبح "مياه معدنية").
    3. تصنيف المنتج إلى إحدى الفئات التالية فقط:
       - "طعام ومشروبات"
       - "تقنية وإلكترونيات"
       - "مواصلات وسيارات"
       - "ملابس وموضة"
       - "صحة وعناية شخصية"
       - "منزل وأثاث"
       - "ترفيه وألعاب"
       - "خدمات وفواتير"
       - "أخرى"
    4. قارن الاسم الجديد مع قائمة أسماء منتجات المستخدم الحالية المتوفرة: [${productsListStr}].
       - إذا كان هناك منتج يحمل نفس المعنى والترجمة الدقيقة (حتى لو اختلف اللفظ قليلاً)، اختر اسم المنتج القديم تماماً لتوحيدهما معاً وتفادي التكرار.
    `;

    const schema = {
      type: "object",
      properties: {
        normalizedName: { type: "string", description: "الاسم الموحد بالعربية الفصحى" },
        category: { type: "string", description: "الفئة المصنفة" }
      },
      required: ["normalizedName", "category"]
    };

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2,
      }
    });

    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Error in normalizeProductName AI service:", error);
    // Safe fallback
    return {
      normalizedName: scannedName.trim().substring(0, 50),
      category: "أخرى"
    };
  }
};

/**
 * Generates a short, professional product description in Arabic.
 */
const generateProductDescription = async (productName) => {
  try {
    const model = getGenerativeModelWithFallback("gemini-2.5-flash");

    const prompt = `اكتب وصفاً تسويقياً/مالياً قصيراً ومحترفاً جداً باللغة العربية لمنتج استهلاكي يسمى "${productName}". الوصف يجب ألا يتجاوز جملتين مفيدتين (مثال لـ مياه: مياه معدنية نقية تستخدم للشرب والترطيب اليومي وتعتبر من المصاريف الأساسية المتكررة).`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Error in generateProductDescription AI service:", error);
    return `منتج استهلاكي مصنف ضمن المصاريف الشخصية.`;
  }
};

/**
 * Generates smart financial insights based on recent user expenses.
 */
const generateAIInsights = async (expensesData, baseCurrency = "SAR") => {
  try {
    const model = getGenerativeModelWithFallback("gemini-2.5-flash");

    const expensesJson = JSON.stringify(expensesData);

    const prompt = `
    أنت مستشار مالي ذكي يعمل بالذكاء الاصطناعي لتطبيق Fintech.
    أمامك بيانات الإنفاق والمشتريات الأخيرة الخاصة بالمستخدم بصيغة JSON:
    ${expensesJson}
    
    العملة الأساسية للمستخدم هي: ${baseCurrency}.
    
    المطلوب توليد 3 إلى 4 نصائح/رؤى مالية ذكية ومخصصة (AI Insights) باللغة العربية الفصحى.
    يجب أن تكون النصائح عملية ومحددة (مع ذكر أرقام ونسب وتغيرات حقيقية في الأسعار أو الفئات بناءً على البيانات المقدمة).
    
    أمثلة للرؤى المطلوبة:
    - "ارتفع إنفاقك على فئة الطعام بنسبة 15% هذا الأسبوع مقارنة بالمتوسط."
    - "تلاحظ أن منتج 'مياه نوفا' قمت بشرائه 5 مرات بمتوسط سعر 12 ر.س، ننصح ببديل أو شراء بالجملة."
    - "تغيّر سعر منتج 'قهوة أمريكانو' من 15 ر.س إلى 18 ر.س في آخر زيارتين لمتجر X."
    `;

    const schema = {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", description: "مثلاً: warning, tip, success, price_alert" },
          title: { type: "string", description: "عنوان مقتضب ومثير للاهتمام" },
          content: { type: "string", description: "تفصيل النصيحة بشكل مقنع وواضح" }
        },
        required: ["id", "type", "title", "content"]
      }
    };

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.4
      }
    });

    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Error in generateAIInsights AI service:", error);
    // Standard mock insights if fails
    return [
      {
        id: "1",
        type: "tip",
        title: "نصيحة توفير عامة",
        content: "حاول شراء المنتجات الاستهلاكية اليومية مثل المياه والمناديل بكميات كبيرة لتوفير ما يصل إلى 15% شهرياً."
      },
      {
        id: "2",
        type: "warning",
        title: "ارتفاع في قطاع المطاعم",
        content: "مشترياتك في عطلة نهاية الأسبوع الأخيرة كانت أعلى من المعتاد بـ 20%، فكر في إعداد الوجبات منزلياً."
      }
    ];
  }
};

const getMockReceiptData = () => {
  return {
    storeName: "هايبر بنده (Hyper Panda)",
    date: new Date().toISOString().split('T')[0],
    time: "18:30",
    currency: "SAR",
    tax: 15.00,
    discount: 5.00,
    total: 115.00,
    confidence: 0.95,
    items: [
      {
        originalName: "حليب طويل الأجل المراعي 4*1 لتر",
        normalizedName: "حليب كامل الدسم",
        category: "طعام ومشروبات",
        description: "حليب سائل كامل الدسم معقم ومناسب للاستهلاك اليومي.",
        quantity: 1,
        price: 22.00,
        discount: 2.00,
        total: 20.00
      },
      {
        originalName: "أرز بسمتي الشعلان 5 كج",
        normalizedName: "أرز بسمتي",
        category: "طعام ومشروبات",
        description: "أرز بسمتي هندي أبيض طويل الحبة ممتاز للوجبات الرئيسية.",
        quantity: 1,
        price: 45.00,
        discount: 0.00,
        total: 45.00
      },
      {
        originalName: "دجاج مجمد دو 1000 جرام",
        normalizedName: "دجاج مجمد",
        category: "طعام ومشروبات",
        description: "دجاج كامل مجمد جاهز للطهي.",
        quantity: 2,
        price: 20.00,
        discount: 0.00,
        total: 40.00
      },
      {
        originalName: "صابون يدين لايفبوي 200 مل",
        normalizedName: "صابون يدين",
        category: "صحة وعناية شخصية",
        description: "منظف ومطهر سائل للعناية باليدين وحمايتهما من الجراثيم.",
        quantity: 1,
        price: 15.00,
        discount: 3.00,
        total: 12.00
      }
    ]
  };
};

/**
 * Translates an Arabic product name into a simple, general English keyword (e.g., "banana", "milk", "water")
 * suitable for image lookup APIs like LoremFlickr.
 */
const translateProductToEnglishKeyword = async (productName) => {
  try {
    const model = getGenerativeModelWithFallback("gemini-2.5-flash");

    const prompt = `
    Translate this Arabic item/product name to a single, general English noun suitable for search (e.g., "banana" for "موز", "milk" for "حليب كامل الدسم", "water" for "مياه معدنية", "chicken" for "صدر دجاج", "soap" for "صابون يدين").
    Product name: "${productName}"
    Return ONLY the English word, no other text or explanation.
    `;

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
      }
    });

    const text = result.response.text().trim().toLowerCase();
    const cleanWord = text.split(/\s+/)[0].replace(/[^a-z-]/g, '');
    return cleanWord || 'grocery';
  } catch (error) {
    console.error("Error in translateProductToEnglishKeyword AI service:", error);
    return 'grocery';
  }
};

module.exports = {
  parseReceipt,
  normalizeProductName,
  generateProductDescription,
  generateAIInsights,
  translateProductToEnglishKeyword
};
