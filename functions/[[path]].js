import { createPagesFunctionHandler } from '@remix-run/cloudflare-pages';
import * as build from '../build/server/index.js';

export const onRequest = createPagesFunctionHandler({
  build,
  mode: process.env.NODE_ENV
});


