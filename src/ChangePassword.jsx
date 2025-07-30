import React, { useState } from 'react';
import supabase from './supabaseClient';

function ChangePassword({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setMessage('New password must be at least 6 characters long');
      return;
    }

    if (currentPassword === newPassword) {
      setMessage('New password must be different from current password');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      // First verify current password by attempting to sign in
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.email) {
        throw new Error('User not found');
      }

      // Test current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.user.email,
        password: currentPassword
      });

      if (signInError) {
        setMessage('Current password is incorrect');
        setIsLoading(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        setMessage(`Error: ${updateError.message}`);
      } else {
        setMessage('✅ Password changed successfully!');
        // Clear form
        setCurrentPassword('');
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
          <input
            type="password"
            placeholder="Current Password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            disabled={isLoading}
          />
          
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
            onClick={handlePasswordChange}
            disabled={isLoading}
            className="change-password-submit"
          >
            {isLoading ? 'Changing Password...' : 'Change Password'}
          </button>

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
