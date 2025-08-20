// Environment configuration for Next.js
// Copy this to .env.local and fill in your actual values

export const envConfig = {
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || '',
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
};

// Example .env.local content:
/*
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id_here
OPENAI_API_KEY=your_openai_api_key_here
*/
