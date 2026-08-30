// ============================================================
// مترجم محلي عربي ⇄ إنجليزي — يعمل دون مفتاح API
// Translation Only: لا يحلل ولا يغيّر المعنى ولا الإجابة ولا الخيارات.
// يحافظ على ترتيب الجمل والنقاط وA/B/C/D والأرقام،
// يستخدم المصطلحات الطبية المعتمدة، ويعرض أي مصطلح لا يمكن
// ترجمته بدقة بين قوسين (وفق قاعدة النظام).
// ============================================================

export function isArabicText(text) {
  if (!text) return false;
  const ar = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const en = (text.match(/[A-Za-z]/g) || []).length;
  return ar > en;
}

// ============ قاموس طبي وعام عربي → إنجليزي ============
const AR2EN = {
  // ضمائر وأدوات وكلمات وظيفية
  'هو': 'is', 'هي': 'is', 'هما': 'both are', 'اهم': 'most important', 'ذلك': 'that',
  'تلك': 'that', 'هذا': 'this', 'هذه': 'this', 'وهذا': 'and this', 'كما': 'as',
  'إذا': 'if', 'اذا': 'if', 'لكن': 'but', 'لكنها': 'but', 'لأن': 'because', 'لان': 'because',
  'عندما': 'when', 'حيث': 'where', 'بين': 'between', 'داخل': 'inside', 'خارج': 'outside',
  'فوق': 'above', 'تحت': 'below', 'قبل': 'before', 'بعد': 'after', 'خلال': 'during',
  'أثناء': 'during', 'اثناء': 'during', 'منذ': 'since', 'حوالي': 'approximately',
  'عبر': 'through', 'بواسطة': 'by', 'بواسطتها': 'by', 'جدا': 'very', 'أيضا': 'also',
  'ايضا': 'also', 'أيضًا': 'also', 'بالاضافة': 'in addition', 'بالإضافة': 'in addition',
  'ضمن': 'within', 'نحو': 'towards', 'لدى': 'has', 'يعد': 'is considered', 'تعد': 'is considered',
  'يعتبر': 'is considered', 'تعتبر': 'is considered', 'يتم': 'is', 'تتم': 'is', 'يمكن': 'can',
  'تكون': 'be', 'يكون': 'be', 'يوجد': 'there is', 'توجد': 'there is', 'تحتوي': 'contains',
  'يحتوي': 'contains', 'تتضمن': 'includes', 'يتضمن': 'includes', 'تشمل': 'includes',
  'يشمل': 'includes', 'تمثل': 'represents', 'يمثل': 'represents', 'تحدث': 'occurs',
  'يحدث': 'occurs', 'تبدأ': 'begins', 'يبدأ': 'begins', 'تنتهي': 'ends', 'ينتهي': 'ends',
  'تساعد': 'helps', 'يساعد': 'helps', 'تعمل': 'works', 'يعمل': 'works', 'تنتج': 'produces',
  'ينتج': 'produces', 'يصنع': 'produces', 'تفرز': 'secretes', 'يفرز': 'secretes',
  'تمتص': 'absorbs', 'يمتص': 'absorbs', 'تنقل': 'carries', 'ينقل': 'carries',
  'تنظيم': 'regulation', 'تنظيمية': 'regulatory', 'ينظم': 'regulates', 'تنظم': 'regulates',
  'تنقسم': 'divides', 'ينقسم': 'divides', 'تتكون': 'consists of', 'يتكون': 'consists of',
  'تركيب': 'structure', 'تكوين': 'formation', 'تؤدي': 'lead', 'يؤدي': 'leads',
  'يؤدي إلى': 'leads to', 'يسبب': 'causes', 'تسبب': 'causes', 'يزيد': 'increases',
  'تزيد': 'increases', 'يقلل': 'decreases', 'تقلل': 'decreases', 'يخفض': 'lowers',
  'ينخفض': 'decreases', 'نقصان': 'decrease', 'نقص': 'deficiency', 'فقدان': 'loss',
  'ارتفاع': 'rise', 'انخفاض': 'decrease', 'زيادة': 'increase', 'مهم': 'important',
  'مهمة': 'important', 'المهمة': 'important', 'أساسي': 'essential', 'اساسي': 'essential',
  'رئيسي': 'main', 'رئيسية': 'main', 'الأساسية': 'essential', 'الرئيسية': 'main',
  'الرئيسي': 'main', 'ثانوي': 'secondary', 'ثانوية': 'secondary', 'عام': 'general',
  'خاص': 'specific', 'خاصة': 'specifically', 'شائع': 'common', 'شائعة': 'common',
  'نادر': 'rare', 'نادرة': 'rare', 'حادة': 'acute', 'حاد': 'acute', 'مزمن': 'chronic',
  'مزمنة': 'chronic', 'خبيث': 'malignant', 'خبيثة': 'malignant', 'حميد': 'benign',
  'حميدة': 'benign', 'متلازمة': 'syndrome', 'معدل': 'rate', 'مستوى': 'level',
  'مستويات': 'levels', 'نسبة': 'percentage', 'كمية': 'amount', 'عدد': 'number',
  'جزء': 'part', 'اجزاء': 'parts', 'أجزاء': 'parts', 'أحد': 'one of', 'العديد': 'many',
  'كثير': 'many', 'كثيرة': 'many', 'بعض': 'some', 'جميع': 'all', 'كل': 'every',
  'أي': 'any', 'اي': 'any', 'كلها': 'all of them', 'أنواع': 'types', 'نوع': 'type',
  'أشكال': 'forms', 'الشكل': 'the form', 'حسب': 'according to', 'وفق': 'according to',
  'وظيفة': 'function', 'وظيفته': 'its function', 'وظيفتها': 'its function', 'الوظيفة': 'function',
  'وظائف': 'functions', 'دور': 'role', 'دوره': 'its role', 'الدور': 'role', 'أهمية': 'importance',
  'الأهم': 'most important', 'قيمة': 'value', 'فرق': 'difference', 'الفرق': 'difference',
  'مقارنة': 'comparison', 'بينهما': 'between them', 'التشابه': 'similarity',
  'أو': 'or', 'او': 'or', 'من': 'of', 'في': 'in', 'إلى': 'to', 'الى': 'to', 'على': 'on',
  'عن': 'about', 'مع': 'with', 'أن': 'that', 'ان': 'that', 'ولا': 'and no', 'التي': 'which',
  'الذي': 'which', 'مثل': 'such as', 'قد': 'may', 'كامل': 'complete', 'كاملة': 'complete',
  'بشكل': 'in a way', 'نفس': 'same', 'نفسه': 'itself', 'سواء': 'whether', 'وذلك': 'and that',
  'بذلك': 'by that', 'لذلك': 'therefore', 'وبالتالي': 'therefore', 'وبذلك': 'thereby',
  'لهذا': 'therefore', 'كالتالي': 'as follows', 'التالي': 'following', 'التالية': 'following',
  'أولا': 'first', 'ثانيا': 'second', 'ثالثا': 'third', 'أخيرا': 'finally', 'اخيرا': 'finally',
  'مما': 'which', 'ما': 'what', 'لماذا': 'why', 'كيف': 'how', 'اكثر': 'more', 'أكثر': 'more',
  'اقل': 'less', 'أقل': 'less', 'إذن': 'therefore', 'حتى': 'even', 'كليهما': 'both',
  'خصوصا': 'especially', 'لا': 'does not', 'ليس': 'is not', 'ليست': 'is not', 'غير': 'not',
  'عدم': 'lack of', 'منع': 'prevention', 'يمنع': 'prevents', 'وقاية': 'prevention',
  'الوقاية': 'prevention', 'ثم': 'then', 'ولكن': 'but', 'ضد': 'against', 'معا': 'together',
  'فيه': 'in it', 'فيها': 'in it', 'إليه': 'to it', 'علينا': 'on us', 'معه': 'with it',
  'للجسم': 'of the body', 'بالجسم': 'in the body', 'لدعم': 'to support', 'حدوث': 'occurrence',
  'حالة': 'condition', 'الحالة': 'the case', 'الحالات': 'cases', 'صورة': 'image', 'هورميون': 'hormone',
  // مفاهيم طبية
  'الجسم': 'the body', 'جسم': 'body', 'أجهزة': 'organs', 'اجهزة': 'organs', 'جهاز': 'system',
  'الجهاز': 'system', 'الأجهزة': 'systems', 'الخلايا': 'cells', 'الخلية': 'cell', 'خلية': 'cell',
  'النواة': 'nucleus', 'الغشاء': 'membrane', 'السيتوبلازم': 'cytoplasm', 'الميتوكوندريا': 'mitochondria',
  'الريبوسوم': 'ribosome', 'الانقسام': 'division', 'الانقسام المتساوي': 'mitosis',
  'الانقسام الميوزي': 'meiosis', 'الكروموسوم': 'chromosome', 'الكروموسومات': 'chromosomes',
  'الجين': 'gene', 'الجينات': 'genes', 'الوراثة': 'heredity', 'جينات': 'genes',
  'الحمض النووي': 'DNA', 'الدنا': 'DNA', 'الرنا': 'RNA', 'البروتين': 'protein',
  'البروتينات': 'proteins', 'الأحماض الأمينية': 'amino acids', 'احماض أمينية': 'amino acids',
  'الإنزيم': 'enzyme', 'الانزيم': 'enzyme', 'الانزيمات': 'enzymes', 'الإنزيمات': 'enzymes',
  'القلب': 'heart', 'الدماغ': 'brain', 'الكبد': 'liver', 'الرئة': 'lung', 'الرئتان': 'the lungs',
  'الكلى': 'kidney', 'الكليتان': 'the kidneys', 'الكليتين': 'the kidneys', 'الكلية': 'kidney',
  'المعدة': 'stomach', 'البنكرياس': 'pancreas', 'الطحال': 'spleen', 'المرارة': 'gallbladder',
  'الأمعاء': 'intestine', 'الأمعاء الدقيقة': 'small intestine', 'الأمعاء الغليظة': 'large intestine',
  'المريء': 'esophagus', 'الحنجرة': 'larynx', 'القصبة الهوائية': 'trachea',
  'الشعب الهوائية': 'bronchi', 'الحويصلات': 'alveoli', 'الحويصلات الهوائية': 'alveoli',
  'العضلات': 'muscles', 'عضلة': 'muscle', 'العظام': 'bones', 'عظم': 'bone',
  'نخاع العظم': 'bone marrow', 'الجلد': 'skin', 'الشعر': 'hair', 'الأظافر': 'nails',
  'الأسنان': 'teeth', 'اللسان': 'tongue', 'العين': 'eye', 'الأذن': 'ear', 'الأنف': 'nose',
  'الغدة': 'gland', 'الغدد': 'glands', 'الغدة الدرقية': 'thyroid gland',
  'الغدة النخامية': 'pituitary gland', 'الغدد الليمفاوية': 'lymph nodes', 'العقد الليمفاوية': 'lymph nodes',
  'العصب': 'nerve', 'الاعصاب': 'nerves', 'الأعصاب': 'nerves', 'الخلايا العصبية': 'neurons',
  'العصبونات': 'neurons', 'الحبل الشوكي': 'spinal cord',
  // دم وأوعية
  'الدم': 'blood', 'الصفائح الدموية': 'platelets', 'الكريات الحمراء': 'red blood cells',
  'الكريات البيضاء': 'white blood cells', 'الكريات': 'blood cells', 'الحمراء': 'red cells',
  'خضاب': 'hemoglobin', 'خضاب الدم': 'hemoglobin', 'الهيموجلوبين': 'hemoglobin',
  'الأوعية الدموية': 'blood vessels', 'الشرايين': 'arteries', 'الأوردة': 'veins',
  'الشعيرات الدموية': 'capillaries', 'البلازما': 'plasma', 'الجهاز الدوري': 'cardiovascular system',
  'الدورة الدموية': 'circulatory system', 'النبض': 'pulse', 'ضغط الدم': 'blood pressure',
  'تجلط': 'clotting', 'تخثر': 'coagulation', 'فصائل الدم': 'blood groups',
  'فصيلة الدم': 'blood group', 'الحديد': 'iron', 'النزف': 'bleeding', 'نزيف': 'bleeding',
  'فقر الدم': 'anemia', 'الأنيميا': 'anemia', 'فقر': 'deficiency', 'الحد الطبيعي': 'the normal limit',
  'نقص الحديد': 'iron deficiency', 'فقر الحديد': 'iron deficiency', 'مكملات الحديد': 'iron supplements',
  'خلايا الدم الحمراء': 'red blood cells', 'الكريات البيضاء': 'white blood cells', 'المعالجة الغذائية': 'nutritional therapy',
  'الحد': 'limit',
  // سوائل وأجهزة
  'اللمف': 'lymph', 'الهرمون': 'hormone', 'الهرمونات': 'hormones', 'الأنسولين': 'insulin',
  'الأدرينالين': 'adrenaline', 'الجلوكوز': 'glucose', 'السكر': 'sugar', 'السكري': 'diabetes',
  'اليوريا': 'urea', 'البول': 'urine', 'العرق': 'sweat', 'اللعاب': 'saliva',
  'العصارة الصفراوية': 'bile', 'الصفراء': 'bile', 'المني': 'semen', 'البويضة': 'egg',
  'الحيوان المنوي': 'sperm', 'الجنين': 'fetus', 'المشيمة': 'placenta', 'تسارع القلب': 'tachycardia',
  'ضيق النفس': 'shortness of breath',
  // أحياء دقيقة ومناعة
  'البكتيريا': 'bacteria', 'جرثومة': 'bacterium', 'الفيروس': 'virus', 'الفيروسات': 'viruses',
  'الفطريات': 'fungi', 'الطفيليات': 'parasites', 'الكائنات الدقيقة': 'microorganisms',
  'الأجسام المضادة': 'antibodies', 'الجسم المضاد': 'antibody', 'المستضد': 'antigen',
  'المستضدات': 'antigens', 'الجهاز المناعي': 'immune system', 'الخلايا التائية': 'T-cells',
  'الخلايا البائية': 'B-cells', 'البلعميات': 'phagocytes', 'التطعيم': 'vaccination',
  'اللقاح': 'vaccine', 'الميكروب': 'microbe', 'السموم': 'toxins', 'السم': 'toxin',
  'مناعة': 'immunity', 'المناعة': 'immunity',
  // أمراض وحالات
  'مرض': 'disease', 'المرض': 'disease', 'الأمراض': 'diseases', 'الأعراض': 'symptoms',
  'أعراض': 'symptoms', 'السبب': 'cause', 'النتيجة': 'result', 'نتيجة': 'result',
  'الالتهاب': 'inflammation', 'بكتيريه': 'bacterial', 'بكتيري': 'bacterial', 'فيروسي': 'viral',
  'السرطان': 'cancer', 'الورم': 'tumor', 'الاورام': 'tumors', 'الأورام': 'tumors',
  'الحمى': 'fever', 'السعال': 'cough', 'الألم': 'pain', 'التعب': 'fatigue', 'الشحوب': 'pallor',
  'الدوار': 'dizziness', 'الدوخة': 'dizziness', 'الغثيان': 'nausea', 'القيء': 'vomiting',
  'الإمساك': 'constipation', 'الإسهال': 'diarrhea', 'الضيق': 'tightness', 'العدوى': 'infection',
  'التشخيص': 'diagnosis', 'فحص': 'examination', 'الفحص': 'examination', 'الاختبار': 'test',
  'اختبار': 'test', 'أسئلة': 'questions', 'اسئلة': 'questions', 'سؤال': 'question',
  'إجابة': 'answer', 'اجابة': 'answer', 'الاجابة': 'answer', 'الإجابة': 'answer',
  'خيارات': 'options', 'الخيارات': 'options', 'صحيح': 'true', 'الصحيحة': 'the correct',
  'خطأ': 'false', 'خطا': 'false', 'المقابل': 'versus', 'مصطلح': 'term', 'المصطلح': 'term',
  'المصطلحات': 'terms', 'المقصود': 'meant', 'عبارة': 'statement', 'العبارة': 'statement',
  'النص': 'text', 'الجزء': 'part', 'الفصل': 'chapter', 'قسم': 'section', 'القسم': 'section',
  'غير وارد': 'not mentioned', 'غير وارد بالمحاضرة': 'a term not mentioned in the lecture',
  'كل ما سبق': 'all of the above', 'الهدف': 'the aim', 'هدف': 'aim', 'فكرة': 'idea',
  'الفكرة': 'the idea', 'الهدف العام': 'the general aim', 'لأهم': 'most important',
  'أهم نقطة': 'key point', 'النقطة': 'point', 'نقاط': 'points', 'التركيز': 'focus',
  'الأكسجين': 'oxygen', 'ثاني أكسيد الكربون': 'carbon dioxide',
  // مغذيات وعناصر
  'الغذاء': 'food', 'الغذائية': 'nutritional', 'الغذائي': 'nutritional', 'التغذية': 'nutrition',
  'المواد الغذائية': 'nutrients', 'الدهون': 'fats', 'الكربوهيدرات': 'carbohydrates',
  'النشويات': 'starches', 'الأملاح': 'salts', 'المعادن': 'minerals', 'الفيتامين': 'vitamin',
  'الفيتامينات': 'vitamins', 'فيتامين': 'vitamin', 'حمض الفوليك': 'folate',
  'الكالسيوم': 'calcium', 'البوتاسيوم': 'potassium', 'الصوديوم': 'sodium',
  'المغنيسيوم': 'magnesium', 'الزنك': 'zinc', 'النحاس': 'copper', 'اليود': 'iodine',
  'الفلورايد': 'fluoride', 'الماء': 'water', 'السوائل': 'fluids', 'الألياف': 'fiber',
  'الكولسترول': 'cholesterol', 'الشحوم': 'lipids', 'البروتين': 'protein',
  'مكملات': 'supplements', 'المكملات': 'supplements', 'معالجة': 'treatment',
  'المعالجة': 'treatment', 'علاج': 'treatment', 'علاجه': 'its treatment', 'العلاج': 'treatment',
  // مفاهيم علوم عامة
  'التنفس': 'respiration', 'الهضم': 'digestion', 'الامتصاص': 'absorption', 'الإفراز': 'secretion',
  'الحركة': 'movement', 'الإحساس': 'sensation', 'الرؤية': 'vision', 'السمع': 'hearing',
  'الشم': 'smell', 'التذوق': 'taste', 'الذاكرة': 'memory', 'التركيز': 'concentration',
  'التفكير': 'thinking', 'السلوك': 'behavior', 'التعلم': 'learning', 'الذكاء': 'intelligence',
  'النوم': 'sleep', 'الجينوم': 'genome', 'الطفرات': 'mutations', 'الطفرة': 'mutation',
  'التنوع': 'diversity', 'البيئة': 'environment', 'الصوت': 'sound', 'العنصر': 'element',
  'العناصر': 'elements', 'المركب': 'compound', 'المركبات': 'compounds', 'الجزيء': 'molecule',
  'الجزيئات': 'molecules', 'الذرة': 'atom', 'الذرات': 'atoms', 'الرابطة': 'bond',
  'الروابط': 'bonds', 'التفاعل': 'reaction', 'التفاعلات': 'reactions', 'الحرارة': 'temperature',
  'الطاقة': 'energy', 'البخار': 'vapor', 'الغاز': 'gas', 'الغازات': 'gases', 'السائل': 'liquid',
  'الصلب': 'solid', 'الكثافة': 'density', 'الكتلة': 'mass', 'الحجم': 'volume', 'الوزن': 'weight',
  'الطول': 'length', 'المسافة': 'distance', 'السرعة': 'speed', 'التسارع': 'acceleration',
  'القوة': 'force', 'الشحنة': 'charge', 'التيار': 'current', 'الجهد': 'voltage',
  'المقاومة': 'resistance', 'الموجة': 'wave', 'التردد': 'frequency', 'الضوء': 'light',
  'اللون': 'color', 'المغناطيس': 'magnet', 'المغناطيسي': 'magnetic', 'الجاذبية': 'gravity',
  'الكهرباء': 'electricity', 'الدائرة': 'circuit', 'الساعة': 'hour',
  'المعادلة': 'equation', 'المعادلات': 'equations', 'المتغير': 'variable', 'المتغيرات': 'variables',
  'الثابت': 'constant', 'الدالة': 'function', 'الدوال': 'functions', 'المشتقة': 'derivative',
  'التكامل': 'integral', 'الاحتمال': 'probability', 'المتوسط': 'mean',
  'الانحراف': 'deviation', 'الانحراف المعياري': 'standard deviation', 'البيانات': 'data',
  'الجدول': 'table', 'الرسم': 'graph', 'النتائج': 'results', 'طريقة': 'method', 'الطرق': 'methods',
  'خطوات': 'steps', 'خطوة': 'step', 'قانون': 'law', 'القانون': 'law', 'النظرية': 'theory',
  'القاعدة': 'rule', 'القواعد': 'rules', 'الطبيعي': 'normal', 'الطبيعية': 'normal',
  'الخوارزمية': 'algorithm', 'البرمجة': 'programming', 'المعالج': 'processor', 'الشبكة': 'network',
  'الإنترنت': 'internet', 'البرنامج': 'program', 'معلومات': 'information', 'المعلومات': 'information',
  'الملف': 'file', 'الملفات': 'files', 'النظام': 'system', 'الأنظمة': 'systems',
  'عملية': 'process', 'العملية': 'process', 'العمليات': 'processes', 'الحيوانات': 'animals',
  'النباتات': 'plants', 'النبات': 'plant', 'التربة': 'soil', 'المناخ': 'climate',
  'الطقس': 'weather', 'المجتمع': 'society', 'الغالبية': 'majority', 'الأغلبية': 'majority',
  'النسبة': 'ratio', 'النسب': 'ratios', 'الفرع': 'branch', 'الفروع': 'branches',
  'الحد الأقصى': 'maximum', 'الحد الأدنى': 'minimum', 'الملاحظة': 'observation',
  'التجربة': 'experiment', 'الاستنتاج': 'conclusion', 'المصدر': 'source', 'الآلية': 'mechanism',
  'الية': 'mechanism', 'العوامل': 'factors', 'العامل': 'factor', 'المخاطر': 'risks',
  'خطر': 'risk', 'الفحوصات': 'tests', 'التحاليل': 'lab tests', 'التحليل': 'analysis',
  'تحليل': 'analysis', 'الشفاء': 'recovery', 'التحسن': 'improvement',
  'التكاثر': 'reproduction', 'النمو': 'growth', 'التطور': 'development', 'الاستجابة': 'response',
  'العمليات الحيوية': 'vital processes', 'الأساسية للخلايا': 'essential for cells',
  'الغذائية المكملات': 'dietary supplements', 'التهاب': 'inflammation',
  'يشرح': 'explains', 'شرح': 'explanation', 'أساسيات': 'basics', 'اساسيات': 'basics',
  'أساس': 'basis', 'مخبري': 'laboratory', 'معملي': 'laboratory', 'الطب': 'medicine',
  'طبية': 'medical', 'طبي': 'medical', 'الطبية': 'medical', 'العامة': 'the general',
  'العام': 'general', 'الفكرة العامة': 'the general idea', 'الهدف العام': 'the general aim',
  'يقلل‌': 'reduces', 'يلعب': 'plays', 'منعًا': 'to avoid', 'وكذلك': 'and likewise',
  'وبشكل': 'and in a way', 'بشكل عام': 'in general', 'بصفة عامة': 'in general',
  'جزءا': 'a part of', 'يمر': 'passes', 'يعبر': 'crosses', 'يصل': 'reaches', 'يحمل': 'carries',
};

