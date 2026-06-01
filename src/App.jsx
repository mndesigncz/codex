import { useState } from 'react';
import Login from './components/Login.jsx';
import EmployerLayout from './components/employer/EmployerLayout.jsx';
import EmployeeLayout from './components/employee/EmployeeLayout.jsx';

export default function App() {
  const [auth, setAuth] = useState(null); // null | { type: 'employer' | 'employee', user }

  const handleLogin = (type, user) => {
    setAuth({ type, user });
  };

  const handleLogout = () => {
    setAuth(null);
  };

  if (!auth) {
    return <Login onLogin={handleLogin} />;
  }

  if (auth.type === 'employer') {
    return <EmployerLayout user={auth.user} onLogout={handleLogout} />;
  }

  return <EmployeeLayout user={auth.user} onLogout={handleLogout} />;
}
