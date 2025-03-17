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

// Keep track of requests
let requestHistory = [];
let openaiApiKey = null;

// Track active popups
let activePopups = new Map();

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

    await chrome.storage.local.set({ 
      'openai_api_key': apiKey 
    });
    
    openaiApiKey = apiKey;
    
    return true;
  } catch (error) {
    console.error('Error validating/storing API key:', error);
    throw error;
  }
}

// Function to retrieve the stored OpenAI API key
async function getStoredOpenAIKey() {
  try {
    const data = await chrome.storage.local.get('openai_api_key');
    return data.openai_api_key || null;
  } catch (error) {
    console.error('Error retrieving API key:', error);
    return null;
  }
}

// Initialize OpenAI configuration
async function initializeOpenAIConfig() {
  try {
    openaiApiKey = await getStoredOpenAIKey();
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
      activePopups.delete(request.tabId);
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
    // Extract requested items count if provided
    const requestedItems = request.itemCount || 3;
    request.filters = request.filters || {};
    request.filters.requestedItems = requestedItems;
    
    handleSearchProducts(request, sender, sendResponse);
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

    console.log('Received search request:', request.query);
    const parsedQuery = await generateOptimizedQuery(request.query);
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

  // Keep the message channel open
  return true;
}

// Parse natural language query into search terms and filters
function parseNaturalLanguageQuery(query) {
  const filters = {};
  let searchTerm = query;

  // Extract price range
  const underPrice = query.match(/under\s*\$?\s*(\d+)/i);
  const overPrice = query.match(/over\s*\$?\s*(\d+)/i);
  const betweenPrice = query.match(/between\s*\$?\s*(\d+)\s*(?:and|to|-)\s*\$?\s*(\d+)/i);

  if (betweenPrice) {
    filters.minPrice = parseInt(betweenPrice[1]);
    filters.maxPrice = parseInt(betweenPrice[2]);
    searchTerm = searchTerm.replace(betweenPrice[0], '');
  } else {
    if (underPrice) {
      filters.maxPrice = parseInt(underPrice[1]);
      searchTerm = searchTerm.replace(underPrice[0], '');
    }
    if (overPrice) {
      filters.minPrice = parseInt(overPrice[1]);
      searchTerm = searchTerm.replace(overPrice[0], '');
    }
  }

  // Extract Prime preference
  if (/\b(?:with\s+)?prime(?:\s+shipping)?\b/i.test(query)) {
    filters.prime = true;
    searchTerm = searchTerm.replace(/\b(?:with\s+)?prime(?:\s+shipping)?\b/i, '');
  }

  // Extract rating preference
  const rating = query.match(/(\d+(?:\.\d+)?)\+?\s*stars?/i);
  if (rating) {
    filters.minRating = parseFloat(rating[1]);
    searchTerm = searchTerm.replace(rating[0], '');
  }

  // Extract shipping preferences
  if (/\bfree shipping\b/i.test(query)) {
    filters.freeShipping = true;
    searchTerm = searchTerm.replace(/\bfree shipping\b/i, '');
  }

  // Extract delivery time preferences
  const nextDay = /\b(?:next|one)\s*day\s*(?:delivery|shipping)\b/i;
  const twoDay = /\btwo\s*day\s*(?:delivery|shipping)\b/i;
  if (nextDay.test(query)) {
    filters.deliverySpeed = 'next-day';
    searchTerm = searchTerm.replace(nextDay, '');
  } else if (twoDay.test(query)) {
    filters.deliverySpeed = 'two-day';
    searchTerm = searchTerm.replace(twoDay, '');
  }

  // Extract condition preferences
  if (/\bnew\b/i.test(query)) {
    filters.condition = 'new';
    searchTerm = searchTerm.replace(/\bnew\b/i, '');
  } else if (/\bused\b/i.test(query)) {
    filters.condition = 'used';
    searchTerm = searchTerm.replace(/\bused\b/i, '');
  } else if (/\brefurbished\b/i.test(query)) {
    filters.condition = 'refurbished';
    searchTerm = searchTerm.replace(/\brefurbished\b/i, '');
  }

  // Extract brand preferences
  const brandMatch = query.match(/\bby\s+([A-Za-z0-9\s]+?)(?:\s+(?:brand|company))?\b/i);
  if (brandMatch) {
    filters.brand = brandMatch[1].trim();
    searchTerm = searchTerm.replace(brandMatch[0], '');
  }

  // Clean up search term
  searchTerm = searchTerm
    .replace(/\s+/g, ' ')
    .trim();

  return {
    searchTerm,
    filters
  };
}

// Navigate to search results (either in current or new tab)
async function navigateToSearch(query, filters, currentTab, isAmazonTab) {
  const url = constructSearchUrl(query, filters, true);
  
  if (isAmazonTab) {
    // Update the current Amazon tab
    await chrome.tabs.update(currentTab.id, { url });
  } else {
    // Open a new tab if we're not on Amazon
    await chrome.tabs.create({ url, active: true });
  }
}

// Construct Amazon search URL with filters
function constructSearchUrl(query, filters, isDirectSearch = false) {
  const baseUrl = 'https://www.amazon.com/s';
  const params = new URLSearchParams();

  // Build search query with filters
  let searchQuery = query;
  
  // Handle exclude terms
  if (filters.excludeTerms && filters.excludeTerms.length > 0) {
    filters.excludeTerms.forEach(term => {
      searchQuery = `${searchQuery} -${term}`;
    });
  }

  // Add search query
  params.append('k', searchQuery);

  // Add ref and encoding parameters
  if (!isDirectSearch) {
    params.append('ref', `sr_nr_${Math.floor(Math.random() * 100)}`);
    params.append('crid', generateRandomString(21));
    params.append('sprefix', `${query.toLowerCase().replace(/[^a-z0-9]/g, '')}%2Caps%2C${Math.floor(Math.random() * 300)}`);
    params.append('qid', generateRandomString(20));
  }

  // Add filters
  let rh = [];

  // Prime filter
  if (filters.prime) {
    rh.push('p_85:2470955011');
  }

  // Price range filter
  if (filters.minPrice || filters.maxPrice) {
    let priceFilter = 'p_36:';
    if (filters.minPrice) priceFilter += filters.minPrice * 100;
    priceFilter += '-';
    if (filters.maxPrice) priceFilter += filters.maxPrice * 100;
    else priceFilter += '999999999';
    rh.push(priceFilter);
  }

  // Rating filter
  if (filters.minRating) {
    rh.push(`p_72:${Math.ceil(filters.minRating)}-`);
  }

  // Condition filter
  if (filters.condition) {
    const conditionMap = {
      'new': 'p_n_condition-type:6461716011',
      'used': 'p_n_condition-type:6461717011',
      'refurbished': 'p_n_condition-type:6461718011'
    };
    if (conditionMap[filters.condition]) {
      rh.push(conditionMap[filters.condition]);
    }
  }

  // Delivery speed filter
  if (filters.deliverySpeed) {
    const deliveryMap = {
      'next-day': 'p_97:11292772011',
      'two-day': 'p_97:11292771011'
    };
    if (deliveryMap[filters.deliverySpeed]) {
      rh.push(deliveryMap[filters.deliverySpeed]);
    }
  }

  // Free shipping filter
  if (filters.freeShipping) {
    rh.push('p_76:1');
  }

  // Brand filter
  if (filters.brand) {
    rh.push(`p_89:${encodeURIComponent(filters.brand)}`);
  }

  // Handle dynamic attributes based on product type
  if (filters.attributes) {
    // Size filter (clothing, shoes, etc.)
    if (filters.attributes.size) {
      rh.push(`p_n_size_browse-vebin:${getSizeFilter(filters.attributes.size)}`);
    }

    // Color filter
    if (filters.attributes.color) {
      rh.push(`p_n_feature_twenty_browse-bin:${getColorFilter(filters.attributes.color)}`);
    }

    // Book format filter
    if (filters.attributes.format) {
      const formatMap = {
        'hardcover': 'p_n_binding_browse-bin:1232478011',
        'paperback': 'p_n_binding_browse-bin:1232478011',
        'kindle': 'p_n_binding_browse-bin:1232597011',
        'audiobook': 'p_n_binding_browse-bin:1232596011'
      };
      const formatFilter = formatMap[filters.attributes.format.toLowerCase()];
      if (formatFilter) rh.push(formatFilter);
    }
  }

  // Combine all refinements
  if (rh.length > 0) {
    params.append('rh', rh.join(','));
  }

  // Add search index based on product type if available
  if (filters.productType) {
    const searchIndex = getSearchIndex(filters.productType);
    if (searchIndex) {
      params.append('i', searchIndex);
    }
  }

  return `${baseUrl}?${params.toString()}`;
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
function checkRateLimit() {
  const now = Date.now();
  // Remove requests older than 1 hour
  requestHistory = requestHistory.filter(time => now - time < 3600000);
  
  if (requestHistory.length >= RATE_LIMIT.MAX_REQUESTS_PER_HOUR) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  
  // Check if we need to wait between requests
  const lastRequest = requestHistory[requestHistory.length - 1];
  if (lastRequest && now - lastRequest < RATE_LIMIT.DELAY_BETWEEN_REQUESTS) {
    const waitTime = RATE_LIMIT.DELAY_BETWEEN_REQUESTS - (now - lastRequest);
    return new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  return Promise.resolve();
}

// Handle product search
async function handleProductSearch(query, filters = {}, popupTab = null) {
  // Maintain rate limiting
  await checkRateLimit();
  requestHistory.push(Date.now());
  
  // Get user settings
  const settings = await chrome.storage.local.get(['maxResults', 'skipSponsored']);
  const maxResults = filters.requestedItems || settings.maxResults || 3;
  
  try {
    // Construct search URL for later use
    const searchUrl = constructSearchUrl(query, filters);
    console.log('Search URL prepared:', searchUrl);
    
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
  console.log('Starting product scraping with filters:', filters);

  // Function to extract text content safely
  const extractText = (element) => element ? element.textContent.trim() : null;

  // Function to extract number from text
  const extractNumber = (text) => text ? parseFloat(text.replace(/[^0-9.]/g, '')) : null;

  // Function to clean up price
  const cleanPrice = (price) => {
    if (!price) return null;
    price = price.trim();
    // Remove any non-price text (like "from", "starting at", etc.)
    price = price.replace(/^(from|starting at|as low as)\s*/i, '');
    // Extract the first price if there are multiple
    price = price.split('-')[0].trim();
    // Handle whole number prices without cents
    if (price.match(/^\$\d+$/)) {
      price = price + '.00';
    }
    // Clean up and ensure proper format
    const priceMatch = price.match(/\$?\d+(\.\d{2})?/);
    if (!priceMatch) return null;
    const cleanedPrice = priceMatch[0];
    // Ensure $ is at the start
    return cleanedPrice.startsWith('$') ? cleanedPrice : `$${cleanedPrice}`;
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
        const price = cleanPrice(extractText(element));
        if (price) return element;
      }
    }
    return null;
  };

  // Function to validate product information
  const isValidProduct = (product) => {
    return product.title && 
           product.price && // Now required
           product.asin && 
           product.url && 
           product.image &&
           typeof product.rating === 'number' &&
           typeof product.reviewCount === 'number';
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
    const maxAttempts = Math.min(100, productCards.length); // Increased to 100 to find more products with prices
    
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
        const priceEl = findPriceElement(card);
        const ratingEl = card.querySelector('.a-icon-star-small, .a-star-small-4, .a-icon-star');
        const reviewCountEl = card.querySelector('.a-size-base.s-underline-text, .a-size-base.a-link-normal');
        const primeEl = card.querySelector('.s-prime, .a-icon-prime, .aok-relative.s-icon-text-medium.s-prime');
        const imageEl = card.querySelector('img.s-image, .s-image');

        if (titleEl && priceEl) {  // Only proceed if we have both title and price
          const product = {
            asin,
            title: extractText(titleEl),
            url: new URL(titleEl.href || titleEl.closest('a').href, window.location.origin).href,
            price: cleanPrice(extractText(priceEl)),
            rating: ratingEl ? extractNumber(extractText(ratingEl)) : 0,
            reviewCount: reviewCountEl ? extractNumber(extractText(reviewCountEl)) : 0,
            isPrime: !!primeEl,
            image: imageEl ? imageEl.src : null,
            sponsored: false
          };

          // Only add products with complete information
          if (isValidProduct(product)) {
            console.log('Scraped valid product:', product);
            products.push(product);
          } else {
            console.log('Skipping product with incomplete information:', product);
          }
        }
      } catch (e) {
        console.error('Error parsing product card:', e);
      }
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
  if (!openaiApiKey) {
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
                3. "I need a 1TB SSD hard drive with USB-C connection and good reviews"
                4. "Find me fantasy books like Lord of the Rings but in paperback"
                5. "Show me hypoallergenic face moisturizer for sensitive skin without fragrance"
                6. "I want a coffee maker with a grinder, programmable timer, and thermal carafe"`
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
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_CONFIG.MODEL,
        messages: prompt.messages,
        max_tokens: OPENAI_CONFIG.MAX_TOKENS, // Increased to handle more detailed responses
        temperature: OPENAI_CONFIG.TEMPERATURE
      })
    });

    if (!response.ok) {
      throw new Error('OpenAI API request failed');
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    
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
    // Don't show popup if one is already active for this tab
    if (activePopups.has(tabId)) {
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
    activePopups.set(tabId, true);

    // Clean up when tab is closed or navigated away
    chrome.tabs.onRemoved.addListener((removedTabId) => {
      if (removedTabId === tabId) {
        activePopups.delete(tabId);
      }
    });

  } catch (error) {
    console.error('Error showing popup:', error);
    throw error;
  }
}
