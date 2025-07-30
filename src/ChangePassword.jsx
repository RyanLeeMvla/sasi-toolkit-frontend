import React, { useState } from 'react';
import supabase from './supabaseClient';

function ChangePassword({ onClose }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useEmailReset, setUseEmailReset] = useState(false);

  const handlePasswordReset = async () => {
    setIsLoading(true);
    setMessage('');

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.email) {
        throw new Error('User not found');
      }

      const { error } = await supabase.auth.resetPasswordForEmail(user.user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setMessage(`Error: ${error.message}`);
      } else {
        setMessage('✅ Password reset email sent! Check your inbox and click the link to set a new password.');
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }

    setIsLoading(false);
  };

  const handleDirectPasswordChange = async () => {
    if (!newPassword || !confirmPassword) {
      setMessage('Please fill in both password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setMessage('New password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      // Directly update password (this works if user came from a password reset link)
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        setMessage(`Error: ${error.message}`);
      } else {
        setMessage('✅ Password changed successfully!');
        // Clear form
        setNewPassword('');
        setConfirmPassword('');
        
        // Close modal after 2 seconds
        setTimeout(() => {
          if (onClose) onClose();
        }, 2000);
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }

    setIsLoading(false);
  };

  return (
    <div className="change-password-modal">
      <div className="change-password-content">
        <div className="change-password-header">
          <h3>Change Password</h3>
          <button 
            className="close-button"
            onClick={onClose}
            disabled={isLoading}
          >
            ×
          </button>
        </div>
        
        <div className="change-password-form">
          {!useEmailReset ? (
            <>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
                Choose how you'd like to change your password:
              </p>
              
              <button 
                onClick={handlePasswordReset}
                disabled={isLoading}
                className="change-password-submit"
                style={{ marginBottom: '15px' }}
              >
                {isLoading ? 'Sending Email...' : '📧 Send Reset Email (Recommended)'}
              </button>
              
              <button 
                onClick={() => setUseEmailReset(true)}
                disabled={isLoading}
                className="change-password-submit"
                style={{ backgroundColor: '#6c757d' }}
              >
                🔑 Enter New Password Directly
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
                Enter your new password:
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
                onClick={handleDirectPasswordChange}
                disabled={isLoading}
                className="change-password-submit"
              >
                {isLoading ? 'Changing Password...' : 'Change Password'}
              </button>
              
              <button 
                onClick={() => {
                  setUseEmailReset(false);
                  setNewPassword('');
                  setConfirmPassword('');
                  setMessage('');
                }}
                disabled={isLoading}
                className="change-password-submit"
                style={{ backgroundColor: '#6c757d', marginTop: '10px' }}
              >
                ← Back to Email Reset
              </button>
            </>
          )}

          {message && (
            <p className={`change-password-message ${message.includes('✅') ? 'success' : 'error'}`}>
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChangePassword;
