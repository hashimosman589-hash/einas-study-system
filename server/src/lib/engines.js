import crypto from 'crypto';
import { recordAiCall } from './metrics.js';

// ============================================================
// محرّكات العقل (AI Intelligence Engines) لنظام إيناس
// عمود فقري متعدد القدرات يعمل كخط أنابيب مستقل (Boolean):
//   DocumentReader → ContentExtraction → MedicalReasoning(Knowledge Graph)
//   → QuestionGeneration(19 نوعًا) → QuestionValidation(Anti-Hallucination)
//   → SummaryMerger(High-Yield)
// لا يعتمد على Prompt واحد؛ كل محرك وظيفة مستقلة بكائن SYSTEM خاص.
// كل محرك يتحقق من مخرجاته محليًا في حالة الفشل يرفع خطأً يعالجه الطالب في ai.js.
// لا تُعرض الخطوات الداخلية في الناتج إطلاقًا (بدون Chain-of-Thought).
// ============================================================

const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

export const ENGINE_CHUNK_SIZE = 8000; // أحرف لكل جزء قراءة — أكبر قدر من المحتوى لكل استدعاء قراءة (كل قراءة تنفرد بنافذة على الطبقة المجانية أصلًا، فالأجزاء الأكبر لا تكلف وقتًا إضافيًا بل تقلّل عددها)
const CHUNK_OVERLAP = 700; // تداخل بين الأجزاء لضمان عدم فقدان معلومات حدود القسم

// التوازي عبر الأجزاء قابل للضبط في .env (AI_PIPELINE_CONCURRENCY) — أقصى 4.
// الافتراضي 2: موزّع التوكنات أدناه يحرس سقف توكنات الدقيقة (TPM) فيمشي الاستهلاك عبر الأجزاء
// معًا بلا تجاوز السقف (يُجدول الإطلاق لا يسمح 429)، ويثبت قياس الاستهلاك الفعلي أنه أسرع من التوالي.
// يُرشَّد لـ 1 فقط عند تقييد إضافي من المزود، ويُرفع حتى 4 عند ترقية الحساب.
const PIPELINE_CONCURRENCY = Math.max(1, Math.min(4, parseInt(process.env.AI_PIPELINE_CONCURRENCY || '2', 10) || 1));

// مرحلة التحقق السلكي (مراجعة جودة + ضد الاختلاق) تُنفَّذ للأجزاء ذات البنك الكبير فقط — فهي أغلى استدعاء
// في الجزء (تُعيد إرسال الأسئلة نصًا). المجموعات الصغيرة يغطيها VERIFY المدمج داخل مولّد الأسئلة
// + التطهير المحلي (normalization + منع التكرار) بعد الدمج = تسريع ملحوظ على الطبقة المجانية.
// القيمة 0 تعني التحقق دائمًا، وقيمة كبيرة جدًا تعني إيقافه.
const VALIDATE_MIN_Q = Math.max(0, parseInt(process.env.AI_VALIDATE_MIN || '999', 10) || 0);

// عدد الأسئلة المطلوب توليدها لكل جزء من المحاضرة (كل سؤال ثنائي اللغة يستهلك توكنات ناتج باهظة).
// خفّضه لأقصى سرعة على الطبقة المجانية، وارفعه بعد ترقية الحساب للجودة الكاملة.
const QUESTIONS_PER_PART = Math.max(3, Math.min(14, parseInt(process.env.AI_QUESTIONS_PER_PART || '5', 10) || 5));

// ---------- موزّع سقف التوكنات (TPM-Aware Pacing) ----------
// يحسب استهلاك النموذج للتوكنات في نافذة منزلقة 60 ثانية ويؤجّل أي طلب يتجاوز حد الدقيقة
// إلى أول لحظة يتسع فيها السقف — جدولة دقيقة بلا إهدار نوافذ انتظار 429.
const TPM_LIMIT = Math.max(2000, parseInt(process.env.AI_TPM_LIMIT || '8000', 10) || 8000);
// نسبة أحرف/توكن فعليّة للنموذج qwen على النص العربي ≈ 2.4 (قِيسَت مباشرة: 8000 حرف عربي
// ≈ 2641 توكن إدخال = 3.0 حرف/توكن، ومع المزيج الإنجليزي/JSON يهبط إلى ~2.4). التقدير المتحفظ
// (لا يقل عن 2.4) يمنع استهلاكًا فوريًا بـ 429، وتُدار النسبة تلقائيًا من قياسات الاستجابات
// (متوسط سلس) لتقريب التقدير دون كسر السقف.
const BASE_CHARS_PER_TOKEN = 2.4;
let learnedCharsPerToken = BASE_CHARS_PER_TOKEN;
// هامش أمان ثابت: يكفل ألا يتجاوز مجموع الطلبات النافذة رغم تباين الترميز قبل اكتمال التعلّم
const PACE_MARGIN = 400;
const tpmSpend = []; // { t, tokens } — tokens تُصحَّح بالقيمة الفعلية بعد اكتمال كل استجابة
function tpmUsed(now) {
  let sum = 0;
  for (const s of tpmSpend) if (s.t + 60000 > now) sum += s.tokens;
  return sum;
}
// يحجز مكانًا في نافذة الدقيقة (بالتقدير المتحفظ) ويعيد مقبضًا يُحدَّث فورًا بالاستهلاك الفعلي:
// الاحتياط يقي أثناء اتّصال الشبكة، والتصحيح بعد الردّ يُعيد الرصيد غير المستخدم لنافذة الدقيقة.
// الانتظار دقيق: ينتظر أول لحظة يتبخّر فيها ما يكفي من الطلبات السابقة ليتسع السقف لا لحظة انتهاء أقدمها.
async function paceTokens(estTokens) {
  if (tpmSpend.length > 2000) tpmSpend.splice(0, tpmSpend.length - 1000);
  for (;;) {
    const now = Date.now();
    const active = tpmSpend.filter((s) => s.t + 60000 > now);
    const used = active.reduce((a, s) => a + s.tokens, 0);
    // نافذة خاوِية (قِياس <= الهامش): ينطلق الطلب حتى لو قارب وحده سقف الدقيقة — وإلا تعطّل حصريًّا.
    if (used <= PACE_MARGIN || used + estTokens + PACE_MARGIN <= TPM_LIMIT) {
      const entry = { t: now, tokens: estTokens };
      tpmSpend.push(entry);
      return entry;
    }
    const deadlines = [...new Set(active.map((s) => s.t + 60000))].sort((a, b) => a - b);
    let wait = null;
    for (let i = 0; i < deadlines.length && wait == null; i++) {
      const still = tpmSpend.filter((s) => s.t + 60000 > deadlines[i]).reduce((a, s) => a + s.tokens, 0);
      if (still <= PACE_MARGIN || still + estTokens + PACE_MARGIN <= TPM_LIMIT) wait = deadlines[i] - now + 50;
    }
    // انتظار مرصود قصير مع إعادة تقييم مبكرة: حجزٌ قيد الطيران قد تُصحَّح قيمته الفعلية (الأصغر بكثير)
    // بعد أول استجابة، فينطلق المنتظر فورًا بدل الاستسلام لنوم كامل = إزالة فترات خمول النافذة.
    const wakeAt = Date.now() + (wait == null ? 60000 : Math.max(100, wait));
    for (;;) {
      await new Promise((r) => setTimeout(r, 1200));
      const now2 = Date.now();
      const used2 = tpmSpend.filter((s) => s.t + 60000 > now2).reduce((a, s) => a + s.tokens, 0);
      if (now2 >= wakeAt || used2 <= PACE_MARGIN || used2 + estTokens + PACE_MARGIN <= TPM_LIMIT) break;
    }
  }
}

