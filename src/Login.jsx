import React, { useState, useEffect } from 'react';
import supabase from './supabaseClient';

function Login({ setUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUser(user); // Auto-redirect if already logged in
    });
  }, [setUser]);

  const handleSubmit = async () => {
    setMessage('');

    if (isLoginMode) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setMessage(error.message);
      } else {
        setUser(data.user); // sets user in App.js
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage('✅ Check your email to confirm your account.');
      }
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setMessage('Please enter your email address first');
      return;
    }

    setIsResettingPassword(true);
    setMessage('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `http://localhost:3001/reset-password`, // Force localhost for development
    });

    setIsResettingPassword(false);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('✅ Password reset email sent! Check your inbox.');
    }
  };

  return (
    <div className="login-box">
      <h2>{isLoginMode ? 'Login' : 'Sign Up'}</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      <button onClick={handleSubmit}>
        {isLoginMode ? 'Login' : 'Create Account'}
      </button>

      {isLoginMode && (
        <p 
          onClick={handlePasswordReset} 
          style={{ 
            cursor: 'pointer', 
            marginTop: '10px', 
            fontSize: '14px', 
            color: '#007bff',
            textDecoration: 'underline'
          }}
        >
          {isResettingPassword ? 'Sending email...' : 'Forgot Password?'}
        </p>
      )}

      <p onClick={() => setIsLoginMode(!isLoginMode)} style={{ cursor: 'pointer', marginTop: '10px' }}>
        {isLoginMode ? 'Need an account? Sign Up' : 'Already have an account? Log In'}
      </p>

      {message && <p className="login-message">{message}</p>}
    </div>
  );
}

export default Login;