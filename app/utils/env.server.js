// Centralized environment loader for server-side code
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

export function loadServerEnv() {
  // For Cloudflare Pages/Workers, Remix provides context.cloudflare.env in loaders/actions
  // For Node dev/prod, we can hydrate process.env via dotenv
  if (typeof process !== 'undefined' && process.env) {
    // Only attempt dotenv when running on Node
    try {
      // Priority: .env.local > .env.production (when NODE_ENV=production) > .env
      //check if .env.local exists
      //check where i
      const currentDir = process.cwd();
      console.log(currentDir);
      if (fs.existsSync(path.join(currentDir, '.env.local'))) {
        console.log('Loading .env.local');
        dotenv.config({ path: path.join(currentDir, '.env.local') });
      }
      if (fs.existsSync(path.join(currentDir, '.env.production'))) {
        console.log('Loading .env.production');
        dotenv.config({ path: path.join(currentDir, '.env.production') });
      }
      if (fs.existsSync(path.join(currentDir, '.env'))) {
        console.log('Loading .env');
        dotenv.config({ path: path.join(currentDir, '.env') });
      }
    } catch (error) {
      console.error(error);
      // noop if not available
    }
  }
}


