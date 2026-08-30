import crypto from 'crypto';

// ============================================================
// محلل ذكي بعقل طبيب/عالم — يعمل بدون API key
// يتعامل مع الملف كوثيقة علمية، يستخرج فقط العبارات ذات القيمة
// المعرفية (تعريفات، وظائف، آليات، أهمية سريرية، تصنيفات)،
// ثم يولّد أسئلة ذات معنى: عكس تعريف، ترادف مفاهيم، نفي منطقي.
// لا ينشر أسئلة فارغة/عديمة المعنى ولا يشوّه الصياغة.
// ملخص مرتّب + نقاط تركيز مختصرة + مصطلحات دقيقة من سياق الوثيقة.
// ============================================================

// قاموس مصطلحات علمية/طبية مع الترجمة (مصدر للمفاهيم الحقيقية)
const GLOSSARY = {
  'الخلية': 'cell', 'النواة': 'nucleus', 'الغشاء': 'membrane', 'السيتوبلازم': 'cytoplasm',
  'الميتوكوندريا': 'mitochondria', 'الطاقة': 'energy', 'الكروموسوم': 'chromosome',
  'الجين': 'gene', 'الوراثة': 'heredity', 'الانقسام': 'division', 'المتساوي': 'mitosis',
  'الميوزي': 'meiosis', 'الحمض النووي': 'DNA', 'الدنا': 'DNA', 'الرنا': 'RNA',
  'البروتين': 'protein', 'الأحماض الأمينية': 'amino acids', 'الإنزيم': 'enzyme',
  'البكتيريا': 'bacteria', 'الفيروس': 'virus', 'المناعة': 'immunity', 'الأجسام المضادة': 'antibodies',
  'الدورة الدموية': 'circulatory system', 'الجهاز التنفسي': 'respiratory system',
  'الجهاز الهضمي': 'digestive system', 'الجهاز العصبي': 'nervous system', 'القلب': 'heart',
  'الدم': 'blood', 'العظام': 'bones', 'الكلى': 'kidneys', 'الكبد': 'liver', 'الرئة': 'lung',
  'الهرمون': 'hormone', 'الجلوكوز': 'glucose', 'الضغط': 'pressure', 'الأكسجين': 'oxygen',
  'كربون': 'carbon', 'الهيموجلوبين': 'hemoglobin', 'الجزيء': 'molecule', 'الذرة': 'atom',
  'المركب': 'compound', 'التفاعل': 'reaction', 'الحرارة': 'temperature', 'السرعة': 'velocity',
  'القوة': 'force', 'التسارع': 'acceleration', 'الحركة': 'motion', 'الموجة': 'wave',
  'الضوء': 'light', 'التردد': 'frequency', 'الشحنة': 'charge', 'التيار': 'current',
  'الجهد': 'voltage', 'المقاومة': 'resistance', 'الجاذبية': 'gravity', 'المعادلة': 'equation',
  'الدالة': 'function', 'المتغير': 'variable', 'المشتقة': 'derivative', 'التكامل': 'integral',
  'الاحتمال': 'probability', 'المتوسط': 'mean', 'الانحراف': 'deviation', 'البيانات': 'data',
  'الخوارزمية': 'algorithm', 'البرمجة': 'programming', 'المعالج': 'processor', 'الذاكرة': 'memory',
  'الشبكة': 'network', 'الجهاز': 'system', 'المرض': 'disease', 'العلاج': 'treatment',
  'الأعراض': 'symptoms', 'الالتهاب': 'inflammation', 'العدوى': 'infection', 'الجرعة': 'dose',
  'فقر الدم': 'anemia', 'التشخيص': 'diagnosis', 'الفيتامين': 'vitamin', 'حمض الفوليك': 'folate',
  'الأمعاء الدقيقة': 'small intestine', 'المكملات': 'supplements', 'النزف': 'bleeding',
  'الكريات الحمراء': 'red blood cells', 'تعداد الدم': 'complete blood count', 'السبانخ': 'spinach',
  'الفحص': 'test', 'التشخيص': 'diagnosis', 'أنسجة': 'tissues', 'الأعضاء': 'organs',
  'الأنسجة': 'tissues', 'الخلية العصبية': 'neuron', 'الألياف': 'fibers', 'التنفس': 'respiration',
};

// أنماط تُكسب الجملة أهمية معرفية (منطق العالم/الطبيب)
const IMPORTANT_PATTERNS = [
  /\b(يعتبر|يعرف|تعرف|يمثل|تمثل|هي|هو|تسمى|يسمى)\b/,
  /\b(وظيفة|يقوم|تقوم|تؤدي|يؤدي|تنتج|ينتج|تصنيع|تساعد|يساعد|مسؤول عن)\b/,
  /\b(يتكون|تتكون|يتضمن|تتضمن|يشتمل|تحتوي|يحتوي)\b/,
  /\b(يحدث|تحدث|يؤدي إلى|ينتج عن|تسبب|يسبب|تحويل)\b/,
  /\b(مهم|ضروري|أساسي|رئيسي|أساسية|حاسمة|حرج)\b/,
  /\b(أكثر من|أقل من|الأكبر|الأهم|الأصغر|الأعلى|الأدنى)\b/,
  /(\d+(\.\d+)?\s*(٪|%|ملغ|غ|مم|سم|درجة|وحدة|مل|لتر))|(\d+\s*-?\s*\d+)/,
  /\b(نقص|ارتفاع|انخفاض|زيادة|فرط|قصور|فشل)\b/,
  /\b(أول|مرحلة|آخر|بداية|نهاية|ينقسم إلى|تنقسم إلى|نوعان|أربعة)\b/,
];

// أنماط تُحذف الجمل (سياق تعليمي/عنوان/عام)
const FILTER_PATTERNS = [
  /\b(بسم الله|الحمد لله|السلام عليكم|مرحبا|أهلا)\b/,
  /\b(المحاضرة اليوم|سنتعرف|سنشرح|سنتحدث|كلمة أخيرة|في نهاية المحاضرة|شكرا)\b/,
  /\b(مثال تطبيقي فقط|اترك مجال|الرجاء|يرجى الحفظ)\b/,
  /^(انتبه|ملاحظة|نصيحة|خلاصة)\b/,
];

