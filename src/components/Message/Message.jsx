import React from 'react';
import './Message.css';

const Message = ({ text, type, timestamp }) => {
  // Function to convert markdown links to HTML
  const formatText = (text) => {
    if (!text) return '';
    
    // Convert markdown links to HTML
    const formattedText = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="message-link">${text}</a>`;
    });

    return <span dangerouslySetInnerHTML={{ __html: formattedText }} />;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`message ${type}`}>
      <div className="message-content">
        {formatText(text)}
      </div>
      <div className="message-timestamp">
        {formatTimestamp(timestamp)}
      </div>
    </div>
  );
};

export default Message; 