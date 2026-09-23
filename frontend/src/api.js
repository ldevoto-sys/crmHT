import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      // Antes esto redirigía de inmediato y en silencio — si el corte de
      // sesión pillaba a alguien a mitad de una cotización larga, perdía
      // todo sin aviso. El aviso es honesto sobre qué se recupera solo
      // (el borrador de cotización, ver NuevaCotizacion.jsx) y qué no.
      const habiaSesion = !!localStorage.getItem('token');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (habiaSesion) {
        alert('Tu sesión expiró. Si estabas armando una cotización, el borrador se guardó y se te ofrecerá recuperarlo al volver a entrar.');
      }
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