const STOP = new Set(['على','هذه','حيث','حتى','هناك','ذلك','عن','من','ما','التي','الذي','هي','هو','بين','يمكن','يكون','كان','حسب','بعد','قبل','عند','إلى','في','مع','ولا','ثم','أو','وإن','أن','لا','غير','كل','بعض','لكن','إذ','إلا','فإن','وقد','حول','دون','نحو','لدى','ضمن','يعد','تعد','أو','بشكل','ذلك','أي','أم']);

// تصنيف معرفي للمحتوى (لأقسام الملخص "المصنّف المعرفي للدرس")
const KNOWLEDGE_CLASSES = [
  { label: 'تعريفات', re: /(هي|هو|يعتبر|تعتبر|يعد|تعد|يسمى|تسمى|يمثل|تمثل|يتكون من|تتكون من|عبارة عن)/ },
  { label: 'وظائف وآليات', re: /(وظيفة|يقوم|تقوم|تؤدي|يعمل|تعمل|تصنع|تنتج|ينتج|يساعد|تساعد|مسؤول|يؤدي إلى|ينتج عن|يحدث|يسبب|تسبب|يُفرز|تفرز)/ },
  { label: 'أسباب وعوامل', re: /(سبب|أسباب|بسبب|نتيجة ل|عوامل|عامل)/ },
  { label: 'أعراض', re: /(أعراض|يظهر|تظهر|شكوى|علامة|علامات|مظاهر)/ },
  { label: 'تشخيص', re: /(تشخيص|فحص|يُشخَّص|يعتمد التشخيص|اختبار تشخيصي|تعداد الدم)/ },
  { label: 'علاج', re: /(علاج|يعالج|يُعالَج|الجرعة|التدخل|الوقاية|تناول)/ },
  { label: 'مضاعفات', re: /(مضاعفات|مخاطر|عواقب|قصور|فشل)/ },
  { label: 'مقارنات', re: /(أكثر من|أقل من|الأكبر|الأهم|الأصغر|الأعلى|الأدنى|بينما|بخلاف|مقارنة)/ },
  { label: 'نقاط مهمة', re: /(مهم|ضروري|أساسي|رئيسي|أساسية|حاسمة|حرج|يجب)/ },
];
const UNCERTAINTY_MARKERS = /(قد|ربما|يمكن أن|من المحتمل|على الأرجح|يفترض|غير واضح|غير مؤكد|تقريبًا|يُحتمل|مبهم)/;

function classifyKnowledge(sentence) {
  const s = stripDiacritics(sentence);
  for (const c of KNOWLEDGE_CLASSES) if (c.re.test(s)) return c.label;
  return 'شرح وتحليل';
}

// تقدير صعوبة سؤال محليًا (نوع الجملة/ الطول/العمق) لموازنة الاختبار
function heuristicDifficulty(sentence) {
  const s = stripDiacritics(sentence || '');
  const t = detectSentenceType(s || '');
  if ((s.length > 120) || t === 'mechanism' || /(يؤدي إلى|ينتج عن|تشخيص|علاج|مضاعفات|مريض)/.test(s)) return 'hard';
  if (t === 'definition' && s.length < 90) return 'easy';
  if (s.length < 60) return 'easy';
  return 'medium';
}

const NEGATION_RULES = [
  [/يؤدي إلى/g, 'لا يؤدي إلى'], [/يسبب/g, 'لا يسبب'], [/تسبب/g, 'لا تسبب'],
  [/تحتوي/g, 'لا تحتوي'], [/يحتوي/g, 'لا يحتوي'], [/تنتج/g, 'لا تنتج'], [/ينتج/g, 'لا ينتج'],
  [/يساعد/g, 'لا يساعد'], [/تساعد/g, 'لا تساعد'], [/يتكون/g, 'لا يتكون'], [/تتكون/g, 'لا تتكون'],
  [/تنقسم/g, 'لا تنقسم'], [/ينقسم/g, 'لا ينقسم'], [/تقوم/g, 'لا تقوم'], [/يقوم/g, 'لا يقوم'],
  [/هي\s+/g, 'ليست '], [/هو\s+/g, 'ليس '], [/تعرف/g, 'لا تعرف'], [/يعرف/g, 'لا يعرف'],
  [/يقلل/g, 'يزيد'], [/تقلل/g, 'تزيد'], [/يزيد/g, 'يقلل'], [/تزيد/g, 'تقلل'],
  [/ينخفض/g, 'يرتفع'], [/يرتفع/g, 'ينخفض'],
  [/يحيط/g, 'لا يحيط'], [/توجد/g, 'لا توجد'], [/يوجد/g, 'لا يوجد'], [/تتم/g, 'لا تتم'],
  [/تحدث/g, 'لا تحدث'], [/تعتبر/g, 'لا تعتبر'], [/يعتبر/g, 'لا يعتبر'], [/تُخزَّن/g, 'لا تُخزَّن'],
  [/يسمح/g, 'لا يسمح'], [/يؤدي/g, 'لا يؤدي'], [/يصنع/g, 'لا يصنع'],
];

// إيجاد موقع المصطلح في الجملة مع مراعاة صيغ الجمع (الكروموسوم/الكروموسومات)
function termWithVariants(stem) {
  const bare = stem.replace(/^ال/, '');
  return new RegExp(`ال${bare}(?:ات|[اتة]|ت)?|${bare}(?:ات|[اتة]|ت)?`, 'g');
}

function replaceSubjectSafe(statement, subjectAr, replacementAr) {
  const re = termWithVariants(subjectAr);
  if (!re.test(statement)) return null;
  re.lastIndex = 0;
  const match = statement.match(re);
  if (!match) return null;
  // مستوى مركب: إن تبع المصطلح صفة (مثل "الخلوي") نستبدل الاثنين معًا
  const idx = statement.indexOf(match[0]);
  const after = statement.slice(idx + match[0].length).match(/^\s+\S+/);
  const replaced = statement.slice(0, idx) + replacementAr + (after ? statement.slice(idx + match[0].length) : statement.slice(idx + match[0].length));
  return replaced;
}

// أدوات ربط تُقصّ
const CONNECTORS = /^(و|ف|ثم|لذا|لذلك|وبالتالي|ومن ثم|أما|لكن|غير أنّ|حيث إنّ|إذ إن)\s+/;

