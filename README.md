# Anna AI Shopping Assistant

Anna AI is a Chrome extension that enhances your Amazon shopping experience with AI-powered assistance. Using OpenAI's technology, Anna helps you make informed purchasing decisions by analyzing products, comparing options, and providing personalized recommendations.

## Features

- 🤖 AI-powered shopping assistant
- 💬 Natural conversation interface
- 🔍 Product analysis and comparison
- 📊 Price and feature evaluation
- 🎯 Personalized recommendations
- 🛍️ Seamless Amazon integration

## Installation

### For Users
1. Download from the Chrome Web Store (link coming soon)
2. Click "Add to Chrome"
3. Configure your OpenAI API key in the extension settings
4. Start shopping on Amazon with AI assistance!

### For Developers

#### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Chrome browser
- OpenAI API key

#### Setup
1. Clone the repository
```bash
git clone https://github.com/yourusername/anna-ai.git
cd anna-ai
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file in the root directory
```bash
VITE_OPENAI_API_KEY=your_api_key_here
```

4. Build the extension
```bash
npm run build
```

5. Load the extension in Chrome
- Open Chrome and go to `chrome://extensions/`
- Enable "Developer mode"
- Click "Load unpacked"
- Select the `dist` folder from your project

## Architecture

### Tech Stack
- React + Vite for the frontend
- Chrome Extensions Manifest V3
- OpenAI API for AI capabilities
- Local storage for settings and chat history

## Project Structure
### Key Components

1. **Background Service Worker** (`background.js`)
   - Handles API communications
   - Manages extension state
   - Processes messages between components

2. **Content Script** (`content.js`)
   - Injects the AI assistant interface
   - Handles DOM interactions
   - Communicates with the background service

3. **Options Page** (`Options.jsx`)
   - API key configuration
   - User preferences
   - Extension settings

4. **Main Interface** (`App.jsx`)
   - Chat interface
   - Product analysis
   - User interactions

## Design Decisions

### 1. Chrome Extension Architecture
- Chose Manifest V3 for future compatibility
- Used content scripts for seamless Amazon integration
- Implemented service worker for background processing

### 2. User Interface
- Floating overlay for easy access
- Chat-based interface for natural interaction
- Minimalist design to avoid cluttering shopping experience

### 3. Security
- Local API key storage
- Secure message passing
- Content security policies
- Host permissions limited to Amazon domains

### 4. Performance
- Lazy loading of components
- Efficient state management
- Optimized API calls
- Local storage for chat history

## Development

### Commands
```bash
# Development build with hot reload
npm run dev

# Production build
npm run build

# Lint code
npm run lint

# Run tests
npm run test
```

### Adding Features
1. Create new component in `src/components`
2. Update manifest if new permissions needed
3. Add to main App or relevant parent component
4. Test thoroughly across different Amazon pages

### Testing
- Unit tests for components
- Integration tests for API calls
- End-to-end tests for user flows
- Manual testing on various Amazon pages

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for their powerful API
- Chrome Extensions documentation
- React and Vite communities
- All contributors and testers

## Support

For support, please open an issue in the GitHub repository or contact the maintainers directly.

---