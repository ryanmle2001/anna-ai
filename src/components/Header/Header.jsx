import React from 'react';
import './Header.css';

const Header = ({ onSettingsClick }) => {
  return (
    <div className="header">
      <h1>Anna AI Shopping Assistant</h1>
      <button className="settings-button" onClick={onSettingsClick}>
        Settings
      </button>
    </div>
  );
};

export default Header; 