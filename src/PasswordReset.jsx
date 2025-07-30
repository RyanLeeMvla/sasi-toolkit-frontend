import React, { useState, useEffect } from 'react';
import supabase from './supabaseClient';

function PasswordReset() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Get the current session (should be available after clicking email link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSession(session);
        setMessage('✅ Ready to set your new password');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handlePasswordUpdate = async () => {
    if (!newPassword || !confirmPassword) {
      setMessage('Please fill in both password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setMessage('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);
    setMessage('');

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    setIsLoading(false);

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage('✅ Password updated successfully! You can now close this page and log in.');
      // Clear the form
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const goToLogin = () => {
    window.location.href = window.location.origin;
  };

  if (!session) {
    return (
      <div className="login-box">
        <h2>Password Reset</h2>
        <p>Please click the link in your email to reset your password.</p>
        <button onClick={goToLogin} style={{ marginTop: '20px' }}>
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div className="login-box">
      <h2>Set New Password</h2>
      <p style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>
        Enter your new password below
      </p>
      
      <input
        type="password"
        placeholder="New Password"
        value={newPassword}
        onChange={e => setNewPassword(e.target.value)}
        disabled={isLoading}
      />
      
      <input
        type="password"
        placeholder="Confirm New Password"
        value={confirmPassword}
        onChange={e => setConfirmPassword(e.target.value)}
        disabled={isLoading}
      />
      
      <button 
        onClick={handlePasswordUpdate}
        disabled={isLoading}
        style={{ 
          opacity: isLoading ? 0.6 : 1,
          cursor: isLoading ? 'not-allowed' : 'pointer'
        }}
      >
        {isLoading ? 'Updating Password...' : 'Update Password'}
      </button>

      <button 
        onClick={goToLogin} 
        style={{ 
          marginTop: '10px',
          backgroundColor: '#6c757d',
          border: 'none',
          padding: '10px 20px',
          color: 'white',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Back to Login
      </button>

      {message && (
        <p className={`login-message ${message.includes('✅') ? 'success' : 'error'}`}>
          {message}
        </p>
      )}
    </div>
  );
}

export default PasswordReset;
