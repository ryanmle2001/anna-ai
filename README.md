# Anna AI Shopping Assistant

Anna AI is a Chrome extension that enhances your Amazon shopping experience with AI-powered assistance. Using OpenAI's technology, Anna helps you make informed purchasing decisions by analyzing products, comparing options, and providing personalized recommendations.

## Features

- 🤖 AI-powered Amazon shopping assistant
- 💬 Natural conversation interface
- 📊 Price and feature evaluation
- 🎯 Personalized product recommendations
- 🔐 Secure Google authentication
- ⚡ Real-time product analysis
- 💾 Persistent chat history
- 🎨 Clean, modern UI

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Chrome browser
- Google OAuth Client ID
- OpenAI API key (user provides their own)

## Tech Stack

- React 18
- Vite
- Chrome Extensions Manifest V3
- Google OAuth 2.0
- OpenAI API
- JWT for authentication

## Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/anna-ai.git
cd anna-ai
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
- Copy `.env.example` to `.env`:
  ```bash
  cp .env.example .env
  ```
- Edit `.env` and add your Google Client ID:
  ```bash
  VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
  ```
  - Create a project in the [Google Cloud Console](https://console.cloud.google.com/)
  - Enable the Google OAuth2 API
  - Create credentials (OAuth 2.0 Client ID)
  - Set authorized JavaScript origins to include your development URLs
  - Add chrome-extension://YOUR_EXTENSION_ID as an authorized origin

4. Build the extension
```bash
npm run build
```

5. Load the extension in Chrome
- Open Chrome and go to `chrome://extensions/`
- Enable "Developer mode" in the top right
- Click "Load unpacked" in the top left
- Select the `dist` folder from your project
- Note your extension ID for Google OAuth configuration

## Development

### Available Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Preview production build
npm run preview
```

### Project Structure

```
anna-ai/
├── public/
│   ├── icons/              # Extension icons
│   ├── background.js       # Service worker
│   ├── content.js          # Content script
│   └── manifest.json       # Extension manifest
├── src/
│   ├── components/         # React components
│   ├── pages/             # Page components
│   ├── App.jsx            # Main application
│   └── index.jsx          # Entry point
├── scripts/
│   └── process-manifest.js # Build processing
└── package.json
```

### Key Features Implementation

1. **Authentication**
   - Google OAuth 2.0 integration
   - Secure token handling
   - Persistent user sessions

2. **Product Analysis**
   - Real-time Amazon product scraping
   - OpenAI-powered analysis
   - Price and feature comparison

3. **Chat Interface**
   - Natural language processing
   - Context-aware responses
   - Message history persistence

4. **Settings Management**
   - User-specific API keys
   - Customizable preferences
   - Secure storage

## Security

- Environment variables for sensitive data
- Content Security Policy implementation
- Secure message passing between components
- Local storage encryption for sensitive data
- Host permissions limited to Amazon domains
- No server-side storage of API keys

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request