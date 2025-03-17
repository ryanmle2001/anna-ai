// Constants for rate limiting and anti-detection
const RATE_LIMIT = {
  MAX_REQUESTS_PER_HOUR: 100,
  DELAY_BETWEEN_REQUESTS: 3000, // 3 seconds
};

// OpenAI API Configuration
const OPENAI_CONFIG = {
  MODEL: 'gpt-3.5-turbo',
  MAX_TOKENS: 1000,
  TEMPERATURE: 0.2
};

// Constants for popup management
const POPUP_CONFIG = {
  FADE_DURATION: 300, // milliseconds
  POSITION: {
    TOP: '20px',
    RIGHT: '20px'
  }
};

// Initialize state
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    requestHistory: [],
    openaiApiKey: null,
    activePopups: {},
    lastKeepAliveTime: Date.now()
  });
});

// Keep service worker active with periodic state check
async function checkKeepAlive() {
  const { lastKeepAliveTime } = await chrome.storage.local.get('lastKeepAliveTime');
  const now = Date.now();
  
  if (now - lastKeepAliveTime > 20000) {
    console.log('Service worker keepalive ping');
    await chrome.storage.local.set({ lastKeepAliveTime: now });
  }
}

// Set up periodic keep-alive check
setInterval(checkKeepAlive, 20000);

// Handle service worker activation
chrome.runtime.onStartup.addListener(async () => {
  console.log('Service Worker starting up');
  await chrome.storage.local.set({
    requestHistory: [],
    activePopups: {},
    lastKeepAliveTime: Date.now()
  });
});

// Store state in chrome.storage instead of global variables
async function getState() {
  const state = await chrome.storage.local.get(['requestHistory', 'openaiApiKey', 'activePopups']);
  return {
    requestHistory: state.requestHistory || [],
    openaiApiKey: state.openaiApiKey || null,
    activePopups: state.activePopups || {}
  };
}

async function setState(updates) {
  const current = await getState();
  const newState = { ...current, ...updates };
  await chrome.storage.local.set(newState);
  return newState;
}

