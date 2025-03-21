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
    lastKeepAliveTime: Date.now(),
    conversationContext: [] // Add conversation context to state
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
  const state = await chrome.storage.local.get(['requestHistory', 'openaiApiKey', 'activePopups', 'conversationContext']);
  return {
    requestHistory: state.requestHistory || [],
    openaiApiKey: state.openaiApiKey || null,
    activePopups: state.activePopups || {},
    conversationContext: state.conversationContext || []
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
    const parsedQueryFilters = await generateOptimizedQuery(request.query);    
    console.log('Generated optimized query:', parsedQueryFilters);

    if (!parsedQueryFilters) {
      sendResponse({
        error: 'Error generating optimized query, OpenAI request failed.'
      });
      return;
    }
    const result = await handleProductSearch(parsedQueryFilters.searchTerm, parsedQueryFilters);
    
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
      filters: parsedQueryFilters
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


// Construct Amazon search URL with filters
function constructSearchUrl(query, filters, isDirectSearch = false) {
  const baseUrl = 'https://www.amazon.com/s';
  const params = new URLSearchParams();

  // Clean up search query - remove extra spaces and duplicates
  const searchTerms = new Set(query.toLowerCase().split(/\s+/));
  const cleanQuery = Array.from(searchTerms).join(' ');
  
  // Add price filters using Amazon's native price filter parameters
  let refinements = [];
  
  // Price refinement
  if (filters.minPrice && filters.maxPrice) {
    refinements.push(`p_36:${Math.floor(filters.minPrice)}00-${Math.ceil(filters.maxPrice)}00`);
    params.append('low-price', Math.floor(filters.minPrice));
    params.append('high-price', Math.ceil(filters.maxPrice));
  } else if (filters.minPrice) {
    refinements.push(`p_36:${Math.floor(filters.minPrice)}00-`);
    params.append('low-price', Math.floor(filters.minPrice));
    params.append('high-price', '');
  } else if (filters.maxPrice) {
    refinements.push(`p_36:0-${Math.ceil(filters.maxPrice)}00`);
    params.append('low-price', '');
    params.append('high-price', Math.ceil(filters.maxPrice));
  }

  // Prime filter (p_85 is Prime eligibility)
  if (filters.prime) {
    refinements.push('p_85:2470955011');
    params.append('prime', '1');
  }

  // Rating filter (p_72 is customer review rating)
  if (filters.minRating) {
    const ratingValue = Math.ceil(filters.minRating);
    const ratingMap = {
      4: '1248882011', // 4+ stars
      3: '1248883011', // 3+ stars
      2: '1248884011', // 2+ stars
      1: '1248885011'  // 1+ stars
    };
    if (ratingMap[ratingValue]) {
      refinements.push(`p_72:${ratingMap[ratingValue]}`);
      params.append('ratingFilter', ratingValue);
    }
  }

  // Review count filter (if present)
  if (filters.minReviewCount) {
    refinements.push(`p_n_global_review_count:${filters.minReviewCount}-`);
  }

  // Free shipping filter (p_76 is shipping options)
  if (filters.freeShipping) {
    refinements.push('p_76:1');
    params.append('shipping', 'free');
  }

  // Brand filter (p_89 is brand)
  if (filters.brand) {
    // Encode brand name for URL safety
    const encodedBrand = encodeURIComponent(filters.brand);
    refinements.push(`p_89:${encodedBrand}`);
    params.append('brand', filters.brand);
  }

  // Condition filter (p_n_condition-type is condition)
  if (filters.condition) {
    const conditionMap = {
      'new': '6461716011',
      'used': '6461717011',
      'refurbished': '6461718011'
    };
    if (conditionMap[filters.condition]) {
      refinements.push(`p_n_condition-type:${conditionMap[filters.condition]}`);
      params.append('condition', filters.condition);
    }
  }

  // Delivery speed filter (p_97 is delivery speed)
  if (filters.deliverySpeed) {
    const deliveryMap = {
      'next-day': '11292772011',
      'two-day': '11292771011'
    };
    if (deliveryMap[filters.deliverySpeed]) {
      refinements.push(`p_97:${deliveryMap[filters.deliverySpeed]}`);
      params.append('delivery', filters.deliverySpeed);
    }
  }

  // Combine all refinements with proper separator
  if (refinements.length > 0) {
    params.append('rh', refinements.join(','));
  }

  // Add search query
  params.append('k', cleanQuery);

  // Sort parameters
  if (filters.minPrice || filters.maxPrice) {
    params.append('s', 'price-asc-rank');
  } else {
    params.append('s', 'relevance-fs-rank'); // Default to featured/relevant items
  }

  // Add standard Amazon parameters
  params.append('ref', 'sr_st_' + (filters.minPrice || filters.maxPrice ? 'price-asc-rank' : 'relevance-fs-rank'));
  params.append('dc', '');
  params.append('qid', generateRandomString(20));
  params.append('sprefix', cleanQuery.replace(/[^a-z0-9]/g, ''));
  params.append('language', 'en_US');

  // Construct the final URL
  const url = new URL(baseUrl);
  url.search = params.toString();
  return url.toString();
}

// Helper function to get category-specific refinements
function getCategoryRefinements(productType) {
  const categoryMap = {
    'electronics': 'n:172282',
    'books': 'n:283155',
    'clothing': 'n:7141123011',
    'beauty': 'n:3760911',
    'home': 'n:1055398',
    'kitchen': 'n:284507',
    'toys': 'n:165793011',
    'sports': 'n:3375251',
    'automotive': 'n:15684181',
    'tools': 'n:228013'
  };
  return categoryMap[productType.toLowerCase()];
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

  // Get conversation context
  const context = state.conversationContext || [];
  
  // Create messages array with system prompt and conversation history
  const messages = [{
    role: 'system',
    content: `You are a search query optimizer for Amazon products. Convert natural language queries into structured search terms and filters.
              Analyze the query to understand product type and extract relevant attributes and filters.
              Maintain context from previous queries to enhance the current search.
              If a query seems to be refining a previous search, combine the contexts appropriately.
              
              You MUST ALWAYS respond with a complete JSON structure containing ALL fields, even if they are null.

              Required JSON format:
              {
                "searchTerm": "optimized search keywords",
                "productType": "category of product being searched",
                "filters": {
                  "minPrice": number | null,
                  "maxPrice": number | null,
                  "prime": boolean,
                  "minRating": number | null,
                  "minReviewCount": number | null,
                  "freeShipping": boolean,
                  "deliverySpeed": "next-day" | "two-day" | null,
                  "condition": "new" | "used" | "refurbished" | null,
                  "brand": string | null,
                  "similarTo": string | null,
                  "attributes": {
                    "color": string | null,
                    "size": string | null,
                    "material": string | null,
                    "storage": string | null,
                    "format": string | null
                  },
                  "excludeTerms": string[],
                  "mustIncludeTerms": string[]
                }
              }

              Example response for "show me korean skincare":
              {
                "searchTerm": "korean skincare",
                "productType": "beauty",
                "filters": {
                  "minPrice": null,
                  "maxPrice": null,
                  "prime": false,
                  "minRating": null,
                  "minReviewCount": null,
                  "freeShipping": false,
                  "deliverySpeed": null,
                  "condition": null,
                  "brand": null,
                  "similarTo": null,
                  "attributes": {
                    "color": null,
                    "size": null,
                    "material": null,
                    "storage": null,
                    "format": null
                  },
                  "excludeTerms": [],
                  "mustIncludeTerms": []
                }
              }

              Consider these dynamic aspects for different product types:
              - Electronics: storage capacity, screen size, processor, RAM, connectivity
              - Clothing: size, color, material, style, fit, season
              - Books: format (hardcover/paperback/kindle), language, genre
              - Home goods: room type, dimensions, material, style
              - Beauty: skin type, ingredients, concerns
              - Food: dietary restrictions, ingredients, preparation`
  }];

  // Add conversation history to messages
  context.forEach(entry => {
    messages.push({ role: 'user', content: entry.query });
    if (entry.response) {
      messages.push({ role: 'assistant', content: JSON.stringify(entry.response) });
    }
  });

  // Add current query
  messages.push({ role: 'user', content: userQuery });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.openaiApiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_CONFIG.MODEL,
        messages: messages,
        max_tokens: OPENAI_CONFIG.MAX_TOKENS,
        temperature: OPENAI_CONFIG.TEMPERATURE
      })
    });

    if (!response.ok) {
      throw new Error('OpenAI API request failed');
    }

    const data = await response.json();
    let result = JSON.parse(data.choices[0].message.content);
    
    // Validate and ensure complete structure
    const defaultStructure = {
      searchTerm: "",
      productType: "",
      filters: {
        minPrice: null,
        maxPrice: null,
        prime: false,
        minRating: null,
        minReviewCount: null,
        freeShipping: false,
        deliverySpeed: null,
        condition: null,
        brand: null,
        similarTo: null,
        attributes: {
          color: null,
          size: null,
          material: null,
          storage: null,
          format: null
        },
        excludeTerms: [],
        mustIncludeTerms: []
      }
    };

    // Merge the response with default structure to ensure all fields exist
    result = {
      ...defaultStructure,
      ...result,
      filters: {
        ...defaultStructure.filters,
        ...result.filters,
        attributes: {
          ...defaultStructure.filters.attributes,
          ...(result.filters?.attributes || {})
        }
      }
    };

    console.log('Raw OpenAI Response:', data);
    console.log('Validated Result:', result);
    
    // Update conversation context
    context.push({
      query: userQuery,
      response: result,
      timestamp: Date.now()
    });

    // Keep only last 5 exchanges to maintain reasonable context window
    if (context.length > 5) {
      context.shift();
    }

    // Save updated context
    await setState({ conversationContext: context });
    
    // Enhance the search URL with additional filters
    const enhancedFilters = {
      ...result.filters,
      searchTerm: result.searchTerm
    };

    // Add product type specific terms to the search
    if (result.productType && result.filters.attributes) {
      const attributeTerms = Object.values(result.filters.attributes)
        .filter(val => val && typeof val === 'string')
        .join(' ');
      enhancedFilters.searchTerm = `${enhancedFilters.searchTerm} ${attributeTerms}`;
    }

    // Add must-include terms to the search
    // if (result.filters.mustIncludeTerms && result.filters.mustIncludeTerms.length > 0) {
    //   enhancedFilters.searchTerm = `${enhancedFilters.searchTerm} ${result.filters.mustIncludeTerms.join(' ')}`;
    // }

    return enhancedFilters;
  } catch (error) {
    console.error('OpenAI API error:', error);
    return null;
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
