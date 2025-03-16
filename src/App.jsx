import React, { useState, useEffect } from 'react';
import Header from './components/Header/Header';
import ChatContainer from './components/ChatContainer/ChatContainer';
import InputContainer from './components/InputContainer/InputContainer';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isApiConfigured, setIsApiConfigured] = useState(false);

  useEffect(() => {
    checkApiConfiguration();
    loadChatHistory();
    const checkStoredResults = async () => {
      try {
        const { lastSearchResults } = await chrome.storage.local.get('lastSearchResults');
        if (lastSearchResults) {
          console.log('Found stored search results:', lastSearchResults);
          const assistantMessage = {
            type: 'assistant',
            text: 'Here are the products from your last search:',
            products: lastSearchResults.products,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, assistantMessage]);
          // Clear stored results
          await chrome.storage.local.remove('lastSearchResults');
        }
      } catch (error) {
        console.error('Error checking stored results:', error);
      }
    };

    checkStoredResults();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory(messages);
    }
  }, [messages]);

  const checkApiConfiguration = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'checkApiConfig' });
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
    try {
      const data = await chrome.storage.local.get('chatHistory');
      if (data.chatHistory) {
        setMessages(data.chatHistory);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const saveChatHistory = async (newMessages) => {
    try {
      await chrome.storage.local.set({ chatHistory: newMessages });
    } catch (error) {
      console.error('Error saving chat history:', error);
    }
  };

  const handleSettingsClick = () => {
    chrome.runtime.openOptionsPage();
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

  return (
    <div className="app">
      <Header onSettingsClick={handleSettingsClick} />
      <ChatContainer messages={messages} isTyping={isTyping} />
      <InputContainer 
        onSendMessage={handleSendMessage}
        disabled={!isApiConfigured || isTyping}
      />
    </div>
  );
}

export default App;
