import React, { useState, useEffect } from 'react';
import Header from './components/Header/Header';
import ChatContainer from './components/ChatContainer/ChatContainer';
import InputContainer from './components/InputContainer/InputContainer';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isApiConfigured, setIsApiConfigured] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check for existing user data on mount
    const userData = localStorage.getItem('user_data');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (error) {
        console.error('Error parsing user data:', error);
        // Clear invalid data
        localStorage.removeItem('user_data');
        localStorage.removeItem('google_token');
      }
    }
  }, []);

  useEffect(() => {
    // Only proceed with chat initialization if user is logged in
    if (user) {
      checkApiConfiguration();
      loadChatHistory();
      const checkStoredResults = async () => {
        try {
          const { lastSearchResults } = await chrome.storage.local.get('lastSearchResults');
          let assistantMessage;
          if (lastSearchResults) {
            console.log('Found stored search results:', lastSearchResults);
            assistantMessage = {
              type: 'assistant',
              text: 'Here are the products from your last search:',
              products: lastSearchResults.products,
              timestamp: Date.now()
            };
            await chrome.storage.local.remove('lastSearchResults');
            setMessages(prev => [...prev, assistantMessage]);
          } else {
            assistantMessage = {
              type: 'assistant',
              text: 'Hello, I am Anna AI, how can I help you today?',
              timestamp: Date.now()
            };
            setMessages(prev => [...prev, assistantMessage]);
          }
        } catch (error) {
          console.error('Error checking stored results:', error);
        }
      };

      checkStoredResults();
    }
  }, [user]);

  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory(messages);
    }
  }, [messages]);

  const checkApiConfiguration = async () => {
    if (!user?.id) return;
    try {
      const key = `apiKey_${user.id}`;
      const response = await chrome.runtime.sendMessage({ 
        action: 'checkApiConfig',
        userId: user.id 
      });
      setIsApiConfigured(response.openaiConfigured);
      
      if (!response.openaiConfigured) {
        setMessages([{
          type: 'system',
          text: 'Please configure your OpenAI API key in the settings to start using Anna AI.',
          timestamp: Date.now()
        }]);
      } 
    } catch (error) {
      console.error('Error checking API configuration:', error);
    }
  };

  const loadChatHistory = async () => {
    if (!user?.id) return;
    try {
      const key = `chatHistory_${user.id}`;
      const data = await chrome.storage.local.get(key);
      if (data[key]) {
        setMessages(data[key]);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const saveChatHistory = async (newMessages) => {
    if (!user?.id) return;
    try {
      const key = `chatHistory_${user.id}`;
      await chrome.storage.local.set({ [key]: newMessages });
    } catch (error) {
      console.error('Error saving chat history:', error);
    }
  };

  const handleSettingsClick = () => {
    // Pass the user ID to the options page
    chrome.runtime.openOptionsPage(() => {
      // Store current user ID for options page to use
      chrome.storage.local.set({ currentUserId: user.id });
    });
  };

  const handleSendMessage = async (text) => {
    if (!isApiConfigured) {
      setMessages(prev => [...prev, {
        type: 'system',
        text: 'Please configure your OpenAI API key in the settings first.',
        timestamp: Date.now()
      }]);
      return;
    }

    // Add user message immediately
    const userMessage = { type: 'user', text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      console.log('Sending search request:', text);
      
      // Create a promise that will reject if we don't get a response in time
      const responsePromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 30000); // 30 second timeout

        chrome.runtime.sendMessage({
          action: 'searchProducts',
          query: text
        }, response => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      const response = await responsePromise;
      console.log('Received response:', response);

      if (response.error) {
        throw new Error(response.error);
      }

      if (!response.products || !Array.isArray(response.products) || response.products.length === 0) {
        throw new Error('No products found. Please try a different search.');
      }

      console.log('Adding assistant message with products:', response.products);
      const assistantMessage = {
        type: 'assistant',
        text: 'Here are some products that match your request:',
        products: response.products,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Add follow-up message with search link
      if (response.searchUrl) {
        const followUpMessage = {
          type: 'assistant',
          text: `Would you like to see more results? [View all results on Amazon](${response.searchUrl})`,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, followUpMessage]);
      }

    } catch (error) {
      console.error('Search error:', error);
      const errorMessage = {
        type: 'error',
        text: `Error: ${error.message}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleGoogleLogin = () => {
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
      if (chrome.runtime.lastError || !token) {
        console.error('Google login failed:', chrome.runtime.lastError);
        setMessages(prev => [...prev, {
          type: 'error',
          text: 'Google login failed. Please try again.',
          timestamp: Date.now()
        }]);
        return;
      }

      // Get user info using the token
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(response => response.json())
        .then(data => {
          const userData = {
            id: data.sub,
            name: data.name,
            email: data.email,
            picture: data.picture
          };
          
          // Store the token and user data separately
          localStorage.setItem('google_token', token);
          localStorage.setItem('user_data', JSON.stringify(userData));
          
          // Store the user ID in Chrome's storage and reload the popup
          chrome.storage.local.set({ currentUserId: data.sub }, () => {
            if (chrome.runtime.lastError) {
              console.error('Error storing user ID:', chrome.runtime.lastError);
            } else {
              console.log('Successfully stored user ID:', data.sub);
              // Update the user state and reload the popup
              setUser(userData);
              window.location.reload();
            }
          });
        })
        .catch(error => {
          console.error('Error fetching user info:', error);
          setMessages(prev => [...prev, {
            type: 'error',
            text: 'Failed to get user information. Please try again.',
            timestamp: Date.now()
          }]);
        });
    });
  };

  return (
    <div className="app">
      {!user ? (
        <div className="login-container">
          <img 
            src="/icons/anna-ai-logo.png" 
            alt="Anna AI Logo" 
            className="login-logo"
          />
          <h2>Anna AI Shopping Assistant</h2>
          <p>Sign in to start your personalized shopping experience</p>
          <button 
            className="google-login-button"
            onClick={handleGoogleLogin}
          >
            Continue with Google
          </button>
        </div>
      ) : (
        <>
          <Header onSettingsClick={handleSettingsClick} user={user} />
          <ChatContainer messages={messages} isTyping={isTyping} />
          <InputContainer 
            onSendMessage={handleSendMessage}
            disabled={!isApiConfigured || isTyping}
          />
        </>
      )}
    </div>
  );
}

export default App;