function retryDelay(res, bodyText) {
  const ra = res && res.headers && res.headers.get('Retry-After');
  if (ra) {
    const s = parseFloat(ra);
    if (Number.isFinite(s)) return Math.min(s, 30);
  }
  if (bodyText) {
    const m = bodyText.match(/try again in\s+(\d+(?:\.\d+)?)\s*s/i);
    if (m) return Math.min(parseFloat(m[1]), 30);
  }
  return 15;
}

// ---------- اتصال موحّد (OpenAI-compatible) مع إعادة محاولة عند التحديد ----------
async function chat(messages, maxTokens = 3500, json = false, temperature = 0.25) {
  if (!AI_API_KEY) throw new Error('NO_AI_KEY');
  const inputChars = messages.reduce((a, m) => a + String(m.content || '').length, 0);
  // حجز متقارب مع الواقع: الناتج الفعلي (~1200-1400 توكنًا) لا يقترب أبدًا من حد max_tokens،
  // ففرض max_tokens كاملًا كان يبخس النافذة ويجدول الأجزاء تعاقبيًا رغم اتساع السقف.
  const estTokens = inputChars > 0 ? Math.ceil(inputChars / learnedCharsPerToken) + Math.min(maxTokens, 1400) : maxTokens + 200;
  const reservation = await paceTokens(estTokens);
  let lastErr = null;
  let retries = 0;
  const started = Date.now();
  let done = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    let res;
    try {
      res = await fetch(`${AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
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
      // تصحيح رصيد النافذة بالاستهلاك الفعلي (تُستخدم التوكنات المقاسة، لا التقدير المحجوز)
      // وتعلّم نسبة الأحرف/توكن الحقيقية للنموذج لتفادي التقدير الخاطئ مستقبلًا.
      const usage = data && data.usage;
      if (usage && Number.isFinite(usage.prompt_tokens) && Number.isFinite(usage.completion_tokens)) {
        reservation.tokens = usage.prompt_tokens + usage.completion_tokens;
        if (inputChars > 50 && usage.prompt_tokens > 0) {
          const observed = inputChars / usage.prompt_tokens;
          if (Number.isFinite(observed) && observed > 0) {
            // تقارب أسرع نحو النسبة الحقيقية (النص العربي ≈ 1.4) مع قيد أمان لا ينكسر
            learnedCharsPerToken = Math.max(1.2, Math.min(4.0, learnedCharsPerToken * 0.6 + observed * 0.4));
          }
        }
      }
      recordAiCall({ model: AI_MODEL, source: 'pipeline', ms: Date.now() - started, ok: true, retries });
      if (process.env.DEBUG_AI === '1') console.error(`[AI] ms=${Date.now() - started} in=${usage ? usage.prompt_tokens : '?'} out=${usage ? usage.completion_tokens : '?'} retries=${retries} chars=${inputChars}`);
      done = true;
      return out;
    }
    const throttled = res.status === 429 || res.status === 503 || res.status === 408;
    if (!throttled) {
      recordAiCall({ model: AI_MODEL, source: 'pipeline', ms: Date.now() - started, ok: false, retries });
      reservation.tokens = 0;
      done = true;
      throw new Error('AI_ERROR: ' + text.slice(0, 300));
    }
    if (attempt === 5) {
      recordAiCall({ model: AI_MODEL, source: 'pipeline', ms: Date.now() - started, ok: false, retries: retries + 1 });
      reservation.tokens = 0;
      done = true;
      throw new Error('AI_ERROR: ' + text.slice(0, 300));
    }
    retries++;
    const d = Math.min(retryDelay(res, text) + attempt * 2, 60);
    await new Promise((r) => setTimeout(r, d * 1000));
  }
  if (!done) {
    reservation.tokens = 0;
    recordAiCall({ model: AI_MODEL, source: 'pipeline', ms: Date.now() - started, ok: false, retries });
  }
  throw lastErr || new Error('AI_ERROR_UNKNOWN');
}

// ---------- استخلاص JSON آمن من نص النموذج ----------
function extractJson(raw) {
  let t = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

function normKey(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FFa-z0-9]/gi, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

// ---------- تقسيم الوثيقة الكاملة إلى أجزاء متراكبة + وسم صفحات ----------
export function annotatePageSplits(text) {
  // علامات نهاية صفحات pdf-parse قد تظهر كـ \f أو سطر "Page N" أو "صفحة N"
  let t = text.replace(/\r/g, '');
  t = t.replace(/(^|\n)\s*(Page\s*\d+|صفحة\s*\d+|Slide\s*\d+)(\s*[.:]?\s*|\n)/gi, '\n[[PAGE:$2]]\n');
  t = t.replace(/\f/g, '\n[[PAGE_BREAK]]\n');
  return t;
}

export function chunkContent(full) {
  const chunks = [];
  const len = full.length;
  if (len <= ENGINE_CHUNK_SIZE) {
    return [{ text: full, index: 0, total: 1 }];
  }
  let i = 0;
  let k = 0;
  while (i < len) {
    const end = Math.min(i + ENGINE_CHUNK_SIZE, len);
    chunks.push({ text: full.slice(i, end), index: k, total: 1 });
    if (end >= len) break;
    i = end - CHUNK_OVERLAP;
    k++;
  }
  chunks.forEach((c) => { c.total = chunks.length; });
  return chunks;
}

// ---------- محرك 1+2: DocumentReader + MedicalReasoning (قراءة + خريطة معرفية في استدعاء واحد) ----------
// يجمع القراءة الكاملة والاستدلال الطبي ليُرسَل نص الجزء إلى النموذج مرة واحدة فقط
// بدل 4 مرات سابقًا (القراءة، الخريطة، الأسئلة، التحقق) — أسرع بكثير تحت حد توكنات الطبقة المجانية.
const READGRAPH_SYSTEM = `أنت محرك قراءة وفهم مستندات علمية/طبية + محرك استدلال طبي (Document Reader + Medical Reasoning / Knowledge Mapping) بعقل طبيب.
اقرأ الجزء المعطى كاملًا دون اقتطاع وانقل المعلومة كما هي؛ لا تلخص الجزء كاملًا، ولا تضيف معرفة خارجية، ولا تخترع عناوين أو أرقام صفحات.
استخرج:
1) بنية الجزء: العناوين الرئيسية/الفرعية كما وردت حرفيًا في النص.
2) الجداول/صفوف البيانات (حتى بفواصل "|") مع وصف مختصر لمضمونها.
3) الأسئلة/الأجوبة الواردة حرفيًا في النص (س:/ج:/Q:/A:) مع قسمها.
4) أرقام الصفحات ((PAGE:..)) المكتوبة فعلًا في الجزء (لا تخترعها).
5) نموذج المعرفة Knowledge Graph: مفاهيم Concepts (مصطلح + تعريف كما ورد + أهمية 1-100 + القسم)؛ علاقات Relations منطقية (يسبب، يُصنّف ضمن، يُشخّص بـ، يعالج بـ، مضاعفة لـ، يُوقى بـ، من أعراض)؛ قيم/أرقام Values مهمة بسياقها (جرعات، قيم مخبرية، نسب، مدد)؛ High-Yield نقاط عالية العائد للامتحان؛ مقارنات Comparisons بين مفاهيم؛ استثناءات Exceptions وتحذيرات؛ needsVerification لأي جملة غير مدعومة قطعًا بالجزء — لا تخمنها.
خذ كل التفاصيل، لا تختصر المعلومات الهامة، كل عنصر بلغة النص ومربوط بقسمه. ناتج JSON محكم فقط.`;

export async function readGraphEngine(chunkText, title, idx, total) {
  const raw = await chat([
    { role: 'system', content: READGRAPH_SYSTEM },
    {
      role: 'user',
      content: `اقرأ الجزء ${idx + 1} من ${total} من المحاضرة "${title}" كاملًا ثم أخرج JSON بكل مجموعات البيانات التالية:
{
 "sections": [{"heading": "العنوان كما ورد أو ''", "summary": "ما يغطيه هذا القسم (سطر واحد)", "topic": "الموضوع العلمي"}],
 "hasTables": false,
 "tableBlocks": ["وصف مختصر لكل جدول/صفوف بيانات إن وُجدت"],
 "hasEmbeddedQA": false,
 "embeddedQA": [{"question": "", "answer": "", "section": "القسم/الصفحة كما وردت"}],
 "readingNote": "READ_FULL",
 "unreadablePart": "",
 "concepts": [{"name": "المصطلح", "definition": "التعريف كما ورد", "importance": 50, "section": ""}],
 "relations": [{"subject": "", "relation": "causes|causes_classified_as|feature|symptom_of|diagnosed_by|treated_by|complication_of|prevented_by", "object": "", "section": ""}],
 "values": [{"statement": "القيمة/الرقم مع سياقه", "section": ""}],
 "highYield": ["نقطة عالية العائد من هذا الجزء"],
 "comparisons": [{"items": ["أ", "ب"], "difference": "الفرق كما ورد"}],
 "exceptions": ["استثناء/تحذير/تنبيه"],
 "needsVerification": ["جملة غير مدعومة قطعًا"]
}
قيد الكمية الإلزامي (لا تتجاوزه أبدًا — الجزء عالي العائد يُفضَّل): sections≤10، concepts≤12، relations≤16، values≤8، highYield≤6، comparisons≤4، exceptions≤4، embeddedQA≤4، tableBlocks≤4.
قيد الإيجاز الإلزامي: كل تعريف/جملة/قيمة/شرح في 6-12 كلمة كحد أقصى، والعنوان كما ورد فقط. لا تُطوّل أي حقل؛ الاختصار هو دقة الاستخدام هنا.
نص الجزء:
${chunkText}`,
    },
  ], 3000, true, 0.2);
  const p = extractJson(raw);
  if (!Array.isArray(p.sections) || !Array.isArray(p.concepts)) throw new Error('READGRAPH_INVALID');
  return p;
}

// ---------- محرك 3: QuestionGeneration (واضع الامتحان، 19 نوعًا) ----------
// يعمل على المستخلص البنيوي (أقسام + مفاهيم + قيم + علاقات) المستخرج من القراءة الكاملة
// ليتجنّب إعادة إرسال نص الجزء الثالثة مرة — مع بقاء كل سؤال مرتبطًا بمصدره الفعلي.
const QUESTION_SYSTEM = `أنت محرك توليد الأسئلة بعقل أستاذ جامعي واضع امتحانات طبية محترف (Medical Examiner).
لكل موضع اختباري فكّر: كيف يُسأل الطالب عن هذه المعلومة؟ ثم أنشئ أسئلة تختبر الفهم والربط والاستدلال السريري لا الحفظ أو النسخ.
الأنواع المتاحة (اختر الأنسب للمحتوى): تعريفية، مباشرة، اشرح/لماذا، قارن، اذكر/اسرد، رتّب خطوات (ordering)، أكمل، توصيل/مطابقة (matching: اربط مصطلحًا بتعريفه أو عنصرًا بمجموعته/بسببه/بعلاجه)، صح/خطأ، MCQ، حالة إكلينيكية قصيرة (مريض يعاني من... → ما التشخيص الأرجح؟ ما الاختبار التأكيدي؟ ما أفضل خطوة تالية؟ ما العلاج المناسب؟ ما المضاعفة؟).
قواعد خاصة للتوصيل (matching): 3-5 أزواج متكافئة من نفس السياق، خيارات اليمين واليسار مستقلة؛ واكتب pairs الصحيحة بنفس معرّفات الأطراف.
قواعد خاصة للترتيب (ordering): 3-5 خطوات/مراحل واضحة بترتيب صحيح لا يُلتبس.
قواعد مطلقة:
- اعتمد حصريًا على البيانات المقدمة المستخلصة من المحاضرة (Lecture Mode بلا هلوسة).
- لا سؤال مبني على معلومة خارج هذه الاستخلاصات؛ الحالة الإكلينيكية من معلومات المحاضرة نفسها.
- MCQ: 4 خيارات منطقية (مشتتات مقنعة من نفس السياق) وإجابة صحيحة واحدة واضحة.
- صح/خطأ: عبارة منطقية لا تشويه، وتوازن بين الصحيح والخاطئ.
- كل سطر بلغة واحدة نقية (عربي خالص أو إنجليزي خالص)، مع questionEn/questionAr معًا.
- لكل سؤال درجة صعوبة easy|medium|hard وأهمية importance 1-100 وtopic وpage (رقم الصفحة الكتابي فقط؛ إن لم يوجد فـ'').
- لا سؤالًا مكررًا (نصًا أو فكرة) ولا فارغًا ولا عامًا.
أنشئ ${QUESTIONS_PER_PART} سؤالًا فقط لا غير (عدّد بدقة)، عالي الجودة مغطيًا الأنواع التي يسمح بها المحتوى فعليًا. الإجابات والشرح في سطر أو سطرين بلا حشو. ناتج JSON محكم فقط.`;

export async function questionChunkEngine(readInfo, graphInfo, idx, total) {
  const sections = (readInfo && readInfo.sections || []).map((s) => `${s.heading}${s.topic ? ' — ' + s.topic : ''}`).join(' | ');
  const qaInDoc = (readInfo && readInfo.embeddedQA || []).map((q) => `${q.question}?${q.answer ? ' — ' + q.answer : ''}`).join(' | ');
  const concepts = (graphInfo && graphInfo.concepts || []).slice(0, 12).map((c) => c.name || '').filter(Boolean).join('، ');
  const vals = (graphInfo && graphInfo.values || []).slice(0, 8).map((v) => v.statement || '').join(' | ');
  const relations = (graphInfo && graphInfo.relations || []).slice(0, 15).map((r) => `${r.subject} ${r.relation} ${r.object}`).join(' | ');
  const highYield = (graphInfo && graphInfo.highYield || []).slice(0, 8).join(' | ');
  const raw = await chat([
    { role: 'system', content: QUESTION_SYSTEM },
    {
      role: 'user',
      content: `أنشئ أسئلة اختبار عن الجزء ${idx + 1} من ${total} من المحاضرة — اعتمادًا بالكامل على الاستخلاصات التالية:
