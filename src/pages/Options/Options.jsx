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

  useEffect(() => {
    // Load saved settings when component mounts
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await chrome.storage.local.get([
        'openai_api_key',
        'maxResults',
        'skipSponsored',
        'requestDelay'
      ]);

      setSettings({
        openaiKey: result.openai_api_key || '',
        maxResults: result.maxResults || 3,
        skipSponsored: result.skipSponsored ?? true,
        requestDelay: result.requestDelay || 3
      });
    } catch (error) {
      showStatus('Error loading settings: ' + error.message, 'error');
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      await chrome.storage.local.set({
        openai_api_key: settings.openaiKey,
        maxResults: settings.maxResults,
        skipSponsored: settings.skipSponsored,
        requestDelay: settings.requestDelay
      });
      showStatus('Settings saved successfully!', 'success');
      chrome.tabs.create({
        url: 'https://www.amazon.com',
        active: true // This makes the new tab active/focused
      });
    } catch (error) {
      showStatus('Error saving settings: ' + error.message, 'error');
    }
  };

  const testConnection = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'checkApiConfig',
        testKey: settings.openaiKey
      });

      if (response.openaiConfigured) {
        showStatus('API connection successful!', 'success');
      } else {
        showStatus('API connection failed: ' + (response.error || 'Invalid key'), 'error');
      }
    } catch (error) {
      showStatus('Error testing connection: ' + error.message, 'error');
    }
  };

  const resetSettings = async () => {
    const defaultSettings = {
      openaiKey: '',
      maxResults: 3,
      skipSponsored: true,
      requestDelay: 3
    };

    try {
      await chrome.storage.local.clear();
      setSettings(defaultSettings);
      showStatus('Settings reset to defaults', 'success');
    } catch (error) {
      showStatus('Error resetting settings: ' + error.message, 'error');
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
      <h1>Anna AI Shopping Assistant Settings</h1>
      
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