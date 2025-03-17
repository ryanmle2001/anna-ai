import React from 'react';
import './Header.css';

const Header = ({ onSettingsClick, user }) => {
  const handleLogout = () => {
    // Get the current token
    chrome.identity.getAuthToken({ interactive: false }, function(token) {
      if (chrome.runtime.lastError) {
        console.error('Error getting auth token:', chrome.runtime.lastError);
      }
      
      if (token) {
        // Revoke the token
        fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
          .then(() => {
            // Remove the token from Chrome's cache
            chrome.identity.removeCachedAuthToken({ token: token }, function() {
              // Clear all stored data
              localStorage.removeItem('google_token');
              localStorage.removeItem('user_data');
              chrome.storage.local.remove(['currentUserId'], () => {
                window.location.reload();
              });
            });
          })
          .catch(error => {
            console.error('Error revoking token:', error);
            // Even if revocation fails, clear local data
            localStorage.removeItem('google_token');
            localStorage.removeItem('user_data');
            chrome.storage.local.remove(['currentUserId'], () => {
              window.location.reload();
            });
          });
      } else {
        // If no token found, just clear local data
        localStorage.removeItem('google_token');
        localStorage.removeItem('user_data');
        chrome.storage.local.remove(['currentUserId'], () => {
          window.location.reload();
        });
      }
    });
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