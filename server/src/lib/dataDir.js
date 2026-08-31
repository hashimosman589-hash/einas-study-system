import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// يوجّه البيانات إلى DATA_DIR عند ضبطه وقابل للكتابة،
// وإلا يتراجع إلى مجلد البيانات داخل المشروع (قابل للكتابة على الاستضافة المجانية).
function resolveDataDir() {
  const projectData = path.join(__dirname, '..', '..', 'data');
  if (process.env.DATA_DIR && isWritable(process.env.DATA_DIR)) {
    return process.env.DATA_DIR;
  }
  fs.mkdirSync(projectData, { recursive: true });
  return projectData;
}

export const dataDir = resolveDataDir();
