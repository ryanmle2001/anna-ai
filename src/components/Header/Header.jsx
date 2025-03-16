import React from 'react';
import './Header.css';

const Header = ({ onSettingsClick, user }) => {
  const handleLogout = () => {
    localStorage.removeItem('google_token');
    window.location.reload(); // Reload to reset the app state
  };

  return (
    <header className="header">
      <div className="header-title">Anna AI</div>
      <div className="header-actions">
        <button onClick={onSettingsClick} className="settings-button">
          Settings
        </button>
        {user && (
          <div className="user-profile">
            <img src={user.picture} alt={user.name} className="user-avatar" />
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header; 