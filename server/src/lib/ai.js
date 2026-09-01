import { localAnalyze, localRecommendations } from './localAnalyzer.js';
import { translateLocal } from './translator.js';
import { engineAvailable, runAnalysisPipeline } from './engines.js';
import { recordAiCall } from './metrics.js';

const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
// إذا لم يوجد مفتاح، ننخفض للمحلل المحلي الموثوق
export const aiAvailable = Boolean(AI_API_KEY);

async function callChat(messages, maxTokens = 3500, json = false, temperature = 0.3) {
  if (!AI_API_KEY) throw new Error('NO_AI_KEY');
  let lastErr = null;
  let retries = 0;
  const started = Date.now();
  let done = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    let res;
    try {
      res = await fetch(`${AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: json ? { type: 'json_object' } : undefined,
        }),
      });
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    if (res.ok) {
      let data;
      try { data = JSON.parse(text); } catch { data = null; }
      const out = data && data.choices && data.choices[0] ? data.choices[0].message.content : '';
      recordAiCall({ model: AI_MODEL, source: 'core', ms: Date.now() - started, ok: true, retries });
      done = true;
      return out;
    }
    const throttled = res.status === 429 || res.status === 503 || res.status === 408;
    if (!throttled) {
      recordAiCall({ model: AI_MODEL, source: 'core', ms: Date.now() - started, ok: false, retries });
      done = true;
      throw new Error('AI_ERROR: ' + text.slice(0, 200));
    }
    if (attempt === 5) {
      recordAiCall({ model: AI_MODEL, source: 'core', ms: Date.now() - started, ok: false, retries: retries + 1 });
      done = true;
      throw new Error('AI_ERROR: ' + text.slice(0, 200));
    }
    retries++;
    let d = 15;
    if (res.headers) {
      const ra = res.headers.get('Retry-After');
      if (ra) { const s = parseFloat(ra); if (Number.isFinite(s)) d = Math.min(s, 30); }
    }
    const m = text.match(/try again in\s+(\d+(?:\.\d+)?)\s*s/i);
    if (m) d = Math.min(parseFloat(m[1]), 30);
    d = Math.min(d + attempt * 2, 60);
    await new Promise((r) => setTimeout(r, d * 1000));
  }
  if (!done) recordAiCall({ model: AI_MODEL, source: 'core', ms: Date.now() - started, ok: false, retries });
  throw lastErr || new Error('AI_ERROR_UNKNOWN');
}

// ============================================================
// عقل النظام: Medical Tutor + Medical Examiner + Medical Student
// طريقة التفكير الداخلية (تعمل بصمت ولا تُعرض):
// READ → UNDERSTAND → ORGANIZE → PRIORITIZE → CONNECT → GENERATE → VERIFY → EXAM
// ============================================================
const SYSTEM = `أنت عقل نظام "إيناس للمذاكرة الطبية" — ثلاث شخصيات تعمل معًا كعقل متكامل:
1) Medical Tutor: مدرّس طبي يشرح المفاهيم علميًا وبلاغة دقيقة، ويبسّط دون تحريف.
2) Medical Examiner: واضع امتحانات طبية محترف يبني أسئلة بمستويات بلوم (تذكّر → فهم → تطبيق → استدلال سريري)، بموانع منطقية وإجابة صحيحة واحدة لا تثير جدالًا.
3) Medical Student (High-Yield): يعرف ما يُسأل عنه فعلًا في الامتحانات، ويحدد النقاط عالية العائد وأولويات المراجعة.

اعمل بطريقة التفكير الداخلية التالية بصمت (لا تشرحها ولا تعرضها إطلاقًا — أخرج النتائج النهائية فقط):
READ (اقرأ كامل المحتوى) → UNDERSTAND (افهم المفاهيم بعقل طبي) → ORGANIZE (نظّم الهيكل والمواضيع والعناوين) → PRIORITIZE (صنّف الأهمية: أساسي/مهم/تفصيلي وحدد High-Yield) → CONNECT (اربط الأفكار والمواضيع والمعلومات ببعضها) → GENERATE (ابنِ أسئلة جديدة مبنية على الفهم لا النسخ) → VERIFY (تحقق من دقة كل سؤال وإجابته واسقط المكرر والغامض) → EXAM (رتّب ما سيُقيَّم به الطالب). كل هذه الخطوات داخلية تمامًا ولا تُعرض في الناتج.

