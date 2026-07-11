import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';

const checks = [
  { label: 'Mínimo 8 caracteres', test: p => p.length >= 8 },
  { label: 'Una letra mayúscula', test: p => /[A-Z]/.test(p) },
  { label: 'Una letra minúscula', test: p => /[a-z]/.test(p) },
  { label: 'Un carácter especial', test: p => /[^A-Za-z0-9]/.test(p) },
];

export default function ResetPassword() {
  const { token } = useParams();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const valid = checks.every(c => c.test(next)) && next === confirm;

  const handleSubmit = async e => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    setLoading(true);
    try {
      await api.post(`/auth/reset-password/${token}`, { newPassword: next });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo restablecer la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-md w-full max-w-sm p-8">
        <h2 className="text-xl font-bold text-ht-navy mb-2">Restablecer contraseña</h2>

        {done ? (
          <div className="text-sm text-gray-600">
            <p>Contraseña restablecida. Te redirigimos al inicio de sesión…</p>
            <Link to="/login" className="mt-4 block text-ht-cyan hover:underline text-sm">Ir al inicio</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
              <input
                type="password"
                required
                value={next}
                onChange={e => setNext(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-cyan"
              />
              <ul className="mt-2 space-y-1">
                {checks.map(c => (
                  <li key={c.label} className={`text-xs flex items-center gap-1 ${c.test(next) ? 'text-green-600' : 'text-gray-400'}`}>
                    <span>{c.test(next) ? '✓' : '○'}</span> {c.label}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-cyan"
              />
              {confirm && next !== confirm && (
                <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
              )}
            </div>
            <button type="submit" disabled={!valid || loading}
              className="w-full bg-ht-navy text-white py-2 rounded font-medium text-sm hover:bg-ht-navy/90 transition-colors disabled:opacity-50">
              {loading ? 'Guardando...' : 'Restablecer contraseña'}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-sm text-ht-cyan hover:underline">Volver al inicio</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
