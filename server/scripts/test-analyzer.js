import { localAnalyze } from '../src/lib/localAnalyzer.js';

const lecture = `مقدمة في علم الأحياء الخلوية.

الخلية هي الوحدة الأساسية للحياة، وجميع الكائنات الحية تتكون من خلايا حية.

تنقسم الخلية إلى عدة مكونات رئيسية. النواة هي مركز التحكم في الخلية وتحتوي على المادة الوراثية DNA. الغشاء الخلوي يحيط بالخلية وينظم دخول وخروج المواد من وإلى الخلية. الميتوكوندريا هي مصدر الطاقة في الخلية وينتج عنها مركب ATP.

تحدث عملية الانقسام الخلوي بنوعين مهمين. الانقسام المتساوي ينتج خليتين متطابقتين وراثيًا. الانقسام الميوزي يقلل عدد الكروموسومات إلى النصف لإنتاج الأمشاج.

المعلومات الوراثية تُخزَّن في الكروموسومات الموجودة داخل النواة. الجين هو وحدة الوراثة ويحتوي على التعليمات لبناء البروتينات. البروتينات تتكون من الأحماض الأمينية وتؤدي وظائف حيوية عديدة داخل الخلية.

هذه مقدمة عامة للمحاضرة وننتقل الآن للتفاصيل العملية.`;

const r = localAnalyze(lecture, 'المحاضرة الثالثة - علم الأحياء');
console.log('coverageBlocks:', r.coverageBlocks);
console.log('=== SUMMARY ===');
console.log(r.summary);
console.log('\n=== KEY POINTS ===');
r.keyPoints.forEach((p) => console.log('•', p));
console.log('\n=== Q&A ===');
r.questions.filter((q) => q.type === 'qa').forEach((q) => {
  console.log('Q:', q.questionAr);
  console.log('A:', q.answerAr);
  console.log('---');
});
console.log('\n=== MCQ ===');
r.questions.filter((q) => q.type === 'mcq').forEach((q) => {
  console.log('Q:', q.text);
  console.log('options:', q.options);
  console.log('correct:', q.correctAnswer);
  console.log('---');
});
console.log('\n=== TRUE/FALSE ===');
r.questions.filter((q) => q.type === 'truefalse').forEach((q) => {
  console.log('T:', q.text);
  console.log('answer:', q.correctAnswer);
  console.log('---');
});
console.log('\nmeans', 'prior: qa:', r.qaCount, 'mcq:', r.mcqCount, 'tf:', r.tfCount, 'importantTerms:', r.importantTerms, 'reviewTopics:', r.reviewTopics);