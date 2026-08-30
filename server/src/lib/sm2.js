// ============================================================
// SM-2 — التكرار المتباعد للبطاقات
// درجة التلقيم: 1=مرة أخرى، 3=صعب، 4=جيد، 5=سهل
// ============================================================

export const GRADE_LABELS = {
  1: 'أحتاج مرة أخرى', 3: 'صعب', 4: 'جيد', 5: 'سهل',
};

export const VALID_GRADES = [1, 3, 4, 5];

export const validGrade = (n) => VALID_GRADES.includes(n);

// الفترة التالية حسب حالة البطاقة (للعرض فقط)
export function stateLabel(state, days) {
  if (state === 'new') return 'جديدة';
  if (state === 'learning') return 'قيد التعلم';
  if (state === 'relearning') return 'مراجعة متعثرة';
  if (days <= 0) return 'مستحقة';
  if (days <= 6) return `تظهر بعد ${days} أيام`;
  if (days <= 40) return `تظهر بعد ${Math.round(days / 7)} أسابيع`;
  return `تظهر بعد ${Math.round(days / 30)} شهر${days >= 60 ? 'ين' : ''}`;
}

// تطبيق معادلة SM-2 (بأسلوب Anki المبسّط مع التعلّم وإعادة التعلم)
export function applySm2(card, grade) {
  const now = new Date();
  let { reps = 0, lapses = 0, ease = 2.5, interval = 0, state = 'new' } = card;
  reps = Number(reps) || 0;
  lapses = Number(lapses) || 0;
  ease = Number(ease) || 2.5;
  interval = Number(interval) || 0;

  if (grade < 3) {
    // إجابة خاطئة: إعادة البداية وفترة قصيرة
    reps = 0;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    interval = 1;
    state = 'relearning';
  } else {
    reps += 1;
    // معادلة المرونة الكلاسيكية: +0.1 لسهل، 0 لجيد، -0.14 لصعب
    ease = Math.max(1.3, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.max(interval + 1, Math.round(interval * ease));
    interval = Math.min(interval, 730);
    state = reps >= 3 ? 'review' : 'learning';
  }

  const due = new Date(now.getTime() + interval * 86400000);
  return {
    box: reps,
    easeNumber: Math.round(ease * 100) / 100,
    intervalDays: interval,
    reps,
    lapses,
    state,
    dueAt: due.toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

// بناء واجهة/خلف البطاقة من سؤال محفوظ
export function buildCardFromQuestion(q, opts) {
  try { opts = JSON.parse(q.options); } catch { opts = opts || null; }
  const correct = q.correct_answer == null ? '' : String(q.correct_answer).trim();
  const explanation = q.explanation ? String(q.explanation).trim() : '';
  let back = '';
  if (q.type === 'mcq' && opts && typeof opts === 'object') {
    if (opts[correct]) back = `الإجابة الصحيحة: ${opts[correct]}`;
    else if (Object.keys(opts).length) back = `الإجابة الصحيحة: ${correct}\n${Object.values(opts).join('\n')}`;
    else back = `الإجابة الصحيحة: ${correct}`;
  } else if (q.type === 'truefalse') {
    back = correct === '1' ? 'صحيح' : 'خطأ';
  } else {
    back = correct;
  }
  if (explanation && explanation !== back) back += `\n\nالتفسير: ${explanation}`;
  return {
    questionId: q.id,
    topic: q.topic || '',
    front: q.text,
    back: back || '—',
  };
}