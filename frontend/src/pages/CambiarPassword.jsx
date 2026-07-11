import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

const checks = [
  { label: 'Mínimo 8 caracteres', test: p => p.length >= 8 },
  { label: 'Una letra mayúscula', test: p => /[A-Z]/.test(p) },
  { label: 'Una letra minúscula', test: p => /[a-z]/.test(p) },
  { label: 'Un carácter especial', test: p => /[^A-Za-z0-9]/.test(p) },
];

function EyeIcon({ open }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 012.525-4.042M9.88 9.88a3 3 0 104.24 4.24M3 3l18 18" />
    </svg>
  );
}

function PwdField({ label, value, onChange, id }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required
          value={value}
          onChange={onChange}
          className="w-full border border-gray-300 rounded px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
          tabIndex={-1}
          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  );
}

export default function CambiarPassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const valid = checks.every(c => c.test(next)) && next === confirm;

  const handleSubmit = async e => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      const updatedUser = { ...user, must_change_password: false };
      login(updatedUser, localStorage.getItem('token'));
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-md w-full max-w-sm p-8">
        <h2 className="text-xl font-bold text-ht-navy mb-1">Cambiar contraseña</h2>
        <p className="text-sm text-gray-500 mb-6">Debes establecer una nueva contraseña para continuar.</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <PwdField label="Contraseña actual" id="current" value={current} onChange={e => setCurrent(e.target.value)} />
          <div>
            <PwdField label="Nueva contraseña" id="next" value={next} onChange={e => setNext(e.target.value)} />
            <ul className="mt-2 space-y-1">
              {checks.map(c => (
                <li key={c.label} className={`text-xs flex items-center gap-1 ${c.test(next) ? 'text-green-600' : 'text-gray-400'}`}>
                  <span>{c.test(next) ? '✓' : '○'}</span> {c.label}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <PwdField label="Confirmar nueva contraseña" id="confirm" value={confirm} onChange={e => setConfirm(e.target.value)} />
            {confirm && next !== confirm && (
              <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
            )}
          </div>
          <button type="submit" disabled={!valid || loading}
            className="w-full bg-ht-navy text-white py-2 rounded font-medium text-sm hover:bg-ht-navy/90 transition-colors disabled:opacity-50">
            {loading ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
