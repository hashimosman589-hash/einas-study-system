const BASE = '/api';

function getToken() {
  try {
    return localStorage.getItem('einas_token') || '';
  } catch {
    return '';
  }
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  if (options.body && typeof options.body !== 'string' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(BASE + path, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'حدث خطأ غير متوقع');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  del: (p) => request(p, { method: 'DELETE' }),
  upload: (p, formData) => request(p, { method: 'POST', body: formData }),
  uploadWithProgress: (p, formData, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const token = getToken();
      xhr.open('POST', BASE + p);
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && typeof onProgress === 'function') {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText || 'null'); } catch { data = null; }
        if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
        const err = new Error((data && data.error) || 'حدث خطأ غير متوقع');
        err.status = xhr.status;
        reject(err);
      };
      xhr.onerror = () => reject(new Error('تعذر الاتصال بالخادم'));
      xhr.send(formData);
    }),
};
