import React, { useState, useEffect } from 'react';
import './Options.css';

const Options = () => {
  const [settings, setSettings] = useState({
    openaiKey: '',
    maxResults: 3,
    skipSponsored: true,
    requestDelay: 3
  });
  const [status, setStatus] = useState({ message: '', type: '' });
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    // Get the current user ID and load settings
    chrome.storage.local.get('currentUserId', (data) => {
      if (data.currentUserId) {
        setUserId(data.currentUserId);
        console.log('Current user ID:', userId);
        loadSettings(data.currentUserId);
      } else {
        showStatus('Please log in to the extension first', 'error');
      }
    });
  }, []);

  const loadSettings = async (currentUserId) => {
    try {
      // Load user-specific settings
      const result = await chrome.storage.local.get([
        `apiKey_${currentUserId}`,
        `maxResults_${currentUserId}`,
        `skipSponsored_${currentUserId}`,
        `requestDelay_${currentUserId}`
      ]);

      setSettings({
        openaiKey: result[`apiKey_${currentUserId}`] || '',
        maxResults: result[`maxResults_${currentUserId}`] || 3,
        skipSponsored: result[`skipSponsored_${currentUserId}`] ?? true,
        requestDelay: result[`requestDelay_${currentUserId}`] || 3
      });
    } catch (error) {
      showStatus('Error loading settings: ' + error.message, 'error');
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    if (!userId) {
      showStatus('Please log in to save settings', 'error');
      return;
    }

    try {
      // Save user-specific settings
      await chrome.storage.local.set({
        [`apiKey_${userId}`]: settings.openaiKey,
        [`maxResults_${userId}`]: settings.maxResults,
        [`skipSponsored_${userId}`]: settings.skipSponsored,
        [`requestDelay_${userId}`]: settings.requestDelay
      });

      // Test the API key
      const response = await chrome.runtime.sendMessage({
        action: 'setApiKey',
        apiKey: settings.openaiKey,
        userId: userId
      });

      if (response.success) {
        showStatus('Settings saved successfully!', 'success');
        chrome.tabs.create({
          url: 'https://www.amazon.com',
          active: true
        });
      } else {
        showStatus('Error saving API key', 'error');
      }
    } catch (error) {
      showStatus('Error saving settings: ' + error.message, 'error');
    }
  };

  const testConnection = async () => {
    if (!userId) {
      showStatus('Please log in to test connection', 'error');
      return;
    }

    if (!settings.openaiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'testApiKey',
        apiKey: settings.openaiKey
      });

      if (response.isValid) {
        showStatus('API connection successful!', 'success');
      } else {
        showStatus('API connection failed: ' + (response.error || 'Invalid key'), 'error');
      }
    } catch (error) {
      showStatus('Error testing connection: ' + error.message, 'error');
    }
  };

  const resetSettings = async () => {
    if (!userId) {
      showStatus('Please log in to reset settings', 'error');
      return;
    }

    const defaultSettings = {
      openaiKey: '',
      maxResults: 3,
      skipSponsored: true,
      requestDelay: 3
    };

    try {
      // Remove user-specific settings
      await chrome.storage.local.remove([
        `apiKey_${userId}`,
        `maxResults_${userId}`,
        `skipSponsored_${userId}`,
        `requestDelay_${userId}`
      ]);
      setSettings(defaultSettings);
      showStatus('Settings reset to defaults', 'success');
    } catch (error) {
      showStatus('Error resetting settings: ' + error.message, 'error');
    }
  };

  const resetChat = async () => {
    if (!userId) {
      showStatus('Please log in to reset chat history', 'error');
      return;
    }

    try {
      // Remove chat history for the current user
      await chrome.storage.local.remove(`chatHistory_${userId}`);
      showStatus('Chat history cleared successfully!', 'success');
    } catch (error) {
      showStatus('Error clearing chat history: ' + error.message, 'error');
    }
  };

  const showStatus = (message, type = 'info') => {
    setStatus({ message, type });
    setTimeout(() => setStatus({ message: '', type: '' }), 3000);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="container">
      <h1>Anna AI Settings</h1>
      
      <form onSubmit={saveSettings}>
        <div className="form-group api-key-section">
          <label htmlFor="openaiKey">OpenAI API Key</label>
          <div className="api-key-container">
            <input
              type="text"
              id="openaiKey"
              name="openaiKey"
              value={settings.openaiKey}
              onChange={handleInputChange}
              placeholder="sk-..."
              required
            />
            <button type="button" onClick={testConnection}>
              Test Connection
            </button>
          </div>
          <div className="help-text">Required for advanced natural language search capabilities</div>
        </div>

        <div className="form-group">
          <label htmlFor="maxResults">Maximum Results to Show</label>
          <input
            type="number"
            id="maxResults"
            name="maxResults"
            min="1"
            max="10"
            value={settings.maxResults}
            onChange={handleInputChange}
          />
          <div className="help-text">Number of products to show in results (1-10)</div>
        </div>

        <div className="form-group">
          <label htmlFor="skipSponsored">Skip Sponsored Products</label>
          <input
            type="checkbox"
            id="skipSponsored"
            name="skipSponsored"
            checked={settings.skipSponsored}
            onChange={handleInputChange}
          />
          <div className="help-text">Don't show sponsored/promoted products in results</div>
        </div>

        <div className="form-group">
          <label htmlFor="requestDelay">Minimum Delay Between Requests (seconds)</label>
          <input
            type="number"
            id="requestDelay"
            name="requestDelay"
            min="3"
            max="30"
            value={settings.requestDelay}
            onChange={handleInputChange}
          />
          <div className="help-text">Longer delays reduce the chance of being blocked</div>
        </div>

        <div className="form-group">
          <label>Chat History</label>
          <div className="chat-reset-container">
            <p className="help-text">Clear your chat history when starting a new session</p>
            <button type="button" onClick={resetChat} className="secondary">
              Reset Chat History
            </button>
          </div>
        </div>

        <div className="buttons">
          <button type="button" onClick={resetSettings} className="secondary">
            Reset Settings
          </button>
          <button type="submit">Save Settings</button>
        </div>
      </form>
      
      {status.message && (
        <div className={`status ${status.type}`}>
          {status.message}
        </div>
      )}
      
      <div className="help-text guidelines">
        <p><strong>Usage Guidelines:</strong></p>
        <ul>
          <li>Keep delays between requests reasonable to avoid detection</li>
          <li>The extension is limited to 100 requests per hour</li>
          <li>Consider using filters to get more relevant results</li>
          <li>OpenAI API key is required for advanced natural language processing</li>
        </ul>
      </div>
    </div>
  );
};

export default Options; 