الأقسام المكتشفة في هذا الجزء: ${sections || 'غير محددة'}
أسئلة واردة في الملف (استغل بعضها كسؤال للطالب بلا نسخ حرفي): ${qaInDoc || 'لا توجد'}
مفاهيم رئيسية (تأكد من تغطيتها): ${concepts || 'غير محددة'}
قيم هامة (اختر منها ما يصلح سؤالًا): ${vals || ''}
علاقات/ربط منطقي: ${relations || ''}
نقاط عالية العائد: ${highYield || ''}

ملاحظات:
- عدّد بدقة: ${QUESTIONS_PER_PART} أسئلة لا غير (لا أكثر ولا أقل).
- الإجابات والشرح/التصحيح موجزة (سطر أو سطران) — accuracy في الجوهر لا الحشو.
- إن كان المحتوى يسمح بعمق تفاعلي، تناول سؤالين على الأقل من نوعي التوصيل (matching) والترتيب (ordering) بقدر ما يسمح به المحتوى فعلًا (بلا تكرار فكرة سؤال آخر).

أخرج JSON:
{"questions":[
 {"type":"mcq","questionAr":"","questionEn":"","text":"س: ...\\nQ: ...","options":{"A":"","B":"","C":"","D":""},"correctAnswer":"","explanation":"شرح ومصدر الإجابة من المحاضرة","topic":"","difficulty":"easy|medium|hard","page":"","importance":50},
 {"type":"truefalse","text":"عبارة منطقية","options":null,"correctAnswer":"1","explanation":"","topic":"","difficulty":"","page":"","importance":0},
 {"type":"qa","questionAr":"","questionEn":"","text":"س: ...\\nQ: ...\\n\\nج: ...\\nA: ...","answerAr":"","answerEn":"","options":null,"correctAnswer":"","explanation":"","topic":"","difficulty":"","page":"","importance":0},
 {"type":"matching","questionAr":"س: وصّل كل عنصر بما يناسبه من العمود الآخر","questionEn":"Q: Match each item","text":"س: وصّل كل عنصر بالأعمدة\\nQ: Match each item","options":{"left":[{"id":"L1","label":"العنصر/المصطلح"},{"id":"L2","label":"..."}],"right":[{"id":"R1","label":"التعريف/المجموعة المقابلة"},{"id":"R2","label":"..."}],"pairs":[["L1","R1"],["L2","R2"]]},"correctAnswer":"[[\"L1\",\"R1\"],[\"L2\",\"R2\"]]","explanation":"مصدر كل ربط","topic":"","difficulty":"medium","page":"","importance":0},
 {"type":"ordering","questionAr":"رتّب الخطوات بالترتيب الصحيح","questionEn":"Order the steps","text":"رتّب الخطوات\\nOrder the steps","options":{"steps":[{"id":"S1","label":"الخطوة الأولى"},{"id":"S2","label":"الخطوة الثانية"},{"id":"S3","label":"الخطوة الثالثة"}]},"correctAnswer":"[\"S1\",\"S2\",\"S3\"]","explanation":"مصدر الترتيب","topic":"","difficulty":"medium","page":"","importance":0}
]}`,
    },
  ], 2600, true, 0.3);
  const p = extractJson(raw);
  if (!Array.isArray(p.questions) || !p.questions.length) throw new Error('QG_INVALID');
  return p.questions;
}

// ---------- محرك 4: QuestionValidation + Anti-Hallucination ----------
const VALIDATE_SYSTEM = `أنت محرك مراجعة جودة الأسئلة (Question Validation + Anti-Hallucination).
تُعطى نصًا مرجعيًا معتمدًا وبنك أسئلة ناتجًا. لكل سؤال طبّق الفحص السداسي:
(1) Accuracy: الإجابة مطابقة للنص حرفيًا أو استنتاجًا منطقيًا مباشرًا منه.
(2) Clarity: سؤال واضح بلا لبس.
(3) Grammar: سلامة اللغة.
(4) Source: المعلومة من المرجع وليس معرفة خارجية — Lecture Mode؛ أي سؤال لا يمكن إجابته من المرجع يتم إسقاطه، ولا تصنع معلومات/أرقام/صفحات.
(5) No Repetition: ليس تكرارًا لفكرة سؤال آخر.
(6) Single Correct Answer: إجابة صحيحة واحدة فقط (للـ MCQ خيارات منطقية).
القرار: احتفظ أو أعد الصياغة بلغة أكاديمية سليمة أو أسقط. لا تخترع رقم صفحة؛ ضع page فقط إن وُجد رقم حرفيًا في المرجع. أخرج القائمة النهائية للأسئلة المقبولة فقط مع الحقل grounding:"IN_DOCUMENT" لكل سؤال. كل سطر بلغة واحدة.
الأنواع البنيوية (matching وordering وqa): راجع منطقها وبنيتها فقط (تطابق الـ pairs مع المعرّفات في options، واكتمال الـ steps ووضوح الترتيب) دون تعديل الشكل، وأبقِها في المخرجات بنفس بنيتها إن كانت صحيحة؛ وأسقطها فقط إن كانت فارغة أو بلا معنى.`;

export async function validateQuestionsEngine(questions, referenceText) {
  if (!Array.isArray(questions) || !questions.length) return [];
  const raw = await chat([
    { role: 'system', content: VALIDATE_SYSTEM },
    {
      role: 'user',
      content: `=النص المرجعي المعتمد (بجزئه ذي الصلة)=
