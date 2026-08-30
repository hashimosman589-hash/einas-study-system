import { Router } from 'express';
import { auth } from '../lib/auth.js';
import { translateText } from '../lib/ai.js';

const router = Router();
router.use(auth);

const MAX_INPUT = 4000;

// الترجمة الثنائية (العربية ⇄ English) — Translation Only
// يقبل نصًا واحدًا {text, to} أو عدة نصوص {texts: [], to}
// الرد: {text} أو {texts}
router.post('/', async (req, res) => {
  try {
    const to = req.body.to === 'ar' ? 'ar' : 'en';
    if (Array.isArray(req.body.texts)) {
      const list = req.body.texts.slice(0, 50).map((t) => String(t == null ? '' : t).slice(0, MAX_INPUT));
      const out = [];
      for (const item of list) out.push((await translateText(item, to)) ?? item);
      return res.json({ texts: out });
    }
    const text = String(req.body.text == null ? '' : req.body.text).slice(0, MAX_INPUT);
    if (!text.trim()) return res.status(400).json({ error: 'النص فارغ' });
    const translated = (await translateText(text, to)) ?? text;
    return res.json({ text: translated });
  } catch (e) {
    return res.status(500).json({ error: 'تعذّر إنشاء الترجمة: ' + (e.message || '') });
  }
});

export default router;