// عبارات إنجليزية مركبة → عربية (تُطبق قبل الترجمة كلمة-كلمة)
const EN_PHRASES = {
  'red blood cells': 'الكريات الحمراء',
  'white blood cells': 'الكريات البيضاء',
  'immune system': 'الجهاز المناعي',
  'small intestine': 'الأمعاء الدقيقة',
  'large intestine': 'الأمعاء الغليظة',
  'blood pressure': 'ضغط الدم',
  'blood vessels': 'الأوعية الدموية',
  'spinal cord': 'الحبل الشوكي',
  'bone marrow': 'نخاع العظم',
  'shortness of breath': 'ضيق النفس',
  'standard deviation': 'الانحراف المعياري',
  'carbon dioxide': 'ثاني أكسيد الكربون',
  'lymph nodes': 'الغدد الليمفاوية',
  'amino acids': 'الأحماض الأمينية',
  'cell membrane': 'الغشاء الخلوي',
  'thyroid gland': 'الغدة الدرقية',
  'pituitary gland': 'الغدة النخامية',
  'all of the above': 'كل ما سبق',
  'not mentioned': 'غير وارد',
  'red blood cell': 'الكريات الحمراء',
  'the following': 'التالية',
};

// قاموس إنجليزي → عربي (مختار بعناية، دون عكس آلي)
const EN2AR = {
  'is': '', 'are': '', 'the': '', 'a': '', 'an': '', 'of': 'من', 'in': 'في', 'to': 'إلى',
  'and': 'و', 'or': 'أو', 'with': 'مع', 'from': 'من', 'on': 'على', 'about': 'عن', 'as': 'كـ',
  'by': 'بواسطة', 'for': 'من أجل', 'that': 'التي', 'this': 'هذه', 'which': 'الذي',
  'what': 'ما', 'its': 'خاصته', 'it': 'هو', 'their': 'خاصتهم', 'such': 'مثل',
  'between': 'بين', 'during': 'خلال', 'through': 'عبر', 'within': 'ضمن', 'after': 'بعد',
  'before': 'قبل', 'including': 'بما في ذلك', 'also': 'أيضًا', 'most': 'أكثر',
  'main': 'الرئيسي', 'primary': 'الأساسي', 'important': 'مهم', 'role': 'الدور',
  'function': 'الوظيفة', 'functions': 'الوظائف', 'importance': 'الأهمية', 'term': 'المصطلح',
  'terms': 'المصطلحات', 'meant': 'المقصود', 'statement': 'العبارة',
  'true': 'صحيح', 'false': 'خطأ', 'correct': 'الصحيح', 'answer': 'الإجابة', 'answers': 'الإجابات',
  'question': 'السؤال', 'questions': 'الأسئلة', 'options': 'الخيارات', 'following': 'التالية',
  'determine': 'حدد', 'whether': 'ما إذا', 'defined': 'يُعرَّف', 'blood': 'الدم',
  'anemia': 'فقر الدم', 'hemoglobin': 'الهيموجلوبين', 'heart': 'القلب', 'kidney': 'الكلى',
  'iron deficiency': 'نقص الحديد', 'iron supplements': 'مكملات الحديد', 'red blood cells': 'خلايا الدم الحمراء',
  'white blood cells': 'الكريات البيضاء', 'nutritional therapy': 'المعالجة الغذائية', 'the normal limit': 'الحد الطبيعي',
  'kidneys': 'الكليتان', 'liver': 'الكبد', 'lung': 'الرئة', 'stomach': 'المعدة',
  'brain': 'الدماغ', 'cell': 'الخلية', 'cells': 'الخلايا', 'protein': 'البروتين',
  'proteins': 'البروتينات', 'enzyme': 'الإنزيم', 'enzymes': 'الإنزيمات', 'vitamin': 'الفيتامين',
  'vitamins': 'الفيتامينات', 'hormone': 'الهرمون', 'hormones': 'الهرمونات', 'bacteria': 'البكتيريا',
  'virus': 'الفيروس', 'viruses': 'الفيروسات', 'infection': 'العدوى', 'inflammation': 'الالتهاب',
  'treatment': 'العلاج', 'symptoms': 'الأعراض', 'disease': 'المرض', 'diseases': 'الأمراض',
  'diagnosis': 'التشخيص', 'iron': 'الحديد', 'folate': 'حمض الفوليك', 'supplements': 'المكملات',
  'intestine': 'الأمعاء', 'red': 'حمراء', 'white': 'بيضاء', 'cause': 'السبب', 'result': 'النتيجة',
  'effect': 'التأثير', 'type': 'النوع', 'types': 'الأنواع', 'key': 'الأساسي', 'point': 'نقطة',
  'happens': 'يحدث', 'high': 'العالية', 'low': 'المنخفض', 'above': 'فوق', 'below': 'تحت',
  'rise': 'الارتفاع', 'fall': 'الانخفاض', 'increase': 'الزيادة', 'decrease': 'النقصان',
  'pressure': 'الضغط', 'oxygen': 'الأكسجين', 'carbon': 'الكربون', 'dioxide': 'ثاني أكسيد',
  'glucose': 'الجلوكوز', 'aorta': 'الأبهر', 'total': 'الكل', 'part': 'جزء', 'parts': 'الأجزاء',
  'one': 'واحد', 'first': 'أولًا', 'second': 'ثانيًا', 'third': 'ثالثًا',
  'iron deficiency': 'نقص الحديد', 'deficiency': 'نقص', 'causes': 'يسبب', 'cause of': 'سبب',
  'leads': 'يؤدي', 'leads to': 'يؤدي إلى', 'lack': 'نقص', 'normal': 'الطبيعي', 'limit': 'الحد',
  'abnormal': 'غير الطبيعي', 'levels': 'المستويات', 'being': 'كون', 'cells count': 'تعداد الخلايا',
  'red blood cells': 'الكريات الحمراء', 'white blood cells': 'الكريات البيضاء',
  'full blood count': 'تعداد الدم الكامل', 'complete blood count': 'تعداد الدم الكامل',
  'small intestine': 'الأمعاء الدقيقة', 'the term': 'مصطلح', 'specific term': 'مصطلح محدد',
  'المثال': 'example', 'بصورة': 'in a', 'الاهتمام': 'the interest',
};