${referenceText.slice(0, 4500)}

=بنك الأسئلة المطلوب مراجعته=
${JSON.stringify(questions).slice(0, 6000)}

أخرج JSON فقط: {"questions":[أسئلة مقبولة بعد التحقق/إعادة الصياغة، مع الحقول: type, text, questionAr, questionEn, options, correctAnswer, explanation, topic, difficulty, page, importance, grounding="IN_DOCUMENT"]}`,
    },
  ], 1000, true, 0.2);
  const p = extractJson(raw);
  if (!Array.isArray(p.questions)) throw new Error('VAL_INVALID');
  return p.questions;
}

// ---------- محرك 5: SummaryMerger (High-Yield) ----------
const SUMMARY_SYSTEM = `أنت محرك الملخص الذكي (High-Yield Summary Engine) للدراسة المباشرة.
من البيانات المستخلصة (الهيكل، المفاهيم، العلاقات، القيم، النقاط عالية العائد، المقارنات، الاستثناءات، الأسئلة الواردة) اكتب ملخصًا أكاديميًا منظّمًا وجاهزًا للمذاكرة:
- يبدأ بـ **ملخص المحاضرة: <العنوان>** ثم أسطر عناوين بأسلوب **كلمة واحدة:** تنشئ أقسامًا Markdown.
- الأقسام المطلوبة بالترتيب إن توفرت بياناتها: الهدف/الفكرة العامة، **هيكل المحاضرة:** (مرقّم)، **المصنّف المعرفي للدرس:** (فئات حاضرة فعلًا فقط)، **المحاور المعرفية الرئيسية** (بالأهمية)، **High-Yield (متوقع في الامتحان):** (مرقّم قصير)، **قيم يجب حفظها:**، **فروق شائعة الالتباس (Common Confusions):**، **نقاط إكلينيكية (Clinical Pearls):**، **أسئلة واردة في المحاضرة (بحلولها):**، **تحتاج تحققًا (Needs Verification):** (فقط إن وُجدت).
- لا تختلق أي معلومة؛ كل ما تكتبه من البيانات المقدمة. أخرج JSON محكمًا أيضًا يعطي keyPoints وimportantTerms وreviewTopics وhighYield.`;

export async function summaryMergerEngine(data, title) {
  const cap = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);
  const concepts = cap(data.concepts, 70).map((c) => `${c.name}${c.definition ? ' — ' + c.definition.slice(0, 90) : ''}${c.section ? ' (' + c.section + ')' : ''}`).join('\n');
  const relations = cap(data.relations, 110).map((r) => `${r.subject} ${r.relation} ${r.object}`).join('\n');
  const values = cap(data.values, 40).map((v) => v.statement).join('\n');
  const highYield = cap(data.highYield, 40).join('\n');
  const comparisons = cap(data.comparisons, 30).map((c) => `${(c.items || []).join(' ↔ ')}: ${c.difference}`).join('\n');
  const exceptions = cap(data.exceptions, 30).join('\n');
  const needsVerification = cap(data.needsVerification, 15).join('\n');
  const embedded = cap(data.embeddedQA, 25).map((q) => `س: ${q.question} | ج: ${q.answer}${q.section ? ' (' + q.section + ')' : ''}`).join('\n');
  const sections = cap(data.sections, 40).map((s) => `${s.heading || ''}${s.summary ? ' — ' + s.summary : ''}`).join('\n');

  const raw = await chat([
    { role: 'system', content: SUMMARY_SYSTEM },
    {
      role: 'user',
      content: `العنوان: ${title}
