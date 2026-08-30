import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Button, Spinner, Badge } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

const SUGGESTIONS = [
  'لخّص أهم 10 نقاط يجب حفظها من هذه المحاضرة',
  'اشرح لي هذا الموضوع كما لو كنت مدرّسًا',
  'ما الأسئلة المتوقعة في الامتحان من هذه المحاضرة؟',
  'قارن بين أهم المصطلحات المذكورة فيها',
];

export default function Chat() {
  const { id } = useParams();
  const [meta, setMeta] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [lastSources, setLastSources] = useState([]);
  const [lastFollowUps, setLastFollowUps] = useState([]);
  const endRef = useRef(null);

  useEffect(() => {
    api.get('/chat/' + id + '/history')
      .then((d) => { setMeta(d); setMessages(d.messages || []); })
      .catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput('');
    setSending(true);
    setErr('');
    setLastSources([]);
    setLastFollowUps([]);
    setMessages((m) => [...m, { role: 'user', content: message }]);
    try {
      const d = await api.post('/chat/' + id, { message });
      setMessages((m) => [...m, { role: 'assistant', content: d.reply }]);
      setLastSources(d.sources || []);
      setLastFollowUps(d.followUps || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6.5rem)] max-w-3xl mx-auto">
      {/* رأس */}
      <div className="flex items-center gap-3 pb-4">
        <Link to="/summaries" className="p-2 rounded-lg border border-soft text-muted hover:border-brand-400 transition">
          <Icon name="trending" className="w-4 h-4 rotate-180" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-extrabold text-main truncate">{meta ? meta.title : '...'}</h1>
          <p className="text-xs text-muted">اسأل أي شيء عن محتوى المحاضرة — الإجابة من المصدر فقط</p>
        </div>
      </div>

      {err && !sending && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg mb-3">{err}</div>}

      {/* الرسائل */}
      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-4 pb-4">
        {!messages.length && !sending && (
          <div className="text-center py-10">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white flex items-center justify-center shadow-glow mb-3">
              <Icon name="chat" className="w-7 h-7" />
            </div>
            <p className="text-sm text-muted mb-4">ابدأ محادثة مع محاضرة «{meta?.title || ''}». جرّب إحدى هذه الأسئلة:</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => send(s)} className="px-3 py-2 rounded-xl border border-soft bg-card text-xs font-bold text-main hover:border-brand-400 hover:shadow-soft transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-gradient-to-l from-brand-600 to-violet-600 text-white shadow-glow rounded-br-md' : 'bg-card border border-soft text-main rounded-bl-md'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-card border border-soft flex items-center gap-2">
              <Spinner className="w-4 h-4 text-brand-600" />
              <span className="text-xs text-muted">جارٍ البحث في المحاضرة...</span>
            </div>
          </div>
        )}

        {lastSources.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted">مصادر من المحاضرة</div>
            {lastSources.map((s, i) => <Badge key={i} tone="green">…{s.excerpt}</Badge>)}
          </div>
        )}
        {lastFollowUps.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted">أسئلة متابعة</div>
            <div className="flex flex-wrap gap-2">
              {lastFollowUps.map((f, i) => (
                <button key={i} onClick={() => send(f)} className="px-3 py-1.5 rounded-lg border border-soft bg-card text-xs font-bold text-brand-600 hover:border-brand-400 hover:shadow-soft transition">
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* الإدخال */}
      <div className="flex items-center gap-2 pt-3 border-t border-soft">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="اكتب سؤالك عن المحاضرة..."
          className="flex-1 px-4 py-3 rounded-xl border border-soft bg-card text-sm text-main outline-none focus:border-brand-400 focus:shadow-soft transition"
        />
        <Button onClick={() => send()} disabled={sending || !input.trim()}>
          {sending ? <Spinner className="w-5 h-5" /> : <Icon name="send" className="w-5 h-5" />}
        </Button>
      </div>
    </div>
  );
}