// ============ النماذج الثابتة لأسئلتنا (عربي → إنجليزي) ============
const TPL_AR2EN = [
  [/^ما المقصود بمصطلح\s*"(.+?)"\s*[?؟]?\s*$/u, (m) => `What is meant by the term "${trArWords(m[1])}"?`],
  [/^ما المقصود\s+ب(?:ال)?\s*“?(.+?)”?\s*[?؟]?\s*$/u, (m) => `What is meant by ${trArWords(m[1])}?`],
  [/^ما وظيفة\s+(.+?)\s+الرئيسية\s*[?؟]?\s*$/u, (m) => `What is the main function of ${trArWords(m[1])}?`],
  [/^ما وظيفة\s+(.+?)\s*[?؟]?\s*$/u, (m) => `What is the function of ${trArWords(m[1])}?`],
  [/^ما النتيجة المترتبة على\s+(.+?)\s*[?؟]?\s*$/u, (m) => `What happens as a result of ${trArWords(m[1])}?`],
  [/^ما النتيجة\s+(.+?)\s*[?؟]?\s*$/u, (m) => `What is the result of ${trArWords(m[1])}?`],
  [/^ما أهم نقطة بشأن\s+(.+?)\s*[?؟]?\s*$/u, (m) => `What is the key point about ${trArWords(m[1])}?`],
  [/^ما أهمية\s+(.+?)\s*[?؟]?\s*$/u, (m) => `What is the importance of ${trArWords(m[1])}?`],
  [/^ما دور\s+(.+?)\s*[?؟]?\s*$/u, (m) => `What is the role of ${trArWords(m[1])}?`],
  [/^متى\s+(.+?)\s*[?؟]?\s*$/u, (m) => `When does ${trArWords(m[1])}?`],
  [/^أين\s+(.+?)\s*[?؟]?\s*$/u, (m) => `Where ${trArWords(m[1])}?`],
  [/^أي من المصطلحات التالية يُعرَّف بأنه:\s*"(.+?)"\s*[?؟]?\s*$/u, (m) => `Which of the following terms is defined as: "${trArWords(m[1])}"?`],
  [/^أي من المصطلحات التالية يعرف بأنه:\s*"(.+?)"\s*[?؟]?\s*$/u, (m) => `Which of the following terms is defined as: "${trArWords(m[1])}"?`],
  [/^حدِّد\s+صحة العبارة:\s*«(.+?)»\s*$/u, (m) => `Determine whether the statement is true or false: "${trArWords(m[1])}"`],
  [/^حدد\s+صحة العبارة:\s*«(.+?)»\s*$/u, (m) => `Determine whether the statement is true or false: "${trArWords(m[1])}"`],
];