// Function to test OpenAI API key with a sample request
async function testOpenAIKey(apiKey) {
  try {
    // Test the API key with a minimal request to OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_CONFIG.MODEL,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5,
        temperature: OPENAI_CONFIG.TEMPERATURE
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Invalid API key: ${error.error?.message || 'Unable to authenticate with OpenAI'}`);
    }

    return true;
  } catch (error) {
    console.error('Error testing API key:', error);
    throw error;
  }
}

// Function to store the OpenAI API key
async function storeOpenAIKey(apiKey) {
  try {
    if (!apiKey || !apiKey.startsWith('sk-') || apiKey.length < 40) {
      throw new Error('Invalid OpenAI API key format');
    }
    
    // Test the API key with a real request
    await testOpenAIKey(apiKey);
    await setState({ openaiApiKey: apiKey });
    
    return true;
  } catch (error) {
    console.error('Error validating/storing API key:', error);
    throw error;
  }
}

// Function to retrieve the stored OpenAI API key
async function getStoredOpenAIKey() {
  const state = await getState();
  return state.openaiApiKey;
}

// Initialize OpenAI configuration
async function initializeOpenAIConfig() {
  try {
    const apiKey = await getStoredOpenAIKey();
    await setState({ openaiApiKey: apiKey });
  } catch (error) {
    console.error('Error initializing OpenAI config:', error);
  }
}

// Call initialization
initializeOpenAIConfig();

// Listen for messages from the popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'popupClosed') {
    if (request.tabId) {
      (async () => {
        const state = await getState();
        const { [request.tabId]: removed, ...remainingPopups } = state.activePopups;
        await setState({ activePopups: remainingPopups });
      })();
    }
    return;
  }

  if (request.action === 'openPopup') {
    // Get the current tab ID
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab) return;

      try {
        await showPopupOnAmazonPage(currentTab.id, currentTab.url);
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error opening popup:', error);
        sendResponse({ success: false, error: error.message });
      }
    });
    return true;
  }

  if (request.action === 'testApiKey') {
    // Test the API key without storing it
    testOpenAIKey(request.apiKey)
      .then(() => {
        sendResponse({ isValid: true });
      })
      .catch(error => {
        sendResponse({ isValid: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'checkApiConfig') {
    const userId = request.userId;
    chrome.storage.local.get(`apiKey_${userId}`, async (data) => {
      try {
        const apiKey = data[`apiKey_${userId}`];
        if (!apiKey) {
          sendResponse({ openaiConfigured: false });
          return;
        }
        
        // Test the stored API key
        const isValid = await testOpenAIKey(apiKey);
        sendResponse({ openaiConfigured: isValid });
      } catch (error) {
        console.error('API key validation failed:', error);
        sendResponse({ openaiConfigured: false, error: error.message });
      }
    });
    return true;
  }

  if (request.action === 'setApiKey') {
    const { apiKey, userId } = request;
    storeOpenAIKey(request.apiKey)
      .then(() => {
        chrome.storage.local.set({ [`apiKey_${userId}`]: apiKey }); 
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'searchProducts') {
    console.log('Received search request:', request.query);
    (async () => {
      try {
        // Get current state
        const state = await getState();
        
        // Get the current user ID from storage
        const { currentUserId } = await chrome.storage.local.get('currentUserId');
        if (!currentUserId) {
          throw new Error('User not authenticated');
        }

        // Get the API key for the current user
        const data = await chrome.storage.local.get(`apiKey_${currentUserId}`);
        const apiKey = data[`apiKey_${currentUserId}`];
        
        if (!apiKey) {
          throw new Error('OpenAI API key not configured');
        }

        // Update state with API key
        await setState({ openaiApiKey: apiKey });

        const result = await handleSearchProducts(request, sender, sendResponse);
        if (result !== undefined) {
          sendResponse(result);
        }
      } catch (error) {
        console.error('Search error in listener:', error);
        sendResponse({ error: error.message || 'Failed to search products' });
      }
    })();
    return true;
  }
});

async function handleSearchProducts(request, sender, sendResponse) {
  let timeoutId;
  
  try {
    // Get the current user ID from storage
    const { currentUserId } = await chrome.storage.local.get('currentUserId');
    if (!currentUserId) {
      throw new Error('User not authenticated');
    }

    // Get the API key for the current user
    const data = await chrome.storage.local.get(`apiKey_${currentUserId}`);
    const apiKey = data[`apiKey_${currentUserId}`];
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    if (!request.query) {
      throw new Error('Search query is required');
    }

    console.log('Processing search query:', request.query);
    const parsedQuery = await generateOptimizedQuery(request.query);    
    console.log('Generated optimized query:', parsedQuery);

    const result = await handleProductSearch(parsedQuery.searchTerm, parsedQuery.filters);
    
    if (!result.products || result.products.length === 0) {
      sendResponse({ 
        error: 'No products found. Please try a different search.' 
      });
      return;
    }

    // Send successful response with both products and searchUrl
    sendResponse({ 
      products: result.products, 
      searchUrl: result.searchUrl,
      filters: parsedQuery.filters 
    });
  } catch (error) {
    console.error('Search error:', error);
    sendResponse({ 
      error: error.message || 'Failed to search products' 
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  // Set a timeout to ensure we always send a response
  timeoutId = setTimeout(() => {
    console.log('Search timed out');
    sendResponse({ 
      error: 'Search timed out. Please try again.' 
    });
  }, 25000);
}

// Parse natural language query into search terms and filters
function parseNaturalLanguageQuery(query) {
  const filters = {};
  let searchTerm = query;

  // Extract price range with more comprehensive patterns
  const pricePatterns = [
    { pattern: /under\s*\$?\s*(\d+(?:\.\d{2})?)/i, type: 'max' },
    { pattern: /less\s+than\s*\$?\s*(\d+(?:\.\d{2})?)/i, type: 'max' },
    { pattern: /cheaper\s+than\s*\$?\s*(\d+(?:\.\d{2})?)/i, type: 'max' },
    { pattern: /over\s*\$?\s*(\d+(?:\.\d{2})?)/i, type: 'min' },
    { pattern: /more\s+than\s*\$?\s*(\d+(?:\.\d{2})?)/i, type: 'min' },
    { pattern: /above\s*\$?\s*(\d+(?:\.\d{2})?)/i, type: 'min' },
    { pattern: /between\s*\$?\s*(\d+(?:\.\d{2})?)\s*(?:and|to|-)\s*\$?\s*(\d+(?:\.\d{2})?)/i, type: 'range' }
  ];

  // Try each price pattern
  for (const { pattern, type } of pricePatterns) {
    const match = searchTerm.match(pattern);
    if (match) {
      if (type === 'range') {
        filters.minPrice = parseFloat(match[1]);
        filters.maxPrice = parseFloat(match[2]);
      } else if (type === 'min') {
        filters.minPrice = parseFloat(match[1]);
      } else if (type === 'max') {
        filters.maxPrice = parseFloat(match[1]);
      }
      searchTerm = searchTerm.replace(match[0], '');
      break;
    }
  }

  // Extract review count requirements
  const reviewCountPatterns = [
    /(?:with|has|having)\s+(?:at\s+least\s+)?(\d[\d,]*)\s+reviews?/i,
    /(\d[\d,]*)\+?\s+reviews?/i,
    /more\s+than\s+(\d[\d,]*)\s+reviews?/i
  ];

  for (const pattern of reviewCountPatterns) {
    const match = searchTerm.match(pattern);
    if (match) {
      filters.minReviewCount = parseInt(match[1].replace(/,/g, ''));
      searchTerm = searchTerm.replace(match[0], '');
      break;
    }
  }

  // Extract Prime preference
  if (/\b(?:with\s+)?prime(?:\s+shipping)?\b/i.test(searchTerm)) {
    filters.prime = true;
    searchTerm = searchTerm.replace(/\b(?:with\s+)?prime(?:\s+shipping)?\b/i, '');
  }

  // Extract rating preference
  const rating = searchTerm.match(/(\d+(?:\.\d+)?)\+?\s*stars?/i);
  if (rating) {
    filters.minRating = parseFloat(rating[1]);
    searchTerm = searchTerm.replace(rating[0], '');
  }

  // Extract shipping preferences
  if (/\bfree shipping\b/i.test(searchTerm)) {
    filters.freeShipping = true;
    searchTerm = searchTerm.replace(/\bfree shipping\b/i, '');
  }

  // Extract delivery time preferences
  const nextDay = /\b(?:next|one)\s*day\s*(?:delivery|shipping)\b/i;
  const twoDay = /\btwo\s*day\s*(?:delivery|shipping)\b/i;
  if (nextDay.test(searchTerm)) {
    filters.deliverySpeed = 'next-day';
    searchTerm = searchTerm.replace(nextDay, '');
  } else if (twoDay.test(searchTerm)) {
    filters.deliverySpeed = 'two-day';
    searchTerm = searchTerm.replace(twoDay, '');
  }

  // Extract condition preferences
  if (/\bnew\b/i.test(searchTerm)) {
    filters.condition = 'new';
    searchTerm = searchTerm.replace(/\bnew\b/i, '');
  } else if (/\bused\b/i.test(searchTerm)) {
    filters.condition = 'used';
    searchTerm = searchTerm.replace(/\bused\b/i, '');
  } else if (/\brefurbished\b/i.test(searchTerm)) {
    filters.condition = 'refurbished';
    searchTerm = searchTerm.replace(/\brefurbished\b/i, '');
  }

  // Extract brand preferences
  const brandMatch = searchTerm.match(/\bby\s+([A-Za-z0-9\s]+?)(?:\s+(?:brand|company))?\b/i);
  if (brandMatch) {
    filters.brand = brandMatch[1].trim();
    searchTerm = searchTerm.replace(brandMatch[0], '');
  }

  // Clean up search term - remove extra spaces and normalize
  searchTerm = searchTerm
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Remove duplicate words
  const terms = new Set(searchTerm.split(' '));
  searchTerm = Array.from(terms).join(' ');

  return {
    searchTerm,
    filters
  };
}

// Construct Amazon search URL with filters
function constructSearchUrl(query, filters, isDirectSearch = false) {
  const baseUrl = 'https://www.amazon.com/s';
  const params = new URLSearchParams();

  // Clean up search query - remove extra spaces and duplicates
  const searchTerms = new Set(query.toLowerCase().split(/\s+/));
  const cleanQuery = Array.from(searchTerms).join(' ');
  
  // Add search query
  params.append('k', cleanQuery);

  // Add price filters using Amazon's native price filter parameters
  let priceRefinement = '';
  if (filters.minPrice && filters.maxPrice) {
    // Both min and max price
    params.append('low-price', Math.floor(filters.minPrice));
    params.append('high-price', Math.ceil(filters.maxPrice));
    priceRefinement = `p_36:${Math.floor(filters.minPrice)}00-${Math.ceil(filters.maxPrice)}00`;
  } else if (filters.minPrice) {
    // Only min price
    params.append('low-price', Math.floor(filters.minPrice));
    priceRefinement = `p_36:${Math.floor(filters.minPrice)}00-`;
  } else if (filters.maxPrice) {
    // Only max price
    params.append('high-price', Math.ceil(filters.maxPrice));
    priceRefinement = `p_36:-${Math.ceil(filters.maxPrice)}00`;
  }

  // Add refinements if we have any
  if (priceRefinement) {
    params.append('rh', priceRefinement);
  }

  // Add department/category if available
  if (filters.productType) {
    const searchIndex = getSearchIndex(filters.productType);
    if (searchIndex) {
      params.append('i', searchIndex);
    }
  }

  // Sort by price when price filters are present
  if (filters.minPrice || filters.maxPrice) {
    params.append('s', 'price-asc-rank');
  }

  // Prime filter
  if (filters.prime) {
    params.append('p_85', '2470955011');
  }

  // Rating filter
  if (filters.minRating) {
    const ratingValue = Math.ceil(filters.minRating);
    const ratingMap = {
      4: '1248882011',
      3: '1248883011',
      2: '1248884011',
      1: '1248885011'
    };
    if (ratingMap[ratingValue]) {
      params.append('p_72', ratingMap[ratingValue]);
    }
  }

  // Free shipping filter
  if (filters.freeShipping) {
    params.append('p_76', '1');
  }

  // Brand filter
  if (filters.brand) {
    params.append('p_89', filters.brand);
  }

  // Condition filter
  if (filters.condition) {
    const conditionMap = {
      'new': '6461716011',
      'used': '6461717011',
      'refurbished': '6461718011'
    };
    if (conditionMap[filters.condition]) {
      params.append('p_n_condition-type', conditionMap[filters.condition]);
    }
  }

  // Delivery speed filter
  if (filters.deliverySpeed) {
    const deliveryMap = {
      'next-day': '11292772011',
      'two-day': '11292771011'
    };
    if (deliveryMap[filters.deliverySpeed]) {
      params.append('p_97', deliveryMap[filters.deliverySpeed]);
    }
  }

  // Add standard Amazon parameters
  params.append('ref', 'sr_st_price-asc-rank');
  params.append('dc', '');
  params.append('qid', generateRandomString(20));
  params.append('sprefix', cleanQuery.replace(/[^a-z0-9]/g, ''));
  params.append('language', 'en_US');

  // Construct the final URL
  const url = new URL(baseUrl);
  url.search = params.toString();
  return url.toString();
}

// Helper function to get search index based on product type
function getSearchIndex(productType) {
  const typeMap = {
    'electronics': 'electronics',
    'books': 'stripbooks',
    'clothing': 'fashion',
    'shoes': 'fashion',
    'beauty': 'beauty',
    'home': 'garden',
    'kitchen': 'kitchen',
    'toys': 'toys',
    'sports': 'sporting',
    'automotive': 'automotive',
    'tools': 'tools'
  };
  return typeMap[productType.toLowerCase()];
}

// Helper function to get size filter codes (simplified example)
function getSizeFilter(size) {
  // This would need to be expanded based on product category
  const sizeMap = {
    'small': '2475999011',
    'medium': '2476000011',
    'large': '2476001011',
    'xl': '2476002011'
  };
  return sizeMap[size.toLowerCase()] || '';
}

// Helper function to get color filter codes (simplified example)
function getColorFilter(color) {
  // This would need to be expanded with actual Amazon color codes
  const colorMap = {
    'black': '2475992011',
    'blue': '2475993011',
    'red': '2475994011',
    'white': '2475995011'
  };
  return colorMap[color.toLowerCase()] || '';
}

// Check if we're within rate limits
async function checkRateLimit() {
  const state = await getState();
  const now = Date.now();
  
  // Remove requests older than 1 hour
  const updatedHistory = state.requestHistory.filter(time => now - time < 3600000);
  
  if (updatedHistory.length >= RATE_LIMIT.MAX_REQUESTS_PER_HOUR) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  
  // Check if we need to wait between requests
  const lastRequest = updatedHistory[updatedHistory.length - 1];
  if (lastRequest && now - lastRequest < RATE_LIMIT.DELAY_BETWEEN_REQUESTS) {
    const waitTime = RATE_LIMIT.DELAY_BETWEEN_REQUESTS - (now - lastRequest);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  // Update request history
  updatedHistory.push(now);
  await setState({ requestHistory: updatedHistory });
}

// Handle product search
async function handleProductSearch(query, filters = {}, popupTab = null) {
  // Maintain rate limiting
  await checkRateLimit();
  
  // Get user settings
  const settings = await chrome.storage.local.get(['maxResults', 'skipSponsored']);
  const maxResults = settings.maxResults || 3;
  
  try {
    // Construct search URL with isDirectSearch=true to include all filters
    const searchUrl = constructSearchUrl(query, filters, true);
    
    // Create a hidden tab for scraping
    const searchTab = await chrome.tabs.create({ 
      url: searchUrl,
      active: false
    });

    // Wait for page load with timeout and retries
    let retries = 0;
    const maxRetries = 5;
    let results = [];

    while (retries < maxRetries && results.length < maxResults) {
      try {
        // Increase initial wait time for first try
        await new Promise(resolve => setTimeout(resolve, retries === 0 ? 2500 : 1500));
        
        // Check if page is ready
        const readyCheck = await chrome.scripting.executeScript({
          target: { tabId: searchTab.id },
          function: () => {
            const grid = document.querySelector('.s-main-slot');
            const products = grid ? grid.querySelectorAll('[data-asin]:not([data-asin=""])') : [];
            return products.length > 0;
          }
        });

        if (!readyCheck[0].result) {
          console.log('Page not ready, retrying...');
          retries++;
          continue;
        }

        // Execute scraping
        const scriptResults = await chrome.scripting.executeScript({
          target: { tabId: searchTab.id },
          function: scrapeSearchResults,
          args: [{ ...filters, skipSponsored: settings.skipSponsored, maxResults }]
        });

        results = scriptResults[0].result || [];
        console.log(`Found ${results.length} products on try ${retries + 1}`);
        
        // If we got results, break the retry loop
        if (results.length > 0) break;
        
        retries++;
      } catch (e) {
        console.log(`Retry ${retries + 1} failed:`, e);
        retries++;
        // Wait a bit longer after an error
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Clean up the tab
    try {
      await chrome.tabs.remove(searchTab.id);
    } catch (e) {
      console.log('Error cleaning up tab:', e);
    }

    // If we don't have enough results, throw an error
    if (results.length === 0) {
      throw new Error('No products found matching your criteria. Please try a different search.');
    }

    // Store results and return them
    const finalResults = results.slice(0, maxResults);
    await chrome.storage.local.set({ 
      lastSearchResults: {
        products: finalResults,
        searchUrl: searchUrl
      }
    });
    
    return {
      products: finalResults,
      searchUrl: searchUrl,
      totalFound: results.length
    };

  } catch (error) {
    console.error('Scraping error:', error);
    throw new Error('Failed to search products: ' + error.message);
  }
}

// Generate random string for URL parameters
function generateRandomString(length) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  return Array.from(
    { length }, 
    () => chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
}

// Function that will be injected into the page to scrape results
function scrapeSearchResults(filters) {
  // Function to extract text content safely
  const extractText = (element) => element ? element.textContent.trim() : null;

  // Function to extract number from text
  const extractNumber = (text) => {
    if (!text) return null;
    const match = text.match(/[\d,]+\.?\d*/);
    return match ? parseFloat(match[0].replace(/,/g, '')) : null;
  };

  // Function to clean up and validate price
  const cleanPrice = (priceText) => {
    if (!priceText) return null;
    
    // Remove any non-price text and take first price if range
    priceText = priceText.trim()
      .replace(/^(from|starting at|as low as)\s*/i, '')
      .split('-')[0]
      .trim();
    
    // Extract price value
    const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
    if (!priceMatch) return null;
    
    // Convert to number for comparison
    const priceValue = parseFloat(priceMatch[1].replace(/,/g, ''));
    if (isNaN(priceValue)) return null;
    
    // Check price against filters
    if (filters.minPrice && priceValue < filters.minPrice) return null;
    if (filters.maxPrice && priceValue > filters.maxPrice) return null;
    
    return {
      formatted: `$${priceValue.toFixed(2)}`,
      value: priceValue
    };
  };

  // Function to find price element with multiple selectors
  const findPriceElement = (card) => {
    const selectors = [
      '.a-price .a-offscreen',
      '.a-color-base.a-text-normal',
      '.a-size-base.a-color-price',
      '.a-price-whole',
      '.a-price',
      'span[data-a-color="price"]',
      '.a-price-range',
      '.a-color-price'
    ];
    
    for (const selector of selectors) {
      const element = card.querySelector(selector);
      if (element) {
        const priceText = extractText(element);
        const price = cleanPrice(priceText);
        if (price) {
          return {
            element,
            price: price.formatted,
            value: price.value
          };
        }
      }
    }
    return null;
  };

  // Function to validate product information
  const isValidProduct = (product) => {
    if (!product.title || !product.asin || !product.url || !product.image ||
        typeof product.rating !== 'number' || typeof product.reviewCount !== 'number') {
      return false;
    }

    // Strict price validation
    if (!product.price || typeof product.priceValue !== 'number') {
      return false;
    }
    
    // Double-check price against filters
    if (filters.minPrice && product.priceValue < filters.minPrice) return false;
    if (filters.maxPrice && product.priceValue > filters.maxPrice) return false;

    // Review count validation
    if (filters.minReviewCount && (!product.reviewCount || product.reviewCount < filters.minReviewCount)) {
      console.log(`Filtering out product with ${product.reviewCount} reviews < minimum ${filters.minReviewCount}`);
      return false;
    }

    // Rating validation
    if (filters.minRating && (!product.rating || product.rating < filters.minRating)) {
      console.log(`Filtering out product with ${product.rating} rating < minimum ${filters.minRating}`);
      return false;
    }

    return true;
  };

  try {
    // Wait for the main product grid to load
    const productGrid = document.querySelector('.s-main-slot');
    if (!productGrid) {
      console.error('Product grid not found');
      return [];
    }

    // Get all product cards
    const productCards = document.querySelectorAll('[data-asin]:not([data-asin=""])');
    console.log('Found product cards:', productCards.length);

    const products = [];
    const maxAttempts = Math.min(100, productCards.length);
    
    for (let i = 0; i < maxAttempts && products.length < filters.maxResults; i++) {
      try {
        const card = productCards[i];
        const asin = card.getAttribute('data-asin');
        if (!asin) continue;

        // Skip sponsored products if specified
        if (filters.skipSponsored && (
          card.querySelector('[data-component-type="sp-sponsored-result"]') ||
          card.querySelector('.s-sponsored-label-info-icon')
        )) {
          continue;
        }

        // Find elements using multiple possible selectors for better coverage
        const titleEl = card.querySelector('h2 a, h2 span a, .a-link-normal.a-text-normal');
        const priceInfo = findPriceElement(card);
        const ratingEl = card.querySelector('.a-icon-star-small, .a-star-small-4, .a-icon-star');
        const reviewCountEl = card.querySelector('.a-size-base.s-underline-text, .a-size-base.a-link-normal');
        const primeEl = card.querySelector('.s-prime, .a-icon-prime, .aok-relative.s-icon-text-medium.s-prime');
        const imageEl = card.querySelector('img.s-image, .s-image');

        if (titleEl && priceInfo) {
          const product = {
            asin,
            title: extractText(titleEl),
            url: new URL(titleEl.href || titleEl.closest('a').href, window.location.origin).href,
            price: priceInfo.price,
            priceValue: priceInfo.value,
            rating: ratingEl ? extractNumber(extractText(ratingEl)) : 0,
            reviewCount: reviewCountEl ? extractNumber(extractText(reviewCountEl)) : 0,
            isPrime: !!primeEl,
            image: imageEl ? imageEl.src : null,
            sponsored: false
          };

          // Only add products with complete information and matching price filters
          if (isValidProduct(product)) {
            console.log('Scraped valid product:', product);
            products.push(product);
          } else {
            console.log('Skipping product with invalid information or price:', {
              title: product.title,
              price: product.price,
              priceValue: product.priceValue,
              filters: { min: filters.minPrice, max: filters.maxPrice }
            });
          }
        }
      } catch (e) {
        console.error('Error parsing product card:', e);
      }
    }

    // Sort products by price if price filters are present
    if (filters.minPrice || filters.maxPrice) {
      products.sort((a, b) => a.priceValue - b.priceValue);
    }

    console.log(`Total valid products scraped: ${products.length}`);
    return products;

  } catch (e) {
    console.error('Error during scraping:', e);
    return [];
  }
}

// Function to generate optimized search query using OpenAI
async function generateOptimizedQuery(userQuery) {
  const state = await getState();
  if (!state.openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = {
    messages: [{
      role: 'system',
      content: `You are a search query optimizer for Amazon products. Convert natural language queries into structured search terms and filters.
                Analyze the query to understand product type and extract relevant attributes and filters.
                
                Consider these dynamic aspects for different product types:
                - Electronics: storage capacity, screen size, processor, RAM, connectivity
                - Clothing: size, color, material, style, fit, season
                - Books: format (hardcover/paperback/kindle), language, genre
                - Home goods: room type, dimensions, material, style
                - Beauty: skin type, ingredients, concerns
                - Food: dietary restrictions, ingredients, preparation
                
                Respond in JSON format with:
                {
                  "searchTerm": "optimized search keywords",
                  "productType": "category of product being searched",
                  "filters": {
                    "minPrice": number or null,
                    "maxPrice": number or null,
                    "prime": boolean,
                    "minRating": number or null,
                    "minReviewCount": number or null,
                    "freeShipping": boolean,
                    "deliverySpeed": "next-day" | "two-day" | null,
                    "condition": "new" | "used" | "refurbished" | null,
                    "brand": string or null,
                    "similarTo": string or null (for similar product descriptions),
                    "attributes": {
                      // Dynamic attributes based on product type
                      // Examples:
                      "color": string or null,
                      "size": string or null,
                      "material": string or null,
                      "storage": string or null,
                      "format": string or null,
                      // Add any other relevant attributes
                    },
                    "excludeTerms": [string] (terms to exclude from results),
                    "mustIncludeTerms": [string] (terms that must be in results)
                  }
                }

                Examples:
                1. "Find me a waterproof phone case similar to OtterBox but cheaper"
                2. "Show me cotton t-shirts in blue or navy, size large, under $30"
                3. "I need a 1TB SSD hard drive with USB-C connection and at least 1000 reviews"
                4. "Find me fantasy books like Lord of the Rings but in paperback with over 500 reviews"
                5. "Show me hypoallergenic face moisturizer for sensitive skin with at least 2000 reviews"
                6. "I want a coffee maker with a grinder and at least 100 positive reviews"
                7. "Show me 1TB SSD hard drives with USB-C connection and at least 1000 reviews"
                8. "Find me 1TB SSD hard drives with USB-C connection and at least 1000 reviews"
                9. "Show me 1TB SSD hard drives with USB-C connection and at least 1000 reviews"
                10. "Find me 1TB SSD hard drives with USB-C connection and at least 1000 reviews"`
    }, {
      role: 'user',
      content: userQuery
    }]
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.openaiApiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_CONFIG.MODEL,
        messages: prompt.messages,
        max_tokens: OPENAI_CONFIG.MAX_TOKENS,
        temperature: OPENAI_CONFIG.TEMPERATURE
      })
    });

    if (!response.ok) {
      throw new Error('OpenAI API request failed');
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    
    console.log('Raw OpenAI Response:', data);
    console.log('Parsed OpenAI Result:', result);
    
    // Enhance the search URL with additional filters
    const enhancedFilters = {
      ...result.filters,
      searchTerm: result.searchTerm
    };
    console.log('Enhanced Filters:', enhancedFilters);
    // Add product type specific terms to the search
    if (result.productType && result.filters.attributes) {
      const attributeTerms = Object.values(result.filters.attributes)
        .filter(val => val && typeof val === 'string')
        .join(' ');
      enhancedFilters.searchTerm = `${enhancedFilters.searchTerm} ${attributeTerms}`;
    }

    // Add must-include terms to the search
    if (result.filters.mustIncludeTerms && result.filters.mustIncludeTerms.length > 0) {
      enhancedFilters.searchTerm = `${enhancedFilters.searchTerm} ${result.filters.mustIncludeTerms.join(' ')}`;
    }

    return enhancedFilters;
  } catch (error) {
    console.error('OpenAI API error:', error);
    // Fallback to basic parsing if OpenAI fails
    return parseNaturalLanguageQuery(userQuery);
  }
}

// Listen for tab updates to detect Amazon pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('amazon.com')) {
    showPopupOnAmazonPage(tabId, tab.url);
  }
});

// Function to show popup on Amazon pages
async function showPopupOnAmazonPage(tabId, url) {
  try {
    const state = await getState();
    
    // Don't show popup if one is already active for this tab
    if (state.activePopups[tabId]) {
      return;
    }

    // Inject CSS for fade animation
    await chrome.scripting.insertCSS({
      target: { tabId },
      css: `
        .anna-ai-popup {
          position: fixed;
          top: ${POPUP_CONFIG.POSITION.TOP};
          right: ${POPUP_CONFIG.POSITION.RIGHT};
          z-index: 9999999;
          opacity: 0;
          transition: opacity ${POPUP_CONFIG.FADE_DURATION}ms ease-in-out;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          border-radius: 8px;
          background: white;
        }
        .anna-ai-popup.visible {
          opacity: 1;
        }
      `
    });

    // Create and inject popup iframe
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (fadeTime) => {
        const popup = document.createElement('div');
        popup.className = 'anna-ai-popup';
        
        const iframe = document.createElement('iframe');
        iframe.src = chrome.runtime.getURL('index.html');
        iframe.style.width = '360px';
        iframe.style.height = '580px';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        
        popup.appendChild(iframe);
        document.body.appendChild(popup);

        // Trigger fade in
        setTimeout(() => {
          popup.classList.add('visible');
        }, 100);

        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.className = 'anna-ai-popup-close';
        closeBtn.onclick = () => {
          popup.style.opacity = '0';
          setTimeout(() => {
            popup.remove();
            window.dispatchEvent(new Event('anna-ai-popup-closed'));
          }, fadeTime);
        };
        popup.appendChild(closeBtn);

        // Listen for popup closed event
        window.addEventListener('anna-ai-popup-closed', () => {
          chrome.runtime.sendMessage({ action: 'popupClosed', tabId });
        }, { once: true });
      },
      args: [POPUP_CONFIG.FADE_DURATION]
    });

    // Track active popup
    const updatedPopups = { ...state.activePopups, [tabId]: true };
    await setState({ activePopups: updatedPopups });

    // Clean up when tab is closed or navigated away
    chrome.tabs.onRemoved.addListener(async (removedTabId) => {
      if (removedTabId === tabId) {
        const currentState = await getState();
        const { [removedTabId]: removed, ...remainingPopups } = currentState.activePopups;
        await setState({ activePopups: remainingPopups });
      }
    });

  } catch (error) {
    console.error('Error showing popup:', error);
    throw error;
  }
}