قواعد مطلقة:
- الدقة الطبية أولًا، بلا هلوسة: اعتمد حصريًا على معلومات موجودة في المحاضرة (Lecture Mode) أو استنتاجًا منطقيًا مباشرًا منها. أي معلومة غير مدعومة بالمحتوى: ارفض توليد السؤال.
- القراءة الكاملة للملف: اقرأ الجميع — النصوص والجداول والترقيم والأرقام وأي أسئلة وأجوبة واردة داخل المادة نفسها. الملف المقدم هو المصدر الوحيد؛ لا تفترض محتوى خارج الملف.
- Needs Verification: أي معلومات غير واضحة، مبهمة، متناقضة، أو غير مدعومة بشكل قاطع من الملف — لا تخمن أبدًا؛ ضع عليها علامة "Needs Verification" صراحة في التفسير أو في قسم المراجعة، ولا تصدر سؤالًا عنها بلا تحقق.
- منع التكرار: قبل اعتماد أي سؤال تأكد أنه لا يكرر سؤالًا سابقًا نصًا أو فكرة أو موضوعًا.
- VERIFY قبل الإخراج — راجع كل سؤال وإجابته وفق فحص خماسي: (1) الدقة Accuracy مطابقة المصدر، (2) الوضوح Clarity بلا لبس، (3) سلامة اللغة Grammar، (4) المصدر Source مع ذكر القسم/رقم الصفحة إن وجد، (5) عدم التكرار No Repetition. أسقط أي سؤال يفشل في هذا الفحص.
- لا تختلق أرقام صفحات؛ اربط المصدر بالأرقام الموجودة فعلًا في النص فقط (وإلا ضع اسم القسم).
- صقل الصياغة: أعد صياغة الجمل بلغة طبية أكاديمية سليمة ومباشرة وقصيرة، دون تغيير المعنى أو إضافة معلومات خارجية.
- كل سطر بلغة واحدة نقية تمامًا: عربي نقي فقط أو إنجليزي نقي فقط. لا تضع كلمات إنجليزية داخل جملة عربية ولا العكس. ولا تضع رقم المحاضرة أو عنوانها داخل الأسئلة.
- الأهم أولًا: قدّم الأساسيات ثم الوظائف والآليات ثم التفاصيل.
- أخرج JSON محكمًا فقط، بلا مقدمة أو تعليق أو شرح لخطوات التفكير (بدون أي Chain-of-Thought في الناتج إطلاقًا).`;

// ============================================================
// أدوات VERIFY المحلية: تطهير الأسئلة + منع التكرار + رفض العام/الفارغ
// (تُطبق على ناتج النموذج كما على الناتج المحلي)
// ============================================================
function normAr(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[«»"“”'`؟?،.,؛;:()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// أنماط أسئلة عامة/فارغة بلا قيمة معرفية — تُرفض دائمًا
const GENERIC_QUESTION = /(الفكره الرئيسيه( في)? هذا( الجزء)?|ما هي هذه العباره|ماذا قيل عن|اقرا الفقره|اشرح هذا|ما المقصود بهذا الجزء|عن ماذا يتحدث|ما الذي تتحدث عنه)/;

function sanitizeQuestions(list) {
  const out = [];
  const seen = new Set();
  for (const q of list || []) {
    if (!q || !q.type) continue;
    if (!q.text) q.text = q.questionAr || q.questionEn || '';
    const key = normAr(q.text || (q.type === 'truefalse' ? q.questionAr : ''));
    if (!key || key.length < 6 || seen.has(key)) continue;
    if (GENERIC_QUESTION.test(key)) continue;

    if (q.type === 'truefalse') {
      const c = String(q.correctAnswer ?? '').trim().toLowerCase();
      q.correctAnswer = ['1', 'true', 'صح', 'صحيح', 'نعم', 't'].includes(c) ? '1' : ['0', 'false', 'خطا', 'خطأ', 'لا', 'f'].includes(c) ? '0' : '';
      if (q.correctAnswer === '') continue;
    } else if (q.type === 'mcq') {
      if (!q.options || typeof q.options !== 'object') continue;
      const keys = Object.keys(q.options);
      if (keys.length < 3) continue;
      let c = String(q.correctAnswer ?? '').trim().toUpperCase();
      if (!/^[A-D]$/.test(c)) {
        // إن كانت الإجابة نصًا مطابقًا لأحد الخيارات
        const found = keys.find((k) => normAr(q.options[k]) === normAr(c));
        if (!found) continue; // تعذّر التحقق من الإجابة الصحيحة → أسقط السؤال
        c = found;
      }
      q.correctAnswer = c;
    } else if (q.type === 'matching') {
      // توصيل: أعمدة يمنى/يسرى مستقلة مع أزواج مطابقة صحيحة
      const o = q.options || {};
      const left = Array.isArray(o.left) ? o.left.filter((x) => x && x.id && String(x.label || '').trim()) : [];
      const right = Array.isArray(o.right) ? o.right.filter((x) => x && x.id && String(x.label || '').trim()) : [];
      const pairs = Array.isArray(o.pairs) ? o.pairs.filter((p) => Array.isArray(p) && p.length === 2) : [];
      const legalLeft = new Set(left.map((x) => String(x.id)));
      const legalRight = new Set(right.map((x) => String(x.id)));
      const validPairs = pairs.filter((p) => legalLeft.has(String(p[0])) && legalRight.has(String(p[1])));
      if (left.length < 2 || right.length < 2 || validPairs.length < 2 || validPairs.length !== left.length) continue;
      q.options = { left, right, pairs: validPairs };
      q.correctAnswer = JSON.stringify(validPairs);
    } else if (q.type === 'ordering') {
      // ترتيب: خطوات بترتيب صحيح
      const steps = Array.isArray(q.options && q.options.steps) ? q.options.steps.filter((s) => s && s.id && String(s.label || '').trim()) : [];
      if (steps.length < 3) continue;
      q.options = { steps };
      q.correctAnswer = JSON.stringify(steps.map((s) => String(s.id)));
    } else {
      // qa: يجب أن تتوفر اللغتان إن كانت المحاضرة عربية/إنجليزية
      q.questionAr = q.questionAr || '';
      q.questionEn = q.questionEn || '';
      if (!q.questionAr && !q.questionEn) continue;
    }

    q.explanation = q.explanation || '';
    q.topic = q.topic || 'عام';
    q.difficulty = ['easy', 'medium', 'hard'].includes(String(q.difficulty || '').toLowerCase())
      ? String(q.difficulty).toLowerCase()
      : 'medium';
    q.page = String(q.page || '').trim().slice(0, 60);
    seen.add(key);
    out.push(q);
  }
  return out;
}