function stripDiacritics(text) {
  return text.replace(/[\u064B-\u065F\u0640]/g, '');
}

function looksArabic(text) {
  const ar = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const lat = (text.match(/[a-zA-Z]/g) || []).length;
  return ar >= lat;
}

function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// مشتتات افتراضية مميزة (بدل تكرار نفس العبارة) لإكمال خيارات MCQ
const PAD_OPTIONS = ['أحد المصطلحات الأخرى', 'مفهوم غير مذكور في المحاضرة', 'كل ما سبق غير صحيح'];
function padOptions(arr) {
  const out = [...new Set(arr.filter((x) => x && x.trim()))];
  let i = 0;
  while (out.length < 4) {
    const p = PAD_OPTIONS[i % PAD_OPTIONS.length];
    if (!out.includes(p)) out.push(p);
    i++;
  }
  return out.slice(0, 4);
}

// تقسيم إلى فقرات ثم جمل
function splitParagraphs(content) {
  const raw = stripDiacritics(content)
    .replace(/\r/g, '')
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 12);
  return raw.map((p) => ({
    raw: p,
    sentences: p
      .split(/[.!?؟؛\n]+/)
      .map((s) => clean(s))
      .filter((s) => s.length >= 12),
  }));
}

// تسجيل أهمية الجملة: كم يستحق استخراج سؤال/معرفة منها
function scoreSentence(sentence) {
  const s = stripDiacritics(sentence);
  let score = 1;
  let matched = 0;
  for (const re of IMPORTANT_PATTERNS) {
    if (re.test(s)) { score += 2.5; matched++; }
  }
  const glossaryHits = Object.keys(GLOSSARY).filter((t) => s.includes(t)).length;
  score += glossaryHits * 1.5;
  if (FILTER_PATTERNS.some((re) => re.test(s))) score -= 6;
  return { score, matched, glossaryHits };
}

// استخراج المصطلحات الموجودة فعليًا في النص
function findTermsInText(text) {
  const s = stripDiacritics(text);
  return Object.entries(GLOSSARY)
    .filter(([ar]) => s.includes(ar))
    .map(([ar, en]) => ({ ar, en }));
}