=== البيانات المستخلصة ===
الهيكل:
${sections || '—'}
المفاهيم والتعريفات:
${concepts || '—'}
العلاقات:
${relations || '—'}
القيم المهمة:
${values || '—'}
النقاط عالية العائد:
${highYield || '—'}
المقارنات:
${comparisons || '—'}
الاستثناءات/التحذيرات:
${exceptions || '—'}
تحتاج تحققًا:
${needsVerification || '—'}
أسئلة واردة في المحاضرة:
${embedded || '—'}

أخرج JSON:
{"summary": "الملخص المنسق كاملًا أعلاه النمط",
 "keyPoints": ["نقطة تركيز يحتاجها الطالب"],
 "importantTerms": ["مصطلح (English)"],
"reviewTopics": ["موضوع يحتاج مراجعة (English)"],
  "highYield": ["نقطة عالية العائد"]}`,
    },
  ], 3000, true, 0.3);
  const p = extractJson(raw);
  if (!p.summary || !Array.isArray(p.keyPoints)) throw new Error('SUM_INVALID');
  return p;
}

// ---------- تجميع/تنقيح البيانات عبر الأجزاء ----------
function mergeUnique(list, keyFn = (x) => normKey(x)) {
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const k = keyFn(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

// مرجع تحقق بنيوي مكثّف (بدل إعادة إرسال النص الخام) — نفس مصادر الحقيقة مع توكنات أقل
function buildReferenceText(readInfo, graphInfo) {
  const parts = [];
  const sections = (readInfo && readInfo.sections || []).slice(0, 30)
    .map((s) => `${s.heading}${s.summary ? ' — ' + s.summary : ''}`).join('\n');
  if (sections) parts.push('الهيكل:\n' + sections);
  const embedded = (readInfo && readInfo.embeddedQA || []).slice(0, 15)
    .map((q) => `${q.question} — ${q.answer || ''}`).join('\n');
  if (embedded) parts.push('أسئلة واردة حرفيًا:\n' + embedded);
  const concepts = (graphInfo && graphInfo.concepts || []).slice(0, 60)
    .map((c) => `${c.name}${c.definition ? ' — ' + c.definition : ''}`).join('\n');
  if (concepts) parts.push('المفاهيم والتعريفات:\n' + concepts);
  const relations = (graphInfo && graphInfo.relations || []).slice(0, 80)
    .map((r) => `${r.subject} ${r.relation} ${r.object}`).join('\n');
  if (relations) parts.push('العلاقات:\n' + relations);
  const values = (graphInfo && graphInfo.values || []).slice(0, 40)
    .map((v) => v.statement || '').join('\n');
  if (values) parts.push('القيم:\n' + values);
  const highYield = (graphInfo && graphInfo.highYield || []).slice(0, 40).join('\n');
  if (highYield) parts.push('النقاط عالية العائد:\n' + highYield);
  const comparisons = (graphInfo && graphInfo.comparisons || []).slice(0, 25)
    .map((c) => `${(c.items || []).join(' ↔ ')}: ${c.difference || ''}`).join('\n');
  if (comparisons) parts.push('المقارنات:\n' + comparisons);
  const exceptions = (graphInfo && graphInfo.exceptions || []).slice(0, 20).join('\n');
  if (exceptions) parts.push('الاستثناءات:\n' + exceptions);
  return parts.join('\n\n');
}

// ---------- خط الأنابيب الرئيسي ----------
export async function runAnalysisPipeline(content, lectureTitle, onStage = null) {
  const annotated = annotatePageSplits(content);
  const chunks = chunkContent(annotated);
  const N = chunks.length;
  const concurrent = PIPELINE_CONCURRENCY > 1 && N > 1;

  // --- قياس الأداء وتقدير الزمن المتبقي (ETA) ---
  // زمن تقديري ابتدائي للجزء قبل توفر أي قياس حقيقي — مقارِب لدورتين من نافذة الدقيقة (قراءة + أسئلة/تحقق) على الطبقة المجانية
  const SEED_CHUNK_MS = 120000;
  const chunkTimes = [];
  const doneChunks = { n: 0 };
  const avgChunkMs = () => (chunkTimes.length ? chunkTimes.reduce((a, b) => a + b, 0) / chunkTimes.length : SEED_CHUNK_MS);
  const remChunks = () => N - doneChunks.n;
  // الملخص النهائي مُكثّف يُرسَل مرة واحدة → زمنه تقديري ~70% من زمن الجزء
  const summaryEstimateMs = () => Math.round(avgChunkMs() * 0.7);
  const etaOf = () => Math.max(1, Math.round((remChunks() * avgChunkMs() + summaryEstimateMs()) / 1000));
  let lastPct = 5;
  let lastMsg = '';
  const emit = (pct, message) => {
    if (typeof onStage !== 'function') return;
    lastPct = pct; lastMsg = message;
    onStage(pct, message, etaOf());
  };
  // نبض التقدم: يحدّث الزمن المتبقي دوريًا أثناء فترات الانتظار الطويلة (سقف التوكنات) ليبقى العرض حيًا
  const heartbeat = setInterval(() => {
    if (lastMsg && typeof onStage === 'function') onStage(lastPct, lastMsg, etaOf());
  }, 4000);
  emit(5, 'قراءة الملف وتجهيز الأجزاء' + (concurrent ? ' (تشغيل الأجزاء بتوازٍ)' : ''));

  try {
  const merged = {
    sections: [],
    tableBlocks: [],
    embeddedQA: [],
    concepts: [],
    relations: [],
    values: [],
    highYield: [],
    comparisons: [],
    exceptions: [],
    needsVerification: [],
    questions: [],
    unreadable: [],
  };
  const readingNotes = [];
  const doneA = { n: 0 }; const doneB = { n: 0 }; const doneC = { n: 0 };
  const pctOf = () => 5 + 45 * (doneA.n / N) + 25 * (doneB.n / N) + 10 * (doneC.n / N);

  // يعالج جزءًا واحدًا كاملًا (قراءة+خريطة → أسئلة → تحقق) ثم يجمّع نتيجته
  async function processChunk(chunk) {
    const t0 = Date.now();
    const i = chunk.index + 1;
    // المرحلة A+B: القراءة الكاملة + خريطة المعرفة في استدعاء واحد (نص الجزء يُرسل مرة واحدة)
    const info = await readGraphEngine(chunk.text, lectureTitle, chunk.index, chunk.total);
    doneA.n++;
    emit(pctOf(), `تحليل بنية المحاضرة وبناء خريطة المعرفة — الجزء ${i}/${N}` + (concurrent ? ' (بتوازٍ)' : ''));

    // المرحلة C: توليد الأسئلة (بعقل واضع الامتحان، مستفيدًا من البنية والخريطة)
    const questions = await questionChunkEngine({
      sections: info.sections || [],
      embeddedQA: info.embeddedQA || [],
    }, {
      concepts: info.concepts || [],
      relations: info.relations || [],
      values: info.values || [],
      highYield: info.highYield || [],
    }, chunk.index, chunk.total);
    doneB.n++;
    emit(pctOf(), `توليد الأسئلة الذكية — الجزء ${i}/${N}` + (concurrent ? ' (بتوازٍ)' : ''));

    const readInfo = {
      sections: info.sections || [],
      tableBlocks: info.tableBlocks || [],
      embeddedQA: info.embeddedQA || [],
      readingNote: info.readingNote || 'READ_FULL',
      unreadablePart: info.unreadablePart || '',
    };
    const graphInfo = {
      concepts: info.concepts || [],
      relations: info.relations || [],
      values: info.values || [],
      highYield: info.highYield || [],
      comparisons: info.comparisons || [],
      exceptions: info.exceptions || [],
      needsVerification: info.needsVerification || [],
    };

    // المرحلة D: المراجعة والتحقق (Question Validation + Anti-Hallucination)
    // تُنفَّذ فقط للبنوك الكبيرة لتوفير ميزانية التوكنات — التوليد يتضمن VERIFY مدمجًا،
    // ويلي الدمج تطهير محلي (منع تكرار/عمومية/فراغ).
    let validated = questions;
    if (questions.length >= VALIDATE_MIN_Q) {
      validated = await validateQuestionsEngine(questions, buildReferenceText(readInfo, graphInfo));
    }
    doneC.n++;
    chunkTimes.push(Date.now() - t0);
    if (chunkTimes.length > 6) chunkTimes.shift();
    emit(pctOf(), `مراجعة جودة الأسئلة ومنع الاختلاق — الجزء ${i}/${N}` + (concurrent ? ' (بتوازٍ)' : ''));
    doneChunks.n++;
    return { readInfo, graphInfo, validated, chunk };
  }

  // تجمّع عمال محدود: يعالج حتى PIPELINE_CONCURRENCY أجزاء دفعة واحدة.
  // فشل جزء معيّن لا يوقف الباقي: يُعاد له المحاولة مرة واحدة ثم يُتجاوز ويُسجَّل
  // (معالجة مستمرة للأجزاء الأخرى كما هو مطلوب في تحمّل الخطأ).
  const results = new Array(chunks.length).fill(null);
  const chunkFailures = [];
  let cursor = 0;
  async function processWithRetry(idx) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await processChunk(chunks[idx]);
      } catch (e) {
        chunkFailures.push({ index: idx + 1, attempt: attempt + 1, message: String(e.message || e).slice(0, 200) });
        if (attempt === 0) {
          emit(pctOf(), `الجزء ${idx + 1}/${N} لم يكتمل فورًا — إعادة المحاولة ثم المواصلة`);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }
    emit(pctOf(), `تجاوز الجزء ${idx + 1}/${N} (فشل مؤقت مستمر) والمواصلة بالباقي`);
    return null;
  }
  async function worker() {
    while (cursor < chunks.length) {
      const idx = cursor++;
      results[idx] = await processWithRetry(idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PIPELINE_CONCURRENCY, N) }, worker));
  const completedResults = results.filter(Boolean);
  if (!completedResults.length) {
    throw new Error('PIPELINE_FAILED: ' + chunkFailures.map((f) => `جزء ${f.index}: ${f.message}`).join(' | ').slice(0, 300));
  }

  for (const { readInfo, graphInfo, validated, chunk } of completedResults) {
    merged.sections.push(...(Array.isArray(readInfo.sections) ? readInfo.sections : []));
    merged.tableBlocks.push(...(Array.isArray(readInfo.tableBlocks) ? readInfo.tableBlocks : []));
    merged.embeddedQA.push(...(Array.isArray(readInfo.embeddedQA) ? readInfo.embeddedQA : []));
    merged.concepts.push(...(Array.isArray(graphInfo.concepts) ? graphInfo.concepts : []));
    merged.relations.push(...(Array.isArray(graphInfo.relations) ? graphInfo.relations : []));
    merged.values.push(...(Array.isArray(graphInfo.values) ? graphInfo.values : []));
    merged.highYield.push(...(Array.isArray(graphInfo.highYield) ? graphInfo.highYield : []));
    merged.comparisons.push(...(Array.isArray(graphInfo.comparisons) ? graphInfo.comparisons : []));
    merged.exceptions.push(...(Array.isArray(graphInfo.exceptions) ? graphInfo.exceptions : []));
    merged.needsVerification.push(...(Array.isArray(graphInfo.needsVerification) ? graphInfo.needsVerification : []));
    merged.questions.push(...(Array.isArray(validated) ? validated : []));

    if (readInfo.unreadablePart) merged.unreadable.push(`الجزء ${chunk.index + 1}: ${String(readInfo.unreadablePart).slice(0, 200)}`);
    const readNote = readInfo.readingNote || 'READ_FULL';
    if (readNote !== 'READ_FULL') readingNotes.push(`الجزء ${chunk.index + 1}: ${readNote}`);
  }

  // إزالة التكرار بين الأجزاء (مفاهيم/علاقات/أسئلة) قبل الدمج
  merged.sections = mergeUnique(merged.sections, (s) => normKey(s.heading + s.summary));
  merged.concepts = mergeUnique(merged.concepts, (c) => normKey(c.name));
  merged.relations = mergeUnique(merged.relations, (r) => normKey(r.subject + '#' + r.relation + '#' + r.object));
  merged.values = mergeUnique(merged.values, (v) => normKey(v.statement));
  merged.highYield = mergeUnique(merged.highYield);
  merged.needsVerification = mergeUnique(merged.needsVerification);
  merged.embeddedQA = mergeUnique(merged.embeddedQA, (q) => normKey(q.question));

  // ملاحظة القراءة الشاملة (شفافية كاملة: لا إعلان اكتمال إلا بعد القراءة)
  merged.fullReading = chunks.length === 1
    ? 'READ_COMPLETE: تمت قراءة الملف كاملًا في مسار واحد'
    : `READ_COMPLETE: تمت قراءة الملف كاملًا عبر ${chunks.length} أجزاء متتابعة بلا اقتطاع`;
  if (merged.unreadable.length) merged.fullReading += ' | تحتاج إعادة معالجة: ' + merged.unreadable.join('; ');
  if (chunkFailures.length) merged.fullReading += ' | أجزاء فشلت مؤقتًا واستُجيب بنتائج الباقي: ' + chunkFailures.map((f) => `جزء ${f.index}`).join('، ');

  // المرحلة D: الملخص الذكي الموحّد
  emit(86, 'بناء الملخص عالي العائد');
  const sum = await summaryMergerEngine(merged, lectureTitle);
  emit(93, 'تجهيز النتائج النهائية');

  // بيانات الأجزاء (الترتيب + نطاق الصفحات) تُخزَّن في document_chunks
  const chunksInfo = chunks.map((c, idx) => {
    const pageMatches = (c.text.match(/\[\[PAGE:([^\]]+)\]\]/g) || []).map((m) => m.replace(/\[\[PAGE:|\]\]/g, '').trim());
    return {
      index: idx + 1,
      total: chunks.length,
      charCount: c.text.length,
      pageFirst: pageMatches.length ? pageMatches[0] : null,
      pageLast: pageMatches.length ? pageMatches[pageMatches.length - 1] : null,
    };
  });

  return {
    summary: sum.summary,
    keyPoints: mergeUnique(sum.keyPoints || []),
    highYield: mergeUnique(sum.highYield || merged.highYield || []).slice(0, 10),
    structure: merged.sections.map((s) => s.heading || s.summary || '').filter(Boolean).slice(0, 16),
    importantTerms: mergeUnique(sum.importantTerms || []).slice(0, 20),
    reviewTopics: mergeUnique(sum.reviewTopics || []).slice(0, 14),
    tableBlocks: merged.tableBlocks.slice(0, 8),
    embeddedQA: merged.embeddedQA.slice(0, 20),
    needsVerification: merged.needsVerification.slice(0, 12),
    graph: {
      concepts: merged.concepts.slice(0, 120),
      relations: merged.relations.slice(0, 200),
      values: merged.values.slice(0, 80),
      comparisons: merged.comparisons.slice(0, 40),
      exceptions: merged.exceptions.slice(0, 40),
    },
    questions: merged.questions.slice(0, 140),
    reading: merged.fullReading,
    unreadable: merged.unreadable,
    chunksInfo,
  };
  } finally {
    clearInterval(heartbeat);
  }
}

export function engineAvailable() {
  return Boolean(AI_API_KEY);
}