function translateArBest(s) {
  for (const [re, fn] of TPL_AR2EN) {
    const m = String(s).match(re);
    if (m) return fn(m);
  }
  return trArWords(s);
}
function translateEnBest(s) {
  for (const [re, fn] of TPL_EN2AR) {
    const m = String(s).match(re);
    if (m) return fn(m);
  }
  return trEnWords(s);
}

// ============ النماذج الثابتة (إنجليزي → عربي) ============
const TPL_EN2AR = [
  [/^What is meant by the term\s*["“]?(.+?)["”]?\s*\??$/i, (m) => `ما المقصود بمصطلح "${trEnWords(m[1])}"؟`],
  [/^What is meant by\s+(.+?)\s*\??$/i, (m) => `ما المقصود بـ ${trEnWords(m[1])}؟`],
  [/^What is the function of\s+(.+?)\s*\??$/i, (m) => `ما وظيفة ${trEnWords(m[1])}؟`],
  [/^What happens as a result of\s+(.+?)\s*\??$/i, (m) => `ما النتيجة المترتبة على ${trEnWords(m[1])}؟`],
  [/^What is the result of\s+(.+?)\s*\??$/i, (m) => `ما النتيجة ${trEnWords(m[1])}؟`],
  [/^What is the key point about\s+(.+?)\s*\??$/i, (m) => `ما أهم نقطة بشأن ${trEnWords(m[1])}؟`],
  [/^What is the importance of\s+(.+?)\s*\??$/i, (m) => `ما أهمية ${trEnWords(m[1])}؟`],
  [/^What is the role of\s+(.+?)\s*\??$/i, (m) => `ما دور ${trEnWords(m[1])}؟`],
  [/^When\s+(.+?)\s*\??$/i, (m) => `متى ${trEnWords(m[1])}؟`],
  [/^Where\s+(.+?)\s*\??$/i, (m) => `أين ${trEnWords(m[1])}؟`],
  [/^Which of the following terms is defined as:\s*["“]?(.+?)["”]?\??$/i, (m) => `أي من المصطلحات التالية يُعرَّف بأنه: "${trEnWords(m[1])}"؟`],
  [/^Determine whether the statement is true or false:\s*["“]?(.+?)["”]?\s*$/i, (m) => `حدِّد صحة العبارة: «${trEnWords(m[1])}»`],
];

