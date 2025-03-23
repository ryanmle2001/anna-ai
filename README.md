# Introducing ANNA: Amazon’s Next-Gen Navigational Assistant

ANNA AI is a Chrome extension that enhances your Amazon shopping experience with AI-powered assistance. Using OpenAI's technology, Anna helps you make informed purchasing decisions by analyzing products, comparing options, and providing personalized recommendations.

Demo: https://youtu.be/9oKtnL56xy8
## Features

- 🤖 AI-powered Amazon shopping assistant
- 💬 Natural conversation interface
- 🎯 Personalized product recommendations
- 🔐 Secure Google authentication
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
- Google Identity API
- OpenAI API

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
