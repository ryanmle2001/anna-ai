import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Initialize dotenv
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the manifest template
const manifestPath = path.resolve(__dirname, '../public/manifest.json');
const outputPath = path.resolve(__dirname, '../dist/manifest.json');

// Read the manifest file
let manifest = fs.readFileSync(manifestPath, 'utf8');

// Replace environment variables
manifest = manifest.replace('${VITE_GOOGLE_CLIENT_ID}', process.env.VITE_GOOGLE_CLIENT_ID);

// Create dist directory if it doesn't exist
if (!fs.existsSync(path.dirname(outputPath))) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}

// Write the processed manifest
fs.writeFileSync(outputPath, manifest);

// Copy other necessary files
const filesToCopy = ['content.js', 'background.js'];
filesToCopy.forEach(file => {
  fs.copyFileSync(
    path.resolve(__dirname, '../public', file),
    path.resolve(__dirname, '../dist', file)
  );
});

// Copy icons
const iconsSrcDir = path.resolve(__dirname, '../public/icons');
const iconsDestDir = path.resolve(__dirname, '../dist/icons');

if (!fs.existsSync(iconsDestDir)) {
  fs.mkdirSync(iconsDestDir, { recursive: true });
}

fs.readdirSync(iconsSrcDir).forEach(file => {
  fs.copyFileSync(
    path.resolve(iconsSrcDir, file),
    path.resolve(iconsDestDir, file)
  );
});