// استخراج الموضوع الرئيسي = أول مصطلح يظهر فعليًا في الجملة، واعيًا بلغة الجملة
// (العربية داخل سطر عربي فقط والإنجليزية داخل سطر إنجليزي فقط — منعًا للخلط)
function extractSubject(sentence, terms) {
  if (terms.length) {
    let earliest = terms[0];
    let minIdx = stripDiacritics(sentence).indexOf(terms[0].ar);
    for (let i = 1; i < terms.length; i++) {
      const idx = stripDiacritics(sentence).indexOf(terms[i].ar);
      if (idx >= 0 && (minIdx < 0 || idx < minIdx)) { minIdx = idx; earliest = terms[i]; }
    }
    return earliest;
  }
  const isAr = looksArabic(sentence);
  const words = stripDiacritics(sentence).replace(/[^أ-يa-zA-Z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const freq = {};
  for (const w of words) {
    const c = w.toLowerCase();
    if (c.length > 3 && !STOP.has(c)) freq[c] = (freq[c] || 0) + 1;
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  return isAr ? { ar: top[0], en: '' } : { ar: '', en: top[0] };
}

function pickEnglish(ar) {
  return GLOSSARY[ar] || '';
}

// اختصار جملة إلى نقطة قصيرة تحمل المعنى الكامل
function compressToPoint(sentence) {
  const s = clean(sentence).replace(/^\d+[.)]\s*/, '').replace(CONNECTORS, '');
  const words = s.split(' ');
  return words.length > 18 ? words.slice(0, 18).join(' ') + '…' : s;
}

// تقسيم لجملة تعريفية "X هي/هو/يعتبر ... وصف" — عدة أنماط قوية
function splitDefinition(sentence, subjectAr) {
  const s = stripDiacritics(sentence).replace(/[.!؟]\s*$/, '');
  const sub = subjectAr.replace(/\s+/g, '\\s*');
  const patterns = [
    // "sub هي/هو/يعتبر/تعتبر/يعد/يسمى/يتكون من ... وصف"
    new RegExp(`${sub}\\s+(?:هي|هو|يعتبر|تعتبر|يعد|تعد|يسمى|تسمى|يمثل|تمثل|يتكون من|تتكون من)\\s+(.+)$`),
    // "الsub + هي/هو/يعتبر ... وصف"
    new RegExp(`ال${sub}\\s+(?:هي|هو|يعتبر|تعتبر|يعد)\\s+(.+)$`),
    // "sub ... (هي/هو) ... وصف" بشكل حر
    new RegExp(`${sub}[^.!?]{0,80}?\\s+(?:هي|هو)\\s+("?[^"]{8,}?)"?(?:\\s*،|\\s*$)`),
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const pred = compressToPoint(m[m.length - 1].trim().replace(/^"|"$/g, ''));
      if (pred.length >= 6) return pred;
    }
  }
  return null;
}

// بناء MCQ ذي معنى: عكس تعريف بموانع من سياق الوثيقة، مع بديل معرفي
function buildMCQs(statements, documentTerms, cap = 8) {
  const mcqs = [];
  const usedSubjects = new Set();
  const defPool = statements.filter((st) => st.score >= 3.5);

  for (const st of (defPool.length ? defPool : statements)) {
    if (mcqs.length >= cap) break;
    const { sentence, terms } = st;
    const stSubject = extractSubject(sentence, terms);
    if (!stSubject || !stSubject.ar || usedSubjects.has(stSubject.ar)) continue;
    const definition = splitDefinition(stripDiacritics(sentence).replace(/[.!؟]+$/, ''), stSubject.ar);
    // أدق: إن كان السؤال عكس تعريف، استنتج موضوع التعريف من الجملة نفسها
    const subject = definition ? (inferDefinitionSubject(clean(stripDiacritics(sentence).replace(/[.!؟]+$/, ''))) || stSubject) : stSubject;
    if (!subject.ar || usedSubjects.has(subject.ar)) continue;
    usedSubjects.add(subject.ar);
    if (definition) {
      const distractors = documentTerms
        .map((t) => t.ar)
        .filter((t) => t !== subject.ar && !usedSubjects.has(t))
        .slice(0, 3);
      const options = padOptions([subject.ar, ...distractors]);
      const shuffled = options.slice().sort(() => Math.random() - 0.5);
      const correctIndex = shuffled.indexOf(subject.ar);
      mcqs.push({
        id: crypto.randomUUID(),
        text: `أي من المصطلحات التالية يُعرَّف بأنه: "${definition}"؟`,
        type: 'mcq',
        options: { A: shuffled[0], B: shuffled[1], C: shuffled[2], D: shuffled[3] },
        correctAnswer: ['A', 'B', 'C', 'D'][correctIndex],
        explanation: sentence,
        topic: subject.en ? `${subject.en} / ${subject.ar}` : subject.ar,
      });
    }
  }

  // إذا لم يُنتج عكس تعريف كافٍ: أسئلة مصطلحية من سياق الوثيقة (ذات معنى)
  if (mcqs.length < cap) {
    const seen = new Set(usedSubjects);
    for (const st of statements) {
      if (mcqs.length >= cap) break;
      const subject = extractSubject(st.sentence, st.terms);
      if (!subject || seen.has(subject.ar)) continue;
      seen.add(subject.ar);
      const dists = documentTerms.map((t) => t.ar).filter((t) => t !== subject.ar).slice(0, 3);
      const options = padOptions([subject.ar, ...dists]);
      const shuffled = options.slice().sort(() => Math.random() - 0.5);
      const ci = shuffled.indexOf(subject.ar);
      mcqs.push({
        id: crypto.randomUUID(),
        text: `ما المقصود بمصطلح "${subject.ar}"؟`,
        type: 'mcq',
        options: { A: shuffled[0], B: shuffled[1], C: shuffled[2], D: shuffled[3] },
        correctAnswer: ['A', 'B', 'C', 'D'][ci],
        explanation: st.sentence,
        topic: subject.en ? `${subject.en} / ${subject.ar}` : subject.ar,
      });
    }
  }
  return mcqs;
}

// ======== بناء أسئلة/أجوبة ذكية (كل سطر بلغة واحدة نقية + إجابة صحيحة حقيقية) ========

// ترتيب ذكي: معرفة تأسيسية (تعريفات) أولًا، ثم وظائف، ثم آليات، ثم عام
const TYPE_RANK = { definition: 0, function: 1, mechanism: 2, meaning: 3 };

// كيف نصنّف الجملة لنبني لها السؤال المناسب فعليًا من محتواها
function detectSentenceType(sentence) {
  const s = stripDiacritics(sentence);
  if (/(?:هي|هو|يعتبر|تعتبر|يعد|تعد|يسمى|تسمى|يمثل|تمثل|يتكون من|تتكون من|عبارة عن|تعرف بـ|يعرف بـ|يكون)\s+/.test(s)) return 'definition';
  if (/(?:وظيفة|يقوم ب|تقوم ب|يعمل على|تعمل على|تنتج|ينتج|تصنع|تفرز|تُفرز|يساعد على|تساعد على|مسؤول عن|مسؤولة عن|يؤدي دور|تؤدي دور|يعزز|تحفز|تنظم|يدعم|تدعم|تحافظ على)/.test(s)) return 'function';
  if (/(?:يؤدي إلى|تؤدي إلى|ينتج عن|تنتج عن|تحدث نتيجة|يحدث|يسبب|تسبب|عندما|بعد التعرض|نتيجة ل|يؤثر في|تؤثر في|يلعب دور)/.test(s)) return 'mechanism';
  return 'meaning';
}

// استخراج الجزء الواقع بعد فعل الوظيفة ليكون إجابة دقيقة
const FUNCTION_VERBS = /(يقوم ب|تقوم ب|تعمل على|يعمل على|تنتج|ينتج|تصنع|تصنّع|تفرز|تُفرز|تساعد على|يساعد على|مسؤول عن|مسؤولة عن|تعزز|تحفز|تنظم|تحافظ على|تسمح بـ)/;

function extractFunctionPart(sentence, subjectAr) {
  const s = clean(sentence);
  let text = s;
  if (subjectAr) {
    const esc = subjectAr.replace(/\s+/g, '\\s*');
    text = s.replace(new RegExp(esc), ' ').trim();
  }
  const m = text.match(new RegExp(`${FUNCTION_VERBS.source}\\s*(.+)$`));
  if (!m) return null;
  let part = clean(m[m.length - 1]);
  part = part.replace(/^(التي|الذي|الذين|اللاتي|اللواتي|اللذان|اللذين)\s+/, '').replace(/^(بـ|لـ|على)\s+/, '').replace(/^[بت]+\s+/, '');
  const stripped = stripDiacritics(part);
  if (part.length >= 4 && !FILTER_PATTERNS.some((re) => re.test(stripped))) return part;
  return null;
}

// لفظ إنجليزي عام نظيف يُستخدم في السطر الإنجليزي حين لا يوجد مصطلح مترجم
const DEFAULT_EN_NOUN = { definition: 'this concept', function: 'this component', mechanism: 'this process', meaning: 'this section' };
// سؤال عربي عام نظيف (بلا كلمات إنجليزية) حين لا يوجد موضوع محدد
const GENERIC_AR_QUESTION = {
  definition: 'ما المقصود بهذا المفهوم؟',
  function: 'ما الدور أو الوظيفة المذكورة في هذا الجزء؟',
  mechanism: 'ما النتيجة الموصوفة في هذا الجزء؟',
  meaning: 'ما الفكرة الرئيسية في هذا الجزء؟',
};

// حرف الجر العربي الصحيح: "ما المقصود بالمناعة؟" لا "بـ المناعة؟"
const prepAr = (t) => `ب${t}`;

// استنتاج موضوع التعريف من الجملة نفسها (الاسم الذي يسبق الرابطة: "X هي/هو/يعتبر ...")
const COPLULAS = /(?:هي|هو|يعتبر|تعتبر|يعد|تعد|يسمى|تسمى|يمثل|تمثل|يتكون من|تتكون من|عبارة عن|يقصد به|يقصد بها)/;
function inferDefinitionSubject(cleanSentence) {
  const m = cleanSentence.match(new RegExp(`^([\\u0600-\\u06FF]+(?:\\s+[\\u0600-\\u06FF]+){0,2})\\s+(?:${COPLULAS.source})\\s+`));
  if (!m) return null;
  const ar = m[1];
  if (ar.length < 2 || ar.length > 26) return null;
  return { ar, en: GLOSSARY[ar] || '' };
}

function qaTemplates(type, subject) {
  const arT = subject && subject.ar ? subject.ar : null;
  const enT = subject && subject.en ? subject.en : null;
  switch (type) {
    case 'definition':
      return {
        questionAr: arT ? `ما المقصود ${prepAr(arT)}؟` : GENERIC_AR_QUESTION.definition,
        questionEn: enT ? `What is meant by ${enT}?` : `What is meant by ${DEFAULT_EN_NOUN.definition}?`,
      };
    case 'function':
      return {
        questionAr: arT ? `ما وظيفة ${arT}؟` : GENERIC_AR_QUESTION.function,
        questionEn: enT ? `What is the function of ${enT}?` : `What is the function of ${DEFAULT_EN_NOUN.function}?`,
      };
    case 'mechanism':
      return {
        questionAr: arT ? `ما النتيجة المترتبة على ${arT}؟` : GENERIC_AR_QUESTION.mechanism,
        questionEn: enT ? `What happens as a result of ${enT}?` : `What happens as a result of ${DEFAULT_EN_NOUN.mechanism}?`,
      };
    default:
      return {
        questionAr: arT ? `ما أهم نقطة بشأن ${arT}؟` : GENERIC_AR_QUESTION.meaning,
        questionEn: enT ? `What is the key point about ${enT}?` : `What is the key point about ${DEFAULT_EN_NOUN.meaning}?`,
      };
  }
}

// بناء سؤال/جواب تعليمي ذكي: سؤال مبنى على نوع الجملة + إجابة مستخرجة صحيحة من الجملة نفسها
function generateIntelligentQA(sentence, terms) {
  let subject = extractSubject(sentence, terms);
  const isAr = looksArabic(sentence);
  const type = detectSentenceType(sentence);
  const cleanSentence = clean(stripDiacritics(sentence).replace(/[.!؟]+$/, ''));
  const point = compressToPoint(sentence);

  // استنتاج موضوع التعريف من الجملة نفسها (أدق من الاعتماد على القاموس فقط)
  if (type === 'definition' && isAr) {
    const inferred = inferDefinitionSubject(cleanSentence);
    if (inferred) subject = inferred;
  }

  // الجواب: منقّى ومستخرج من الملف بلغة الجملة الأصلية، ويجيب عن السؤال مباشرة
  let answerAr = '';
  let answerEn = '';
  if (isAr) {
    let ans = point;
    if (subject && subject.ar && type === 'definition') {
      ans = splitDefinition(cleanSentence, subject.ar) || ans;
    } else if (subject && subject.ar && type === 'function') {
      ans = extractFunctionPart(cleanSentence, subject.ar) || ans;
    }
    answerAr = ans;
  } else {
    answerEn = point;
  }

  // السؤالان: كل سطر بلغة واحدة نقية تمامًا (منعًا لأمثال "ما الفكرة الرئيسية في هذا الجزء (chapter)؟")
  const { questionAr, questionEn } = qaTemplates(type, subject);

  const topic = subject ? (subject.ar ? (subject.en ? `${subject.en} / ${subject.ar}` : subject.ar) : subject.en) : 'قسم';

  const lines = [];
  if (questionAr) lines.push(`س: ${questionAr}`);
  if (questionEn) lines.push(`Q: ${questionEn}`);
  if (answerAr) lines.push(`ج: ${answerAr}`);
  if (answerEn) lines.push(`A: ${answerEn}`);

  return {
    id: crypto.randomUUID(),
    questionEn: clean(questionEn),
    questionAr: clean(questionAr),
    answerEn: clean(answerEn),
    answerAr: clean(answerAr),
    topic,
    type: 'qa',
    options: null,
    correctAnswer: '',
    explanation: point,
    text: lines.join('\n'),
  };
}

// ======== صح/خطأ بنفي منطقي حقيقي (لا تشويه) ========
function buildTrueFalse(statements, documentTerms, cap = 8) {
  const out = [];
  const used = new Set();
  const meaningful = statements.filter((s) => s.score >= 3);
  const pool = meaningful.length >= 3 ? meaningful : statements;

  for (const st of pool) {
    if (out.length >= cap) break;
    const sentence = clean(st.sentence).replace(/\s+/g, ' ');
    let statement = compressToPoint(sentence).slice(0, 140);
    if (used.has(statement)) continue;

    // نتين: صحيحة ثم خاطئة (بنفي منطقي عبر قواعد النفي)
    const isCorrect = out.length % 2 === 0;
    let text = statement;
    if (!isCorrect) {
      let negated = statement;
      for (const [re, rep] of NEGATION_RULES) {
        if (re.test(negated)) { negated = negated.replace(re, rep); break; }
      }
      if (negated !== statement) text = negated;
      else {
        // فشل النفي: نبدّل الموضوع بمصطلح مختلف غير وارد في العبارة (خطأ منطقي مقصود)
        const subject = extractSubject(sentence, st.terms);
        const usedInStatement = st.terms.map((t) => t.ar);
        const others = documentTerms.filter((t) => !usedInStatement.includes(t.ar));
        const target = others.length ? others[0] : null;
        const swapped = subject && subject.ar && target && target.ar && subject.ar !== target.ar ? replaceSubjectSafe(statement, subject.ar, target.ar) : null;
        if (swapped && swapped !== statement) {
          text = swapped;
        } else {
          continue; // لا يمكن بناء عبارة خاطئة ذات معنى — نتخطى
        }
      }
    }
    used.add(statement);
    out.push({
      id: crypto.randomUUID(),
      text: `حدِّد صحة العبارة: «${text}»`,
      type: 'truefalse',
      options: null,
      correctAnswer: isCorrect ? '1' : '0',
      explanation: sentence,
      topic: (st.terms[0] || {}).en ? `${st.terms[0].en} / ${st.terms[0].ar}` : (st.terms[0] || {}).ar || '',
    });
  }
  return out;
}

// ======== استخراج أسئلة/أجوبة واردة حرفيًا داخل الملف نفسه (مثل "س: ..." ثم "ج: ...") ========
const DOC_Q_RE = /^(?:س(?:ؤال)?|Q|Question)\s*[:.]\s*(.+)$/i;
const DOC_A_RE = /^(?:ج(?:واب)?|الإجابة|الحل|A|Answer)\s*[:.]\s*(.+)$/i;

function extractDocumentQA(content) {
  const lines = stripDiacritics(content).replace(/\r/g, '').split('\n');
  const pairs = [];
  let pendingQ = null;
  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;
    const qm = line.match(DOC_Q_RE);
    const am = line.match(DOC_A_RE);
    if (qm) {
      pendingQ = clean(qm[1]).replace(/\.$/, '');
    } else if (am && pendingQ) {
      pairs.push({ q: pendingQ, a: clean(am[1]), lang: looksArabic(pendingQ) ? 'ar' : 'en' });
      pendingQ = null;
    } else if (pendingQ && line.length > 15 && /[؟?]/.test(line)) {
      pendingQ = null;
    }
  }
  return pairs;
}