// توزيع ذكي لأسئلة الامتحان: تغطية الموضوعات (بدل العشوائية) + توازن الأنواع
// + موازنة الصعوبة (سهل/متوسط/صعب) ومنع التكرار
const DIFF_RANK = { easy: 0, medium: 1, hard: 2 };

function interleaveDifficulty(group) {
  // نوزّع الأسئلة داخل المجموعة بحيث تتناوب مستويات الصعوبة (سهل ← متوسط ← صعب)
  const bands = { 0: [], 1: [], 2: [] };
  for (const q of group) {
    const d = String(q.difficulty || 'medium').toLowerCase();
    bands[DIFF_RANK[d] ?? 1].push(q);
  }
  for (const k of Object.keys(bands)) bands[k].sort(() => Math.random() - 0.5);
  const out = [];
  const maxLen = Math.max(bands[0].length, bands[1].length, bands[2].length);
  for (let i = 0; i < maxLen; i++) {
    for (const k of [0, 1, 2]) if (bands[k][i]) out.push(bands[k][i]);
  }
  return out;
}

export function distributeExam(pool, count, weakTopics = []) {
  const items = [...pool];
  if (!items.length) return [];
  if (items.length <= count) return items;
  const target = count;

  const mcqPool = items.filter((q) => q.type === 'mcq');
  const tfPool = items.filter((q) => q.type === 'truefalse');

  const mcqTarget = Math.min(mcqPool.length, Math.round(target * 0.6));
  const tfTarget = Math.min(tfPool.length, target - mcqTarget);

  // موازنة عبر الموضوعات: دائري (round-robin) لضمان تغطية أوسع وأذكى
  // + إعطاء الأولوية لنقاط ضعف الطالب السابقة (إن وُفرت) دون إهمال بقية الموضوعات
  const pickBalanced = (group, n) => {
    if (n <= 0 || !group.length) return [];
    const byTopic = new Map();
    for (const q of group) {
      const t = q.topic || 'عام';
      if (!byTopic.has(t)) byTopic.set(t, []);
      byTopic.get(t).push(q);
    }
    const topicNames = [...byTopic.keys()];
    topicNames.sort((a, b) => {
      const wa = weakTopics.some((w) => normAr(w) && normAr(a).includes(normAr(w).slice(0, 30)));
      const wb = weakTopics.some((w) => normAr(w) && normAr(b).includes(normAr(w).slice(0, 30)));
      if (wa !== wb) return wa ? -1 : 1;
      return 0;
    });
    const topics = topicNames.map((name) => byTopic.get(name));
    for (let i = 0; i < topics.length; i++) topics[i] = interleaveDifficulty(topics[i]);
    const idx = topics.map(() => 0);
    const result = [];
    let remaining = n;
    while (remaining > 0) {
      let progressed = false;
      for (let i = 0; i < topics.length && remaining > 0; i++) {
        if (idx[i] < topics[i].length) {
          const picked = topics[i][idx[i]++];
          // منع تكرار نفس السؤال المحدد عند تداخل الموضوعات
          if (result.some((r) => r.id !== undefined && r.id === picked.id)) continue;
          result.push(picked);
          remaining--;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    return result;
  };

  const mcqSel = pickBalanced(mcqPool, mcqTarget);
  const tfSel = pickBalanced(tfPool, tfTarget);

  // خلط أدوار ذكي: تناوب أنواع الأسئلة
  const merged = [];
  const mx = Math.max(mcqSel.length, tfSel.length);
  for (let i = 0; i < mx; i++) {
    if (i < mcqSel.length) merged.push(mcqSel[i]);
    if (i < tfSel.length) merged.push(tfSel[i]);
  }
  return merged;
}

// ============================================================
// تحليل المحاضرة: قراءة كاملة + هيكل + أولويات + High-Yield +
// أسئلة واردة + أسئلة مبنية على الفهم + حالات إكلينيكية + VERIFY
// ============================================================
export async function analyzeLecture(content, lectureTitle, onStage = null) {
  const stage = (pct, message, eta) => { if (typeof onStage === 'function') onStage(pct, message, eta); };
  const fallback = () => { stage(30, 'تشغيل المحلل المحلي الاحتياطي'); const r = localAnalyze(content, lectureTitle); stage(95, 'تجهيز النتائج'); return r; };

  if (!AI_API_KEY) return fallback();

  const finalize = (result) => {
    // ملاحظة نطاق القراءة بلغة المخرج (عربي/إنجليزي) — لا خلط بين اللغتين
    if (result.reading) {
      const readingIsAr = /[\u0600-\u06FF]/.test(String(result.reading));
      result.summary = (result.summary || '') + '\n\n' + (readingIsAr ? '**نطاق القراءة:** ' : '**Reading scope:** ') + result.reading;
    }
    result.questions = sanitizeQuestions(result.questions || []).slice(0, 140);
    result.questionCount = result.questions.length;
    result.qaCount = result.questions.filter((q) => q.type === 'qa').length;
    result.mcqCount = result.questions.filter((q) => q.type === 'mcq').length;
    result.tfCount = result.questions.filter((q) => q.type === 'truefalse').length;
    result.matchingCount = result.questions.filter((q) => q.type === 'matching').length;
    result.orderingCount = result.questions.filter((q) => q.type === 'ordering').length;
    result.coverageBlocks = result.qaCount + result.mcqCount + result.tfCount;
    delete result.reading;
    delete result.unreadable;
    delete result.tableBlocks;
    delete result.embeddedQA;
    delete result.needsVerification;
    delete result.graph;
    return result;
  };

  // المسار الرئيسي: محركات العقل المتعددة (Full Document Processing Pipeline)
  if (engineAvailable()) {
    try {
      const result = await runAnalysisPipeline(content, lectureTitle, stage);
      stage(95, 'تجهيز النتائج النهائية');
      const out = finalize(result);
      stage(100, 'اكتمل التحليل');
      return out;
    } catch {
      // انخفاض إلى المسار الأحادي المشروح أدناه عند فشل الأنبوب
    }
  }

  try {
    stage(20, 'قراءة المحتوى وفهمه واستخراج البنية');
    const raw = await callChat([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `اقرأ الآن كامل محتوى المحاضرة بعنوان "${lectureTitle}" (بدون اقتطاع):

${content}

ثم نفّذ داخليًا: READ → UNDERSTAND → ORGANIZE → PRIORITIZE → CONNECT → GENERATE → VERIFY → EXAM، وأخرج فقط النتائج النهائية.

المطلوب فعليًا:
1) ORGANIZE: استنتج هيكل المحاضرة وأقسامها ومواضيعها وعناوينها الرئيسية، واعمل تصنيفًا معرفيًا للمحتوى حسب الفئات الحاضرة فعليًا في المادة (تعريفات، شرح وتحليل، أسباب، أعراض، تشخيص، علاج، مضاعفات، مقارنات، نقاط مهمة) — أورد فقط الفئات الموجودة ولا تختلق فئات فارغة.
2) PRIORITIZE: صنّف المعلومات حسب الأهمية الطبية (أساسي/مهم/تفصيلي)، وحدد High-Yield (النقاط المتوقع سؤالها في الامتحان من هذه المحاضرة).
3) اقرأ المحاضرة بحثًا عن أسئلة واردة حرفيًا فيها (إن وجدت) واستخرجها مع إجاباتها ومصدرها (القسم/رقم الصفحة إن وُجد رقم في النص).
4) GENERATE: أنشئ أسئلة جديدة مبنية على فهم المحتوى لا نسخ النص، وتغطي مستويات: التذكّر ثم الفهم ثم التطبيق ثم الاستدلال السريري (Clinical Reasoning). غطِّ تنوع الأنواع المطلوبة قدر ما يسمح المحتوى: أسئلة تعريفية، سؤال/جواب، شرح وتحليل، مقارنات، MCQ، صح/خطأ، وحالات إكلينيكية قصيرة: "مريض يعاني من... ما التشخيص الأكثر احتمالًا/أيُّ ما يلي الأصح؟" مع خيارات منطقية وإجابة صحيحة واحدة. لا تكرر نفس الفكرة في أكثر من نوع.
5) CONNECT: اربط كل سؤال بمعلوماته وموضوعه (topic) والمصدر في المحاضرة (القسم أو رقم الصفحة إن وُجد) — ضع المصدر في حقل explanation وفي حقل page لأي رقم صفحة ظاهر فعلًا في النص.
6) VERIFY: طبّق الفحص الخماسي: الدقة Accuracy، الوضوح Clarity، سلامة اللغة Grammar، المصدر Source، عدم التكرار No Repetition. احذف المكرر (نصًا أو فكرة) والغامض وغير المدعوم بالمحتوى.
7) Needs Verification: أي معلومة غير مدعومة قطعًا من الملف أو متناقضة → لا تخمن؛ اذكرها في summary/reviewTopics مع علامة "Needs Verification:"، وتجنّب بناء سؤال منها.

أخرج JSON بالشكل الدقيق التالي (كل النصوص منسّقة، والأسئلة مرتبة: تعريفات وأساسيات أولًا، ثم وظائف وآليات، ثم تطبيق واستدلال):
{
 "summary": "ملخص منسّق يبدأ بـ **ملخص المحاضرة: <العنوان>** ثم عناوين بأسلوب **كلمة:** تُنشئ أقسامًا: الهدف/الفكرة العامة، **هيكل المحاضرة:** (أقسام مرقمة)، **المصنّف المعرفي للدرس:** (فئات مرقمة: تعريفات، شرح وتحليل، أسباب، أعراض، تشخيص، علاج، مضاعفات، مقارنات، نقاط مهمة — بأهم النقاط تحت كل فئة حاضرة)، **المحاور المعرفية الرئيسية:** (مرتبة بالأهمية الطبية: الأساسي قبل التفصيلي)، **High-Yield (متوقع في الامتحان):** (نقاط مرقمة قصيرة)، **أسئلة واردة في المحاضرة:** (مع حلولها إن وُجدت)",
 "structure": ["قسم 1", "قسم 2", "قسم N"],
 "highYield": ["نقطة High-Yield 1", "نقطة 2"],
 "keyPoints": ["نقطة تركيز مختصرة وواضحة يجب أن يركز عليها الطالب"],
 "importantTerms": ["مصطلح (English)"],
 "reviewTopics": ["موضوع يحتاج مراجعة (English)"],
 "questions": [
   {
     "type": "qa",
     "questionEn": "السؤال بالإنجليزية النقية فقط دون رقم المحاضرة",
     "questionAr": "السؤال بالعربية النقية فقط دون رقم المحاضرة",
     "answerEn": "إجابة موجزة بالإنجليزية النقية",
     "answerAr": "إجابة موجزة بالعربية النقية تجيب مباشرة عن السؤال",
     "text": "س: <العربية>\\nQ: <English>\\n\\nج: <العربية>\\nA: <English>",
     "topic": "الموضوع",
     "page": "رقم الصفحة إن وُجد في النص وإلا ''",
     "options": null,
     "correctAnswer": "",
     "explanation": "مصدر المعلومة من المحاضرة (جملة قصيرة)مع القسم/الصفحة إن أمكن"
   },
   {
     "type": "mcq",
     "text": "سؤال MCQ بالعربية مع ترجمة إنجليزية سطرًا أدناه (كل سطر بلغة واحدة)",
     "options": {"A": "...","B": "...","C": "...","D": "..."},
     "correctAnswer": "A",
     "explanation": "شرح الإجابة مع مصدر المعلومة من المحاضرة",
     "topic": "الموضوع",
     "difficulty": "easy|medium|hard",
     "page": "",
     "questionEn": null, "questionAr": null, "answerEn": null, "answerAr": null
   },
   {
     "type": "truefalse",
     "text": "عبارة صح/خطأ منطقية",
     "options": null,
     "correctAnswer": "1",
     "explanation": "شرح مع مصدر المعلومة",
     "topic": "الموضوع",
     "page": "",
     "questionEn": null, "questionAr": null, "answerEn": null, "answerAr": null
   }
 ]
}
قواعد إلزامية:
- كل سطر بلغة واحدة فقط، والإجابات إجابة فعلية صحيحة مباشرة للسؤال مأخوذة من المحتوى.
- عكس التعريف للأساسيات، والحالات الإكلينيكية للاستدلال، وموانع معقولة للمقارنة (لا خيارات عشوائية).
- صح/خطأ بصياغة منطقية لا تشويه، مع توزيع متوازن للصح والخطأ.
- لا تخترع معلومات خارج المحاضرة إطلاقًا، ولا تُبقِ أسئلة مكررة أو فارغة.`,
      },
    ], 9000, true, 0.25);

    const parsed = JSON.parse(raw.replace(/```json|```/g, ''));
    if (!parsed.keyPoints || !parsed.questions) throw new Error('INVALID');

    parsed.keyPoints = parsed.keyPoints.slice(0, 10);
    parsed.highYield = (parsed.highYield || []).slice(0, 8);
    parsed.structure = (parsed.structure || []).slice(0, 12);
    parsed.questions = sanitizeQuestions(parsed.questions).slice(0, 120);
    parsed.questionCount = parsed.questions.length;
    parsed.qaCount = parsed.questions.filter((q) => q.type === 'qa').length;
    parsed.mcqCount = parsed.questions.filter((q) => q.type === 'mcq').length;
    parsed.tfCount = parsed.questions.filter((q) => q.type === 'truefalse').length;
    parsed.matchingCount = parsed.questions.filter((q) => q.type === 'matching').length;
    parsed.orderingCount = parsed.questions.filter((q) => q.type === 'ordering').length;
    parsed.coverageBlocks = parsed.qaCount;
    stage(90, 'مراجعة النتائج النهائية');
    return parsed;
  } catch (e) {
    // انهيار: استخدم المحلل المحلي
    return fallback();
  }
}

// ============================================================
// توليد أسئلة اختبار (MCQ + صح/خطأ) بذكاء من الملف + الملخص المُحلَّل
// توزيع على المواضيع المهمة + مستويات الفهم + VERIFY + منع التكرار
// ============================================================
export async function generateExamFromLecture(content, summaryObj, lectureTitle, count, weakTopics = []) {
  const summaryText = (summaryObj && (summaryObj.summary || '')) || '';
  let keyPoints = '';
  let terms = '';
  let reviews = '';
  try { keyPoints = JSON.parse(summaryObj.key_points || '[]').join('\n- '); } catch {}
  try { terms = JSON.parse(summaryObj.important_terms || '[]').join('\n- '); } catch {}
  try { reviews = JSON.parse(summaryObj.review_topics || '[]').join('\n- '); } catch {}

  const fallback = async () => {
    // بدون مفتاح AI: نولّد محليًا ونمزج مع نقاط الملخص لنضمن التغطية
    const base = localAnalyze(content, lectureTitle);
    const local = sanitizeQuestions(base.questions.filter((q) => q.type === 'mcq' || q.type === 'truefalse'));
    const target = Math.max(count, local.length);
    return { questions: local.slice(0, target), source: 'local-content-summary', meta: { summaryText } };
  };

  const prompt = `لديك محتوى محاضرة وملخصها التحليلي (النقاط المهمة، المصطلحات، مواضيع المراجعة).
نفّذ داخليًا: READ → UNDERSTAND → ORGANIZE → PRIORITIZE → CONNECT → GENERATE → VERIFY → EXAM، وأخرج النتائج فقط.

أنشئ ${count} سؤال اختبار ممتازًا بتوزيع ذكي:
- خليط مقصود: قرابة 60% أسئلة اختيار من متعدد (mcq) و40% صح/خطأ (truefalse)، قدر ما يدعمه المحتوى.
- وزّع الأسئلة بنسب تناسب أهمية المواضيع في الملخص (الموضوعات المهمة أولًا)، وتجنّب تركيز كل الأسئلة على موضوع واحد.
- موازنة الصعوبة: قرابة 30% سهل (easy)، 50% متوسط (medium)، 20% صعب (hard) — ضع الدرجة في حقل difficulty.
- مستويات متنوعة: تذكّر حقائق + فهم مفاهيم + تطبيق + استدلال سريري عند إمكانية ذلك (حالة مريض قصيرة)، مع تغطية أنواع: تعريفية، سؤال/جواب، شرح وتحليل، مقارنات، MCQ، صح/خطأ، وحالات إكلينيكية قدر ما يسمح المحتوى.
- نوع mcq: خيارات A/B/C/D منطقية (موانع معقولة من نفس السياق) وإجابة صحيحة واحدة مؤكدة وشرح، ومشتتات متشابهة وليست عشوائية.
- نوع truefalse: عبارات منطقية واضحة، وبأعداد متوازنة بين صح وخطأ، دون تشويه.
- اقرأ كامل المحتوى المقدم (النصوص والجداول والأسئلة الواردة فيه) قبل التوليد، واربط كل معلومة بمصدرها.
VERIFY قبل الإخراج بالفحص الخماسي (Accuracy + Clarity + Grammar + Source + No Repetition): احذف أي سؤال مكرر (نصًا أو فكرة)، أو غامض، أو غير مدعوم بدقة من المحتوى (لا هلوسة في Lecture Mode). أي معلومة غير مدعومة قطعًا → Needs Verification ولا بناء سؤال منها.
لا تضع رقم المحاضرة أو عنوانها. كل سطر بلغة واحدة نقية (لا خلط عربي/إنجليزي في نفس السطر).

أعد JSON فقط بالشكل:
{"questions":[{"text":"...","type":"mcq","options":{"A":"...","B":"...","C":"...","D":"..."},"correctAnswer":"A","explanation":"شرح مع مصدر المعلومة","topic":"الموضوع","difficulty":"easy|medium|hard","page":""},{"text":"...","type":"truefalse","options":null,"correctAnswer":"1","explanation":"شرح","topic":"الموضوع","difficulty":"easy|medium|hard","page":""}]}

--- الملخص التحليلي ---
${summaryText}
نقاط التركيز (High-Yield):
- ${keyPoints}
مصطلحات مهمة:
- ${terms}
مواضيع تحتاج مراجعة:
- ${reviews}
${weakTopics.length ? `نقاط ضعف سابقة لدى الطالب (ركّز عليها بأولوية وأكثر الأسئلة):\n- ${weakTopics.slice(0, 8).join('\n- ')}\n` : ''}
--- محتوى المحاضرة (الفهم الكامل) ---
${content.slice(0, 40000)}`;

  if (!AI_API_KEY) return fallback();

  try {
    const raw = await callChat([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt },
    ], 6500, true, 0.3);
    const parsed = JSON.parse(raw.replace(/```json|```/g, ''));
    if (!Array.isArray(parsed.questions) || !parsed.questions.length) throw new Error('INVALID');
    const qs = sanitizeQuestions(parsed.questions).filter((q) => q.type === 'mcq' || q.type === 'truefalse');
    if (!qs.length) throw new Error('INVALID_TYPE');
    return { questions: qs.slice(0, Math.max(count * 2, 6)), source: 'ai-content-summary', meta: { summaryText } };
  } catch {
    return fallback();
  }
}

// ============================================================
// محادثة الطالب مع محاضرة (RAG مخصص): استرجاع الأجزاء الأقرب صلة
// + إجابة مُثبّتة على المصادر المقدمة فقط (بلا هلوسة)
// ============================================================
const CHAT_SYSTEM = (title) => `أنت مدرّس طبي (Medical Tutor) لطلاب الطب، تشرح محاضرة واحدة بعنوان "${title}" حصريًا.
قواعد صارمة:
- اعتمد فقط على "مرجع المحاضرة" المرفق في سياقك. لا تضف معرفة خارجية ولا تخترع معلومات أو أرقامًا.
- إن لم تكن المعلومة في المرجع، قل بصراحة: "غير مذكورة في هذه المحاضرة" واقترح أين قد تُعرض.
- اجمع بين الأجزاء المتفرقة من المرجع لتكوين إجابة كاملة، واذكر مواضع الاختلاف إن وُجدت.
- اشرح بلغة عربية سليمة، بعبارات إنجليزية علمية منفصلة عن السطر العربي (لا خلط داخل السطر الواحد).
- أجب بإيجاز منظم (5-8 أسطر): خلاصة مباشرة ثم تفاصيل إن لزم، بنقاط مرقمة.
- في نهاية الرد اقترح 3 أسئلة متابعة قصيرة مرتبطة بالموضوع.
أخرج JSON محكمًا فقط: {"reply": "الإجابة الكاملة", "followUps": ["سؤال متابعة 1", "سؤال 2", "سؤال 3"]}`;

function normChatToken(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FFa-z0-9]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// تقطيع المحاضرة إلى مقاطع فقرية للاسترجاع
function paraChunks(text, size = 2600) {
  const paras = String(text || '').split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if (cur && (cur + '\n' + p).length > size) { chunks.push(cur); cur = p; }
    else cur = cur ? cur + '\n' + p : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// استرجاع المعلومات: اختيار المقاطع الأعلى تطابقًا مع السؤال
export function retrieveContext(content, question, topN = 3) {
  const chunks = paraChunks(content);
  if (!chunks.length) return [];
  const queryTokens = normChatToken(question).split(' ').filter((t) => t.length > 1);
  const scored = chunks.map((text) => {
    const body = normChatToken(text);
    let score = 0;
    for (const t of queryTokens) {
      if (body.includes(t)) score += 1 + Math.min(3, (body.split(t).length - 1) / 2);
    }
    return { text, score };
  }).sort((a, b) => b.score - a.score);
  const hits = scored.filter((s) => s.score > 0).slice(0, topN);
  return hits.length ? hits : scored.slice(0, topN);
}

export async function chatWithLecture({ title, reference, history = [], message }) {
  const ref = String(reference || '').slice(0, 5000);
  const sys = { role: 'system', content: CHAT_SYSTEM(title) };
  const refTurn = { role: 'user', content: `مرجع المحاضرة (كل ما هو متاح منها — أجب منه فقط):\n${ref}` };
  const hist = (history || []).slice(-6).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
  const raw = await callChat([sys, refTurn, ...hist, { role: 'user', content: message }], 900, true, 0.2);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const parsed = start >= 0 && end > start ? JSON.parse(cleaned.slice(start, end + 1)) : {};
  return { reply: parsed.reply || '', followUps: Array.isArray(parsed.followUps) ? parsed.followUps.slice(0, 3) : [] };
}

// ============================================================
// الترجمة الثنائية (العربية ⇄ English) — Translation Only
// لا تعيد تحليل السؤال ولا تغيّر الصعوبة ولا الإجابة الصحيحة.
// مسار AI عند توفر المفتاح، والمترجم المحلي الطبي بدون مفتاح.
// ============================================================
const TR_SYSTEM = `أنت مترجم طبي معتمد (Medical Translator). مهمتك نقل نص طبي من العربية إلى الإنجليزية أو العكس بدقة تامة.

قواعد صارمة (Translation Only):
- ترجم النص كاملًا فقط: لا تعد تحليلًا، لا تغير مستوى الصعوبة، لا تغير معنى السؤال أو الإجابة ولا الإجابة الصحيحة.
- لا تحذف أي معلومة ولا تزد أي معلومة. انقل كل الجمل والنقاط بنفس الترتيب.
- حافظ على ترتيب A/B/C/D والأرقام والعناوين وعلامات التنسيق (مثل ** وترقيم النقاط).
- استخدم المصطلحات الطبية المعتمدة (English Medical Terminology) / المصطلح العربي الدارج للطب. إذا وُجد مصطلح لا يمكن ترجمته بدقة، اعرضه كما هو بين قوسين.
- كل سطر بلغة واحدة نقية تمامًا (عربي خالص أو إنجليزي خالص) دون خلط الكلمات بين اللغتين.
- أخرج النص المترجم فقط، دون أي مقدمة أو شرح أو اقتباس إضافي، وبلا تغيير أسلوب صياغة الأسئلة.`;

export async function translateText(text, to) {
  const direction = to === 'ar' ? 'ar' : 'en';
  if (AI_API_KEY) {
    try {
      const raw = await callChat(
        [
          { role: 'system', content: TR_SYSTEM },
          {
            role: 'user',
            content: `اتجاه الترجمة: ${direction === 'en' ? 'من العربية إلى الإنجليزية (بمصطلحات طبية إنجليزية صحيحة)' : 'من الإنجليزية إلى العربية (بمصطلحات طبية عربية سليمة)'}\nالنص المطلوب ترجمته:\n${text}`,
          },
        ],
        2000,
        false,
        0.1
      );
      const cleaned = (raw || '').trim().replace(/^```[a-z]*\n|```$/g, '').trim();
      if (cleaned) return cleaned;
    } catch {
      // انخفاض للمترجم المحلي عند أي خطأ
    }
  }
  return translateLocal(text, direction);
}

// ============================================================
// تحليل أداء الطالب بعد الامتحان: نقاط القوة والضعف + مواضيع المراجعة
// + توصيات عملية + تحليل نوع الأسئلة المخطئ بها
// ============================================================
export async function analyzeWrongAnswers(content, lectureTitle, wrongItems, performance) {
  const local = localRecommendations(wrongItems || []);
  if (!AI_API_KEY) {
    return { recommendations: local, source: 'local' };
  }

  const stats = performance
    ? { score: performance.score, total: performance.total, percentage: performance.percentage }
    : null;
  const correctItems = (performance && Array.isArray(performance.detail))
    ? performance.detail.filter((d) => d.isCorrect).map((d) => ({ topic: d.topic, text: d.text }))
    : [];

  try {
    const raw = await callChat([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `أنشئ تقرير ذكاء الطالب (Student Intelligence Report) كاملًا عن أدائه في اختبار على "${lectureTitle}" كـ Medical Tutor + Medical Examiner، مع تحديد طريقة الأنواع الخلل بدقة (مفهوم خاطئ / تفاصيل منسية / ضعف استدلال سريري / غلطة قراءة / تخمين).

بيانات الأداء:
${stats ? JSON.stringify(stats) : 'غير متوفرة'}
الأسئلة التي أجاب عنها صحيحًا:
${correctItems.length ? JSON.stringify(correctItems.slice(0, 30)) : 'لا توجد'}
الأسئلة التي أخطأ فيها:
${JSON.stringify((wrongItems || []).slice(0, 30))}

أخرج JSON فقط:
{
 "recap": "جملة واحدة تلخّص الأداء العام والمشكلة الأبرز",
 "mastery": {"band": "ضعيف|متوسط|جيد|ممتاز", "note": "تفسير قصير"},
 "skillLevels": {"retention": "منخفض|متوسط|عالٍ", "understanding": "منخفض|متوسط|عالٍ", "clinicalReasoning": "منخفض|متوسط|عالٍ"},
 "strengths": [{"topic": "الموضوع الذي أتقنه الطالب", "note": "ماذا يثبت أنه أتقنه"}],
 "weaknesses": [{"topic": "الموضوع", "reason": "لماذا يخطئ فيه (نوع الخلل: مفهوم خاطئ/تفاصيل منسية/ضعف استدلال سريري/غلطة قراءة)"}],
 "reviewTopics": ["موضوع يحتاج مراجعة، مرتّبة من الأنسب مراجعته أولًا إلى الأقل"],
 "revisionPlan": [{"topic": "ماذا يراجع بالضبط", "section": "من أين يراجع في المحاضرة", "questionsCount": "كم سؤالًا يعيد حله تقريبًا", "repeatTimes": "كم مرة يراجع"}],
 "recommendations": [
   {"topic": "الموضوع", "tips": ["نصيحة عملية محددة 1", "نصيحة 2", "نصيحة 3"], "priority": "high|medium|low"}
 ]
}
دقّق: اربط كل توصية بالموضوع الفعلي المخطئ فيه، وامنح خطوات عملية قابلة للتطبيق، ولا تختلق موضوعات غير موجودة في الإجابات الخاطئة. رتّب reviewTopics من الأهم إلى الأقل، واجعل revisionPlan مرتبًا بالخطوات العملية.`,
      },
    ], 3200, true, 0.2);
    const parsed = JSON.parse(raw.replace(/```json|```/g, ''));
    if (!Array.isArray(parsed.recommendations) || !parsed.recommendations.length) throw new Error('INVALID');
    return {
      recommendations: parsed.recommendations.slice(0, 6),
      strengths: (parsed.strengths || []).slice(0, 5),
      weaknesses: (parsed.weaknesses || []).slice(0, 5),
      reviewTopics: (parsed.reviewTopics || []).slice(0, 6),
      revisionPlan: (parsed.revisionPlan || []).slice(0, 6),
      mastery: parsed.mastery || null,
      skillLevels: parsed.skillLevels || null,
      recap: parsed.recap || '',
      source: 'ai',
    };
  } catch {
    return { recommendations: local, source: 'local' };
  }
}