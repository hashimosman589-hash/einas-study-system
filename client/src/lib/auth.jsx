import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('einas_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => {
        localStorage.removeItem('einas_token');
        localStorage.removeItem('einas_user');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (identifier, password) => {
    const isEmail = /@/.test(identifier);
    const payload = isEmail ? { email: identifier, password } : { username: identifier, password };
    const d = await api.post('/auth/login', payload);
    localStorage.setItem('einas_token', d.token);
    localStorage.setItem('einas_user', JSON.stringify(d.user));
    setUser(d.user);
    return d;
  };

  const register = async (name, username, email, password) => {
    const d = await api.post('/auth/register', { name, username, email, password });
    localStorage.setItem('einas_token', d.token);
    localStorage.setItem('einas_user', JSON.stringify(d.user));
    setUser(d.user);
    return d;
  };

  const logout = () => {
    localStorage.removeItem('einas_token');
    localStorage.removeItem('einas_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
