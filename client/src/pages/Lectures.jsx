import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { Card, Button, Badge, Spinner, Input, Progress } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';
import TranslationBox from '../components/TranslationBox.jsx';
import { useAuth } from '../lib/auth.jsx';

const STAGES = [
  { key: 'validating', label: 'التحقق من الملف' },
  { key: 'extracting', label: 'استخراج النص' },
  { key: 'chunking', label: 'تقسيم الأجزاء' },
  { key: 'analyzing', label: 'تحليل الأقسام' },
  { key: 'generating_questions', label: 'توليد الأسئلة' },
  { key: 'quality_review', label: 'مراجعة الجودة' },
];
const STAGE_RANK = Object.fromEntries(STAGES.map((s, i) => [s.key, i + 1]));

export default function Lectures() {
  const { user } = useAuth();
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([]);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [uploadPct, setUploadPct] = useState(0);
  const [procPct, setProcPct] = useState(0);
  const [procMsg, setProcMsg] = useState('');
  const [procEta, setProcEta] = useState(null);
  const [upEta, setUpEta] = useState(null);
  const [procStage, setProcStage] = useState('');
  const [procStatus, setProcStatus] = useState('');
  const [sectionsDone, setSectionsDone] = useState(0);
  const [sectionsTotal, setSectionsTotal] = useState(0);
  const [procPart, setProcPart] = useState(0);
  const [procPartsTotal, setProcPartsTotal] = useState(0);
  const [procPartPct, setProcPartPct] = useState(0);
  const [retryId, setRetryId] = useState(null);
  const pollRef = useRef(null);
  const upRef = useRef(null);
  const targetRef = useRef(null);
  const tickRef = useRef(null);

  const load = () => api.get('/lectures').then(setLectures).finally(() => setLoading(false));

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const finalizeFailed = (lectureId, errorMessage) => {
    setUploading(false);
    setProcStatus('failed');
    setProcStage('failed');
    setRetryId(lectureId);
    setErr(errorMessage || 'فشل التحليل');
  };

  const tick = async () => {
    if (!tickRef.current) return;
    try {
      // بعد تحديث الصفحة نتابع وظيفة المحاضرة المحددة تحديدًا (لا أحدث وظيفة عامة) لئلا يختلط التقدم بين الملفات
      const q = targetRef.current ? '/lectures/analysis-status?lectureId=' + targetRef.current : '/lectures/analysis-status';
      const s = await api.get(q);
      if (!s) {
        // لا توجد وظيفة قيد التتبع بعد (مثلًا بعد إعادة تشغيل الخادم): لا نخفي صندوق التقدم بل نبقيه حيًّا
        // وننقح حالة المحاضرة من المكتبة مباشرة (ready/error تظهر حتى بدون وظيفة بصرية).
        if (targetRef.current != null) {
          const rows = await api.get('/lectures');
          const row = rows.find((l) => l.id === targetRef.current);
          if (row && row.status === 'ready') return finalizeSuccess();
          if (row && (row.status === 'error' || row.status === 'failed')) {
            stopPoll();
            finalizeFailed(row.id, row.error_message || 'فشل التحليل');
            setTimeout(load, 400);
            return;
          }
          if (row) {
            setProcPct(row.progress || 0);
            setProcStage(row.current_stage || 'analyzing');
            setProcMsg(row.progress ? 'جارٍ تحليل الملف في الخلفية...' : 'إعادة الاتصال بالخادم...');
            setProcStatus('running');
            return;
          }
        }
        setProcStatus('running');
        return;
      }
      const isMine = targetRef.current == null || targetRef.current === s.lectureId;
      setProcPct(s.pct);
      setProcMsg(s.message || '');
      setProcStage(s.stage || '');
      setProcEta(typeof s.eta === 'number' ? s.eta : null);
      setSectionsDone(s.sectionsDone || 0);
      setSectionsTotal(s.sectionsTotal || 0);
      setProcPart(s.part || 0);
      setProcPartsTotal(s.partsTotal || 0);
      setProcPartPct(s.partPct || 0);
      if (isMine && s.status === 'completed') {
        stopPoll();
        setUploading(false);
        setProcStatus('completed');
        setProcPct(100);
        setProcStage('completed');
        setMsg(s.message || 'تم التحليل بنجاح');
        setFiles([]); setTitle(''); setSubject('');
        setTimeout(load, 600);
      } else if (isMine && s.status === 'failed') {
        stopPoll();
        finalizeFailed(s.lectureId, s.error || 'فشل التحليل');
        setTimeout(load, 600);
      } else {
        setProcStatus('running');
      }
    } catch { /* تجاهل مؤقت */ }
  };

  const finalizeSuccess = () => {
    stopPoll();
    setUploading(false);
    setProcStatus('completed');
    setProcPct(100);
    setProcStage('completed');
    setMsg('تم التحليل بنجاح');
    setFiles([]); setTitle(''); setSubject('');
    setTimeout(load, 400);
  };

  tickRef.current = tick;

  const startPolling = () => {
    stopPoll();
    pollRef.current = setInterval(() => tickRef.current && tickRef.current(), 1200);
  };

  useEffect(() => {
    api.get('/lectures').then((rows) => {
      setLectures(rows);
      setLoading(false);
      const active = rows.find((l) => l.status === 'processing' || l.status === 'queued');
      if (active && !pollRef.current) {
        targetRef.current = active.id;
        setUploading(true);
        startPolling();
      }
    }).finally(() => setLoading(false));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // startPolling/tick تُعرَّف في جسم المكوّن؛ الاعتماد على الرفض في أول حِمل فقط
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // منع التحديث/المغادرة أثناء رفع الملف أو التحليل الحيّ (التحديث يقطع رفع الملف فعليًّا).
  useEffect(() => {
    const onBefore = (e) => {
      if (uploading && procPct < 100) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [uploading, procPct]);

  const onUpload = async (e) => {
    e.preventDefault();
    if (!files.length) { setErr('يرجى اختيار ملف واحد على الأقل'); return; }
    setUploading(true); setErr(''); setMsg(''); setUploadPct(0); setProcPct(0); setProcMsg(''); setProcEta(null); setUpEta(null);
    setProcStatus(''); setProcStage(''); setRetryId(null); setSectionsDone(0); setSectionsTotal(0); setProcPart(0); setProcPartsTotal(0); setProcPartPct(0);
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (title) fd.append('title', title);
    if (subject) fd.append('subject', subject);
    try {
      const d = await api.uploadWithProgress('/lectures', fd, (p) => {
        setUploadPct(p);
        const now = Date.now();
        const last = upRef.current;
        upRef.current = { t: now, p };
        if (last && p > last.p && now > last.t && now - last.t > 120) {
          const pctPerMs = (p - last.p) / (now - last.t);
          const rem = Math.round((100 - p) / pctPerMs / 1000);
          setUpEta(rem > 0 && rem < 3600 && p < 99 ? rem : null);
        }
      });
      targetRef.current = d.id;
      if (d.status === 'ready') {
        // ملف متكرر: نتيجة محفوظة مستخدمة فورًا
        stopPoll();
        setUploading(false);
        setProcStatus('completed');
        setProcStage('completed');
        setProcPct(100);
        setMsg(d.message || 'تم الرفع والتحليل');
        setFiles([]); setTitle(''); setSubject('');
        setTimeout(load, 600);
        return;
      }
      setProcMsg(d.message || 'تم رفع الملف — بدء التحليل في الخلفية');
      startPolling();
    } catch (er) {
      stopPoll();
      setUploading(false);
      setErr(er.message);
    }
  };

  const retry = async () => {
    if (!retryId) return;
    setErr(''); setMsg('');
    setUploading(true);
    setProcStatus('running');
    setProcPct(0);
    setProcMsg('إعادة جدولة التحليل...');
    try {
      await api.post('/lectures/' + retryId + '/retry');
      targetRef.current = retryId;
      startPolling();
    } catch (er) {
      setUploading(false);
      setErr(er.message);
    }
  };

  const fmtEta = (sec) => {
    if (sec == null || !Number.isFinite(sec)) return '';
    if (sec <= 0) return '';
    if (sec < 60) return 'أقل من دقيقة';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m} دقيقة و ${s} ثانية` : `${m} دقيقة`;
  };

  const shownPct = Math.max(uploadPct, procPct);
  const shownMsg = procMsg || 'رفع الملف إلى الخادم...';

  const stageIndex = procStage ? (STAGE_RANK[procStage] || 0) : 0;

  const remove = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذه المحاضرة؟')) return;
    await api.del('/lectures/' + id);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-main">المحاضرات</h1>
        <p className="text-muted text-sm">ارفع PDF أو Word أو Excel أو صورًا (تُقرأ بالتعرف الضوئي) أو نصوصًا — يمكنك اختيار عدة ملفات لتحليلها معًا</p>
      </div>

      {/* نموذج الرفع */}
      <Card className="p-6 lift" gradientTop>
        <h2 className="font-extrabold text-main mb-4 flex items-center gap-2">
          <div className="p-2 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-600">
            <Icon name="upload" className="w-5 h-5" />
          </div>
          رفع محاضرة جديدة
        </h2>
        <form onSubmit={onUpload} className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-main mb-1.5">ملفات المحاضرة (حتى 10 ملفات — PDF / Word / Excel / صور ممسوحة / نص)</label>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff,image/*"
              onChange={(e) => setFiles([...e.target.files])}
              disabled={uploading}
              className="w-full px-3.5 py-2.5 rounded-xl border border-soft bg-white dark:bg-slate-800 text-main disabled:opacity-60"
            />
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-xs text-brand-700 dark:text-brand-300">
                    <Icon name="file" className="w-3.5 h-3.5" />
                    {f.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Input label="عنوان المحاضرة (اختياري)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: المحاضرة الثالثة - الكيمياء" />
          <Input label="المادة (اختياري)" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثال: كيمياء عضوية" />
          <div className="flex items-end">
            <Button type="submit" disabled={uploading} className="w-full">
              {uploading ? <Spinner className="w-5 h-5" /> : <Icon name="sparkles" className="w-5 h-5" />}
              {uploading ? (shownPct < 100 ? 'جارٍ الرفع والتحليل...' : 'اكتمل') : 'رفع وتحليل'}
            </Button>
          </div>
        </form>
        {(uploading || procStatus) && (
          <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-brand-50 to-violet-50 dark:from-brand-900/20 dark:to-violet-900/20 border border-brand-100 dark:border-brand-800/40">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-2 text-sm font-medium text-main">
                <Spinner className="w-4 h-4 text-brand-600" />
                {shownMsg}
              </span>
              <span className="text-lg font-extrabold gradient-text">{shownPct}%</span>
            </div>
            <Progress value={shownPct} className="h-3" />
            {procPartsTotal > 1 && procStatus === 'running' && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>الموقع داخل الملف: الجزء {procPart || 1} من {procPartsTotal}</span>
                  <span className="font-bold text-brand-600">{procPartPct}%</span>
                </div>
                <Progress value={procPartPct} className="h-1.5 mt-1" />
              </div>
            )}
            {procStage === 'analyzing' && sectionsTotal > 0 && (
              <p className="text-xs text-muted mt-2">
                تم تحليل {sectionsDone} من {sectionsTotal} أقسام
              </p>
            )}
            {procStage && procStatus !== 'completed' && procStatus !== 'failed' && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {STAGES.map((st) => {
                  const done = procStatus === 'completed' || (STAGE_RANK[st.key] < stageIndex);
                  const current = !done && STAGE_RANK[st.key] === stageIndex;
                  return (
                    <span
                      key={st.key}
                      className={
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium ' +
                        (done
                          ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : current
                            ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-muted')
                      }
                    >
                      <span>{done ? '✓' : current ? '⏳' : '•'}</span>
                      {st.label}
                    </span>
                  );
                })}
              </div>
            )}
            {procStatus === 'completed' && <p className="text-xs text-green-600 dark:text-green-400 mt-2">✓ اكتمل الرفع والتحليل بنجاح</p>}
            {procStatus === 'failed' && (
              <div className="mt-3 flex items-center gap-3">
                <Button onClick={retry} className="!w-auto !px-3 !py-1.5 !text-xs">
                  <Icon name="refresh" className="w-4 h-4 mr-1" />
                  إعادة المحاولة
                </Button>
              </div>
            )}
            {(shownPct < 100) && (
              <p className="text-xs text-muted mt-2">
                {uploadPct < 100 ? `رفع من جهازك: ${uploadPct}%${upEta ? ` — متبقي تقريبًا ${fmtEta(upEta)}` : ''}` : ''}
                {procPct > 0 && procEta > 0 && (
                  <span className="block mt-0.5">التحليل الذكي: {procPct}% — الزمن المتبقي تقريبًا {fmtEta(procEta)}</span>
                )}
                {procPct > 0 && (procEta == null || procEta <= 0) && <span className="block mt-0.5">جارٍ التحليل الذكي... قد يستغرق عدة دقائق حسب حجم الملف</span>}
              </p>
            )}
          </div>
        )}
        {msg && <div className="mt-4 text-sm text-green-600 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded-lg">{msg}</div>}
        {err && <div className="mt-4 text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{err}</div>}
      </Card>

      {/* قائمة المحاضرات */}
      <div>
        <h2 className="font-bold text-main mb-1">المكتبة المشتركة للمحاضرات ({lectures.length})</h2>
        <p className="text-xs text-muted mb-3">كل المحاضرات متاحة لجميع المستخدمين. يحذف المحاضرات المدير فقط من هذه القائمة.</p>
        {loading ? (
          <div className="flex justify-center py-10"><Spinner className="w-8 h-8 text-brand-600" /></div>
        ) : lectures.length ? (
          <div className="grid md:grid-cols-2 gap-4">
            {lectures.map((l) => (
              <Card key={l.id} className="p-5 lift">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-500 text-white shadow-glow shrink-0">
                      <Icon name="file" className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-main truncate">{l.title}</div>
                      <div className="text-xs text-muted truncate">{l.file_name}</div>
                    </div>
                  </div>
                  {user?.role === 'admin' && (
                    <button onClick={() => remove(l.id)} className="text-muted hover:text-red-500 shrink-0" title="حذف (مدير)">
                      <Icon name="trash" className="w-5 h-5" />
                    </button>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {l.status === 'ready' ? (
                    <Badge tone="green">محلّلة ✓</Badge>
                  ) : l.status === 'processing' ? (
                    <Badge tone="amber">جارٍ التحليل... {l.progress || 0}%</Badge>
                  ) : (l.status === 'error' || l.status === 'failed') ? (
                    <Badge tone="red">فشل التحليل</Badge>
                  ) : (
                    <Badge>قيد الانتظار</Badge>
                  )}
                  {l.subject && <Badge tone="blue">{l.subject}</Badge>}
                  <Badge tone="slate">{l.file_type}</Badge>
                </div>
                {l.owner_name && (
                  <div className="text-xs text-muted mt-2">رُفعت بواسطة: <b className="text-brand-600 dark:text-brand-400">{l.owner_name}</b></div>
                )}
                <div className="text-xs text-muted mt-1">{l.created_at}</div>
                <TranslationBox
                  parts={[l.title, l.subject ? `المادة: ${l.subject}` : '', l.file_name].filter(Boolean)}
                  className="mt-3"
                />
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center text-muted">
            <Icon name="file" className="w-12 h-12 mx-auto mb-3 opacity-40" />
            لا توجد محاضرات بعد. ارفع أول محاضرة لتبدأ رحلة المذاكرة الذكية.
          </Card>
        )}
      </div>
    </div>
  );
}