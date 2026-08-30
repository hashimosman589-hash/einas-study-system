import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Card, Badge, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

export default function Results() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/results').then((r) => { setResults(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-10 h-10 text-brand-600" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-main">الدرجات والملاحظات</h1>
        <p className="text-muted text-sm">سجل نتائجك، الدرجة والنسبة، وتحليل الإجابات الخاطئة مع توصيات الذكاء الاصطناعي</p>
      </div>

      {!results.length ? (
        <Card className="p-12 text-center text-muted">
          <Icon name="chart" className="w-12 h-12 mx-auto mb-3 opacity-40" />
          لم تنفّذ أي اختبار بعد. اذهب إلى قسم الاختبارات وابدأ.
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((r) => {
            const color = r.percentage >= 70 ? 'green' : r.percentage >= 40 ? 'amber' : 'red';
            return (
              <Link to={`/results/${r.id}`} key={r.id}>
                <Card className={`p-5 lift gradient-top ${r.percentage >= 70 ? '' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-bold text-main">{r.exam_title || `اختبار #${r.exam_id || '-'}`}</div>
                    <Badge tone={color}>{r.percentage}%</Badge>
                  </div>
                  <div className="text-3xl font-black gradient-text mb-1">{r.score} <span className="text-lg text-muted">/ {r.total}</span></div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{r.created_at}</span>
                    <Badge tone={color}>{r.percentage >= 70 ? 'ممتاز' : r.percentage >= 40 ? 'متوسط' : 'يحتاج مراجعة'}</Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {!results.length || results.length === 0 ? null : null}
    </div>
  );
}
