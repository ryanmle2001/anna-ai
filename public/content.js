// This content script runs on Amazon pages

// Add a floating action button to activate the assistant
function addAssistantButton() {
    const button = document.createElement('div');
    button.className = 'amazon-shopping-assistant-button';
    button.innerHTML = '<span>Shopping Assistant</span>';
    button.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #232f3e;
      color: white;
      padding: 12px 16px;
      border-radius: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      cursor: pointer;
      z-index: 9999;
      font-family: 'Amazon Ember', Arial, sans-serif;
      font-size: 14px;
      transition: all 0.2s ease;
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#ff9900';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#232f3e';
    });
    
    button.addEventListener('click', () => {
      openAssistantPopup();
    });
    
    document.body.appendChild(button);
  }
  
  // Open the assistant popup
  function openAssistantPopup() {
    chrome.runtime.sendMessage({ action: 'openPopup' });
  }
  
  // Initialize on page load
  function initialize() {
    // Only add button if we're on an Amazon product or search page
    const currentUrl = window.location.href;
    if (currentUrl.includes('amazon.com') && 
       (currentUrl.includes('/s?') || currentUrl.includes('/dp/'))) {
      addAssistantButton();
    }
  }
  
  // Wait for page to fully load
  window.addEventListener('load', initialize);
  