// تطبيع سريع لمنع تكرار النصوص (نسخة محلية من normAr)
function normLike(s) {
  return stripDiacritics(String(s || '')).replace(/[^أ-يa-zA-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ======== أسئلة مقارنة من عبارات "قارن بين / الفرق بين / بينما / بخلاف" ========
function extractComparedPair(sentence) {
  const s = stripDiacritics(sentence);
  // واو العطف قد تكون ملاصقة للكلمة الثانية (مثل "الدم والثلاسيميا") أو مفصولة بمسافة
  let m = s.match(/(?:مقارنة بين|الفرق بين|الفرق هو)\s+(.+?)\s+و(.+?)(?:[،.:؛]|$)/);
  if (m) return [m[1].trim(), m[2].trim()];
  m = s.match(/(.+?)\s+(?:بينما|بخلاف|في حين|أما)\s+(.+?)(?:[،.:؛]|$)/);
  if (m) return [m[1].trim(), m[2].trim()];
  return null;
}

const COMPARE_AR_RE = /(قارن بين|الفرق بين|مقارنة بين|بينما|بخلاف|في حين|أما)/;

function buildComparisonQA(statements) {
  const out = [];
  const seen = new Set();
  for (const st of statements) {
    const s = stripDiacritics(st.sentence);
    if (!COMPARE_AR_RE.test(s)) continue;
    const trimmed = compressToPoint(s);
    const pair = extractComparedPair(s);
    let qAr;
    if (pair) {
      const a = pair[0].length < 46 ? pair[0] : null;
      const b = pair[1].length < 46 ? pair[1] : null;
      qAr = a && b && a !== b ? `ما الفرق بين ${a} و ${b}؟` : `قارن بين العناصر المذكورة في: «${trimmed}» وبيّن الفروق بينها.`;
    } else {
      qAr = `قارن بين العناصر المذكورة في: «${trimmed}» وبيّن الفروق بينها.`;
    }
    const key = normLike(qAr + trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    const terms = findTermsInText(st.sentence);
    const sub = terms.length ? extractSubject(s, terms) : null;
    out.push({
      id: crypto.randomUUID(),
      type: 'qa',
      options: null,
      correctAnswer: '',
      questionAr: clean(qAr),
      questionEn: 'Compare the items mentioned and explain the differences.',
      answerAr: compressToPoint(st.sentence),
      answerEn: '',
      text: `س: ${clean(qAr)}\nج: ${compressToPoint(st.sentence)}`,
      explanation: st.sentence,
      topic: sub && sub.en ? `${sub.en} / ${sub.ar}` : (sub && sub.ar ? sub.ar : 'مقارنات'),
      difficulty: 'medium',
      page: '',
    });
  }
  return out;
}

// ======== حالات إكلينيكية (MCQ) مبنية على جمل أعراض فعلية من الملف ========
function buildClinicalCaseMCQs(statements, docTerms, cap = 4) {
  const out = [];
  const usedSubjects = new Set();
  const symptomGroups = new Map();
  for (const st of statements) {
    const s = stripDiacritics(st.sentence);
    if (!/(الأعراض|أعراضه|أعراض|علامات|شكوى|مريض)/.test(s)) continue;
    const subj = extractSubject(st.sentence, st.terms);
    if (!subj || !subj.ar || subj.ar.length < 3 || subj.ar.length > 40) continue;
    if (!symptomGroups.has(subj.ar)) symptomGroups.set(subj.ar, []);
    symptomGroups.get(subj.ar).push(st);
  }
  const subjects = [...symptomGroups.keys()];
  for (const label of subjects) {
    if (out.length >= cap) break;
    if (usedSubjects.has(label)) continue;
    const group = symptomGroups.get(label);
    const symptoms = group.map((g) => compressToPoint(g.sentence)).slice(0, 3).join(' | ');
    if (!symptoms) continue;
    const others = subjects.filter((x) => x !== label).slice(0, 3);
    const opts = padOptions([label, ...others]);
    for (const t of docTerms) {
      if (opts.length >= 4) break;
      if (!opts.includes(t.ar)) opts.push(t.ar);
    }
    opts.length = Math.min(opts.length, 4);
    const shuffled = opts.slice().sort(() => Math.random() - 0.5);
    const ci = shuffled.indexOf(label);
    usedSubjects.add(label);
    const letters = ['A', 'B', 'C', 'D'];
    out.push({
      id: crypto.randomUUID(),
      type: 'mcq',
      text: `حالة سريرية: مريض يعاني من «${symptoms}». ما التشخيص الأرجح (وفق ما ورد في المحاضرة)؟`,
      options: { A: shuffled[0], B: shuffled[1], C: shuffled[2], D: shuffled[3] },
      correctAnswer: letters[ci < 0 ? 0 : ci] || 'A',
      explanation: group[0].sentence,
      topic: label,
      difficulty: 'hard',
      page: '',
    });
  }
  return out;
}

// استخراج المصطلحات المهمة بدقة (من القاموس ومن سياق الوثيقة فقط)
function extractTerms(statements, docTerms, count = 14) {
  const freq = {};
  for (const st of statements) {
    for (const t of st.terms) freq[t.ar] = (freq[t.ar] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([ar]) => ar);
  const terms = [...new Set([...sorted, ...docTerms.map((t) => t.ar)])].slice(0, count);
  return terms.map((t) => {
    const en = GLOSSARY[t] || '';
    return en ? `${t} (${en})` : t;
  });
}

export function localAnalyze(content, lectureTitle) {
  const paragraphs = splitParagraphs(content);

  // كل الجمل مع تسجيل أهميتها ومصطلحاتها (عالَمي/طبي)
  const allSentences = paragraphs.flatMap((p) => p.sentences);
  const docTerms = findTermsInText(content);
  const statements = allSentences
    .map((sentence) => {
      const terms = findTermsInText(sentence);
      const { score } = scoreSentence(sentence);
      return { sentence, terms, score };
    })
    .filter((st) => st.score >= 2) // نستبعد الجمل التي لا تحمل قيمة معرفية
    .sort((a, b) => b.score - a.score);

  if (!statements.length) {
    return {
      summary: 'تعذّر استخلاص محتوى ذي قيمة معرفية واضحة من هذا الملف.',
      keyPoints: [], importantTerms: [], reviewTopics: [], questions: [], qaCount: 0, mcqCount: 0, tfCount: 0, coverageBlocks: 0,
    };
  }

  // ==== ترتيب ذكي للجمل: تعريفات تأسيسية أولًا ثم وظائف ثم آليات، مع مراعاة الأهمية ====
  const smartPool = statements
    .map((st) => Object.assign({}, st, { qtype: detectSentenceType(st.sentence) }))
    .sort((a, b) => (TYPE_RANK[a.qtype] - TYPE_RANK[b.qtype]) || (b.score - a.score));

  // ==== Q&A من أهم الجمل بمضامين متنوعة (كل سؤال عن مفهوم مختلف قدر الإمكان وبترتيب تعلّمي) ====
  const qaPool = smartPool.slice(0, Math.min(20, smartPool.length));
  const qaSubjectCount = new Map();
  const qaTexts = new Set();
  const qas = [];
  for (const st of qaPool) {
    const subject = extractSubject(st.sentence, st.terms);
    const key = subject ? (subject.ar || subject.en || 'no-subject') : 'no-subject';
    const seenCount = qaSubjectCount.get(key) || 0;
    // حد أقصى لتكرار نفس المفهوم لضمان التنوع مع الحفاظ على التغطية
    if (seenCount >= 2 && qas.length >= 4) continue;
    qaSubjectCount.set(key, seenCount + 1);
    const q = generateIntelligentQA(st.sentence, st.terms);
    const qk = q.questionAr.replace(/\s+/g, ' ').trim();
    if (qaTexts.has(qk)) continue; // منع تكرار نص السؤال نفسه
    qaTexts.add(qk);
    if (q.questionAr.length > 5 && q.questionAr.length < 300) qas.push(q);
  }


  // ==== نقاط تركيز مختصرة (من الجمل الأعلى تسجيلًا) ======
  const keyPoints = statements.slice(0, 8).map((st) => compressToPoint(st.sentence));

  // ==== استخراج أسئلة/أجوبة واردة حرفيًا داخل الملف نفسه ====
  const docPairs = extractDocumentQA(content);
  const docQAs = docPairs.map((p) => {
    const terms = findTermsInText(p.q + ' ' + p.a);
    const sub = terms.length ? extractSubject(p.q + ' ' + p.a, terms) : null;
    const topic = sub ? (sub.en ? `${sub.en} / ${sub.ar}` : sub.ar) : 'سؤال من المحاضرة';
    if (p.lang === 'ar') {
      return {
        id: crypto.randomUUID(),
        type: 'qa',
        questionAr: clean(p.q),
        questionEn: '',
        answerAr: clean(p.a),
        answerEn: '',
        text: `س: ${clean(p.q)}\nج: ${clean(p.a)}`,
        topic,
        page: '',
        options: null,
        correctAnswer: '',
        explanation: p.a,
        difficulty: 'medium',
      };
    }
    return {
      id: crypto.randomUUID(),
      type: 'qa',
      questionAr: '',
      questionEn: clean(p.q),
      answerAr: '',
      answerEn: clean(p.a),
      text: `Q: ${clean(p.q)}\nA: ${clean(p.a)}`,
      topic,
      page: '',
      options: null,
      correctAnswer: '',
      explanation: p.a,
      difficulty: 'medium',
    };
  });

  // ==== أسئلة مقارنة + حالات إكلينيكية من المحتوى الحقيقي ====
  const compQAs = buildComparisonQA(statements);
  const caseMCQs = buildClinicalCaseMCQs(statements, docTerms, 4);

  // ==== هيكل المحاضرة: الفكرة الرئيسية لكل فقرة (عنوان من المحتوى نفسه) ====
  // إن لم توجد حدود فقرية واضحة (المحلل يضغط الأسطر)، نجمّع الجمل في نوافذ أقسام
  let structure;
  if (paragraphs.length >= 2) {
    structure = paragraphs.slice(0, 10).map((p) => {
      const terms = findTermsInText(p.raw);
      const sub = terms.length ? extractSubject(p.raw, terms) : null;
      const head = sub ? (sub.en ? `${sub.en} / ${sub.ar}` : sub.ar) : 'جزء من المحاضرة';
      return { head, point: compressToPoint(p.sentences[0] || p.raw) };
    });
  } else {
    const win = 4;
    const chunks = [];
    for (let i = 0; i < allSentences.length; i += win) {
      const chunk = allSentences.slice(i, i + win);
      const joined = chunk.join(' ');
      const cterms = findTermsInText(joined);
      const sub = cterms.length ? extractSubject(joined, cterms) : null;
      const head = sub ? (sub.en ? `${sub.en} / ${sub.ar}` : sub.ar) : 'جزء من المحاضرة';
      chunks.push({ head, point: compressToPoint(chunk[0] || joined) });
    }
    structure = chunks.slice(0, 10);
  }

  // ==== ملخص مرتّب ومنطقي: نظرة عامة ← هيكل ← محاور ← مقتطفات High-Yield ====
  const summaryLines = [];
  summaryLines.push(`**ملخص المحاضرة "${lectureTitle}"**`);
  summaryLines.push('');
  summaryLines.push(`**نطاق القراءة:** فُحص الملف كاملًا (${allSentences.length} جملة موزعة على ${paragraphs.length} فقرة + ${docPairs.length} سؤال/جواب وارد في الملف)، واستُخرج منها هذا الملخص والأقسام والأسئلة أدناه.`);
  summaryLines.push('');
  summaryLines.push('**الهدف/الفكرة العامة:**');
  summaryLines.push(compressToPoint(statements[0].sentence));
  summaryLines.push('');
  summaryLines.push('**هيكل المحاضرة:**');
  structure.forEach((s, i) => {
    summaryLines.push(`${i + 1}. **${s.head}**: ${s.point}`);
  });
  summaryLines.push('');
  summaryLines.push('**المحاور المعرفية الرئيسية (بالأهمية):**');
  smartPool.slice(0, 8).forEach((st, i) => {
    const head = (st.terms[0] && st.terms[0].en ? `${st.terms[0].en} / ${st.terms[0].ar}` : (st.terms[0] && st.terms[0].ar) || `النقطة ${i + 1}`);
    summaryLines.push(`${i + 1}. **${head}**: ${compressToPoint(st.sentence)}`);
  });

  // ==== المصنّف المعرفي للدرس (تصنيف المحتوى إلى فئات معرفية حاضرة فعلًا) ====
  const classified = new Map();
  for (const st of statements) {
    const label = classifyKnowledge(st.sentence);
    if (!classified.has(label)) classified.set(label, []);
    if (classified.get(label).length < 3) classified.get(label).push(compressToPoint(st.sentence));
  }
  summaryLines.push('');
  summaryLines.push('**المصنّف المعرفي للدرس:**');
  for (const [label, points] of classified) {
    summaryLines.push(`- ${label}: ${points.join(' | ')}`);
  }

  // ==== Needs Verification: جمل تحمل عدم يقين → ننبه دون تخمين ====
  const uncertain = statements.filter((st) => UNCERTAINTY_MARKERS.test(st.sentence)).slice(0, 4);
  if (uncertain.length) {
    summaryLines.push('');
    summaryLines.push('**تحتاج تحققًا (Needs Verification):**');
    uncertain.forEach((st) => summaryLines.push(`- ${compressToPoint(st.sentence)}`));
  }
  summaryLines.push('');
  summaryLines.push('**High-Yield (متوقع في الامتحان):**');
  summaryLines.push(keyPoints.slice(0, Math.min(4, keyPoints.length)).map((p, i) => `${i + 1}. ${p}`).join('\n'));

  // ==== أسئلة واردة حرفيًا داخل المحاضرة (بإجاباتها) ====
  if (docPairs.length) {
    summaryLines.push('');
    summaryLines.push('**أسئلة واردة في المحاضرة (بإجاباتها الأصلية):**');
    docPairs.slice(0, 6).forEach((p) => summaryLines.push(`- ${p.lang === 'ar' ? 'س' : 'Q'}: ${p.q} | ${p.lang === 'ar' ? 'ج' : 'A'}: ${p.a}`));
  }

  // ==== مصطلحات مهمة (دقيقة من سياق الوثيقة) ====
  const importantTerms = extractTerms(statements, docTerms, 14);

  // ==== مواضيع المراجعة ====
  const reviewTopics = smartPool
    .flatMap((st) => (st.terms[0] && st.terms[0].en ? `${st.terms[0].en} / ${st.terms[0].ar}` : (st.terms[0] && st.terms[0].ar) || []))
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 8);

  // ==== اختبارات: MCQ ذو معنى + صح/خطأ بنفي منطقي ====
  const mcqs = buildMCQs(statements, docTerms, 8);
  const tfs = buildTrueFalse(statements, docTerms, 8);

  // ==== تجميع كل الأسئلة مع إزالة التكرار الدلالي (نفس المعلومة بأي صيغة) ====
  const withMeta = (list) => list.map((q) => Object.assign({}, q, {
    difficulty: q.difficulty || heuristicDifficulty(q.sentence || q.explanation || q.text || ''),
    page: q.page || '',
  }));
  const dedupKey = (q) => normLike((q.questionAr || '') + ' ' + (q.answerAr || '') + ' ' + (q.explanation || '') + ' ' + (q.questionEn || ''));
  const seenKeys = new Set();
  const ordered = [...qas, ...docQAs, ...compQAs, ...mcqs, ...caseMCQs, ...tfs];
  const withMetaOrdered = withMeta(ordered);
  const allQuestions = [];
  for (const q of withMetaOrdered) {
    const k = dedupKey(q);
    if (!k || seenKeys.has(k)) continue;
    seenKeys.add(k);
    allQuestions.push(q);
  }
  const deduped = allQuestions.slice(0, 120);

  const qaCount = allQuestions.filter((q) => q.type === 'qa').length;
  const mcqCount = allQuestions.filter((q) => q.type === 'mcq').length;
  const tfCount = allQuestions.filter((q) => q.type === 'truefalse').length;

  return {
    summary: summaryLines.join('\n'),
    keyPoints,
    highYield: keyPoints.slice(0, 6),
    structure: structure.map((s) => s.head),
    importantTerms,
    reviewTopics,
    questions: deduped,
    qaCount,
    mcqCount,
    tfCount,
    coverageBlocks: statements.length,
  };
}

// ============================================================
// توصيات محلية للمذاكرة
// ============================================================
export function localRecommendations(wrongItems) {
  const topics = {};
  for (const w of wrongItems) {
    const key = w.topic || w.question || 'عام';
    topics[key] = (topics[key] || 0) + 1;
  }
  const sorted = Object.entries(topics).sort((a, b) => b[1] - a[1]);
  return sorted.map(([t, n], i) => ({
    topic: t,
    tips: [
      `ركّز على فهم "${t}" أولًا من خلال الملخص، ثم تدرّب على الأسئلة والأجوبة الخاصة به.`,
      `أعد قراءة نقطة التركيز الخاصة بـ "${t}" قبل حل اختبار عليها.`,
      `أنشئ اختبارًا قصيرًا (10 أسئلة) على "${t}" وقِس تقدّمك حتى تتجاوز 70%.`,
    ],
    priority: i === 0 ? 'high' : i === 1 ? 'medium' : 'low',
  }));
}