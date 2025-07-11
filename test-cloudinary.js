const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Test Cloudinary configuration
console.log('Testing Cloudinary configuration...\n');

// Check environment variables
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

console.log('Environment variables:');
console.log('- CLOUDINARY_CLOUD_NAME:', cloudName ? '✓ Set' : '✗ Missing');
console.log('- CLOUDINARY_API_KEY:', apiKey ? '✓ Set' : '✗ Missing');
console.log('- CLOUDINARY_API_SECRET:', apiSecret ? '✓ Set' : '✗ Missing\n');

if (!cloudName || !apiKey || !apiSecret) {
  console.log('❌ Cloudinary configuration incomplete. Please set all required environment variables.');
  process.exit(1);
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret
});

// Test connection by getting account info
cloudinary.api.ping()
  .then(result => {
    console.log('✅ Cloudinary connection successful!');
    console.log('Account info:', result);
  })
  .catch(error => {
    console.log('❌ Cloudinary connection failed:');
    console.error(error);
    process.exit(1);
  }); 