// ============ أدوات مساعدة ============
function stripDiacritics(text) {
  return String(text).replace(/[\u064B-\u065F\u0640]/g, '');
}

const AR_PHRASES = Object.keys(AR2EN).filter((k) => k.includes(' ')).sort((a, b) => b.length - a.length);
const EN_PHRASE_KEYS = Object.keys(EN_PHRASES).sort((a, b) => b.length - a.length);

const escRe = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// إنشاء regex لكل عبارة مركبة (بدل بدائل عملاقة يفشل ترتيبها مع الحرف البادئ)
const AR_PHRASE_RES = AR_PHRASES.map((k) => new RegExp(`(?<![\\p{L}\\p{N}])(?:[لبوفك])?(?:${escRe(k)})(?![\\p{L}\\p{N}])`, 'gu'));
const EN_PHRASE_RES = EN_PHRASE_KEYS.map((k) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${escRe(k)})(?![\\p{L}\\p{N}])`, 'gi'));

function looksAr(word) {
  return /[\u0600-\u06FF]/.test(word);
}
function looksEn(word) {
  return /[A-Za-z]/.test(word) && !looksAr(word);
}

// إزالة علامات النحو والروابط والضمائر لاستخراج أصل الكلمة
function arLookup(token) {
  const t = stripDiacritics(token);
  if (!looksAr(t)) return null;
  if (AR2EN[t]) return AR2EN[t];

  const variants = new Set();
  if (t.startsWith('ال')) variants.add(t.slice(2));
  else variants.add('ال' + t);
  const prefixes = ['وال', 'وبال', 'بال', 'فال', 'لل', 'كال', 'ول', 'فب', 'والع', 'وا'];
  for (const p of prefixes) {
    if (t.startsWith(p) && t.length - p.length >= 2) variants.add(t.slice(p.length));
  }
  // روابط أحادية الحرف (بـ/و/ف/ل/ك)
  for (const p of ['ب', 'و', 'ف', 'ل', 'ك']) {
    if (t.startsWith(p) && t.length - p.length >= 2) variants.add(t.slice(p.length));
  }
  const suffixes = ['هما', 'كما', 'هم', 'هن', 'ها', 'كم', 'كن', 'ه', 'ك', 'ي'];
  const withSuffixes = new Set(variants);
  for (const v of variants) {
    for (const s of suffixes) {
      if (v.length - s.length >= 2 && v.endsWith(s)) withSuffixes.add(v.slice(0, -s.length));
    }
  }
  for (const v of withSuffixes) {
    if (AR2EN[v]) return AR2EN[v];
    if (v.endsWith('ات') && AR2EN[v.slice(0, -2)]) return AR2EN[v.slice(0, -2)];
    if (v.endsWith('ون') && AR2EN[v.slice(0, -2)]) return AR2EN[v.slice(0, -2)];
    if (v.endsWith('ة') && AR2EN[v.slice(0, -1)]) return AR2EN[v.slice(0, -1)];
  }
  return null;
}

function enLookup(token) {
  const t = token.replace(/^['"]|['"]$/g, '').toLowerCase();
  if (!looksEn(t)) return null;
  if (EN2AR[t]) return EN2AR[t];
  if (t.endsWith('s') && EN2AR[t.slice(0, -1)]) return EN2AR[t.slice(0, -1)];
  if (t.endsWith('es') && EN2AR[t.slice(0, -2)]) return EN2AR[t.slice(0, -2)];
  if (t.endsWith('ies') && EN2AR[t.slice(0, -3) + 'y']) return EN2AR[t.slice(0, -3) + 'y'];
  return null;
}

// استبدال العبارات المركبة أولًا (فقر الدم → anemia) مع حماية الناتج من إعادة الترجمة
const MKR = '\u0001P';
const PREFIX_EN = { 'ل': 'to ', 'ب': 'with ', 'و': 'and ', 'ف': 'so ', 'ك': 'like ' };

function phraseReplaceAr(text) {
  const store = [];
  let out = String(text);
  for (let i = 0; i < AR_PHRASE_RES.length; i++) {
    const re = AR_PHRASE_RES[i];
    re.lastIndex = 0;
    out = out.replace(re, (mm) => {
      // جرّب المطابقة كاملة أولًا (قد تبدأ العبارة بـ ف/ب/و/ك كجزء من كلمتها)
      let val = AR2EN[mm];
      let prefix = '';
      if (!val) {
        const ch = mm[0];
        if (PREFIX_EN[ch] !== undefined && AR2EN[mm.slice(1)]) {
          prefix = PREFIX_EN[ch];
          val = AR2EN[mm.slice(1)];
        }
      }
      if (!val) return mm;
      store.push(prefix + val);
      return MKR + (store.length - 1) + '\u0001';
    });
  }
  return { text: out, store };
}

function phraseReplaceEn(text) {
  const store = [];
  let out = String(text);
  for (let i = 0; i < EN_PHRASE_RES.length; i++) {
    const re = EN_PHRASE_RES[i];
    re.lastIndex = 0;
    out = out.replace(re, (mm) => {
      const val = EN_PHRASES[mm.toLowerCase()];
      if (!val) return mm;
      store.push(val);
      return MKR + (store.length - 1) + '\u0001';
    });
  }
  return { text: out, store };
}
function restoreMarkers(text, store) {
  return String(text).replace(/\u0001P(\d+)\u0001/g, (_, i) => (store[+i] !== undefined ? store[+i] : ''));
}

function trArWords(phrase) {
  const { text, store } = phraseReplaceAr(phrase);
  const parts = String(text).split(/(\s+)/);
  const translated = [];
  for (const part of parts) {
    if (/^\s+$/.test(part)) { translated.push(part); continue; }
    if (!part) continue;
    if (/^\u0001P\d+\u0001$/.test(part)) { translated.push(part); continue; }
    translated.push(translateArToken(part));
  }
  return restoreMarkers(translated.join(''), store);
}

function translateArToken(part) {
  if (looksAr(part)) {
    const skip = part.match(/^([\p{L}\p{N}]+)(.*)$/u);
    if (!skip) return part;
    const hit = arLookup(skip[1]);
    const head = hit || (skip[1].length >= 3 ? `(${skip[1]})` : skip[1]);
    const tail = skip[2];
    if (tail) {
      if (/^[\p{P}\p{S}\s]+$/u.test(tail)) return head + tail; // علامة ترقيم فقط: إبقاؤها
      if (looksAr(tail)) return head + translateArToken(tail); // ذيل يتطلب ترجمة (مثل / : -)
      return head + tail;
    }
    return head;
  }
  return part;
}

function trEnWords(phrase) {
  const { text, store } = phraseReplaceEn(phrase);
  const parts = String(text).split(/(\s+)/);
  const translated = [];
  for (const part of parts) {
    if (/^\s+$/.test(part)) { translated.push(part); continue; }
    if (!part) continue;
    if (/^\u0001P\d+\u0001$/.test(part)) { translated.push(part); continue; }
    translated.push(translateEnToken(part));
  }
  return restoreMarkers(translated.join(''), store);
}

function translateEnToken(part) {
  if (looksEn(part)) {
    const skip = part.match(/^([A-Za-z][A-Za-z'-]*)(.*)$/);
    if (!skip) return part;
    const hit = enLookup(skip[1]);
    const head = hit || (skip[1].length >= 3 ? `(${skip[1]})` : skip[1]);
    const tail = skip[2] || '';
    if (tail && !/^[\p{P}\p{S}\s]+$/u.test(tail)) return head + translateEnToken(tail);
    return head + tail;
  }
  return part;
}

// ============ ترجمة سطر كامل ============
function lineArToEn(line) {
  // علامات س/ج
  const qa = line.match(/^([سج])\s*[:：]\s*(.*)$/);
  if (qa) return (qa[1] === 'س' ? 'Q: ' : 'A: ') + translateArBest(qa[2]);

  // النماذج الثابتة لأسئلتنا المولّدة
  for (const [re, fn] of TPL_AR2EN) {
    const m = line.match(re);
    if (m) return fn(m);
  }

  const num = line.match(/^(\s*[\d*.)\-–•·]+[\s]*)/);
  const headNum = num ? num[1] : '';
  let rest = num ? line.slice(num[1].length) : line;

  // عشرة **العنوان:** مع الحفاظ على شكل التنسيق (أو رقم ثم عنوان)
  const bold = rest.match(/^(\*{1,3})(.+?)(\*{1,3})\s*[:：]?\s*(.*)$/);
  if (bold) return headNum + bold[1] + trArWords(bold[2]) + bold[3] + (bold[4].trim() ? ' ' + trArWords(bold[4]) : '');

  return headNum + trArWords(rest);
}

function lineEnToAr(line) {
  const qa = line.match(/^([QA])\s*[:：]\s*(.*)$/i);
  if (qa) return (qa[1].toUpperCase() === 'Q' ? 'س: ' : 'ج: ') + translateEnBest(qa[2]);

  for (const [re, fn] of TPL_EN2AR) {
    const m = line.match(re);
    if (m) return fn(m);
  }

  const num = line.match(/^(\s*[#\d*.)\-–•·]+[\s]*)/);
  const headNum = num ? num[1] : '';
  let rest = num ? line.slice(num[1].length) : line;

  const bold = rest.match(/^(\*{1,3})(.+?)(\*{1,3})\s*[:：]?\s*(.*)$/);
  if (bold) return headNum + bold[1] + trEnWords(bold[2]) + bold[3] + (bold[4].trim() ? ' ' + trEnWords(bold[4]) : '');

  return headNum + trEnWords(rest);
}

export function translateLocal(text, to) {
  if (!text) return text;
  const lines = String(text).split('\n');
  const translated = lines.map((l) => (to === 'en' ? lineArToEn(l) : lineEnToAr(l)));
  return translated.join('\n');
}