// Debug script to test Cloudflare Browser Rendering scrape endpoint
// Run with: npx tsx src/debug-cloudflare.ts

import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import axios from 'axios';

const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
  resolve(process.cwd(), '..', '.env'),
];
const envPath = candidates.find((p) => existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
}

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function testScrape() {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/scrape`;
  
  const url = 'https://www.petfinder.com/search/dogs-for-adoption/us/tx/austin/';
  
  console.log('[DEBUG] Testing scrape endpoint...');
  console.log('[DEBUG] URL:', url);
  
  // Test 1: Scrape basic elements
  const response = await axios.post(
    endpoint,
    {
      url,
      elements: [
        { selector: 'h1' },
        { selector: 'h2' },
        { selector: 'h3' },
        { selector: 'a' },
        { selector: '[class*="pet"]' },
        { selector: '[class*="dog"]' },
        { selector: '[class*="card"]' },
        { selector: '[class*="result"]' },
      ],
      gotoOptions: {
        waitUntil: 'networkidle2',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 90000,
    }
  );

  console.log('[DEBUG] Scrape response:');
  console.log(JSON.stringify(response.data, null, 2));
}

async function testJson() {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/json`;
  
  const url = 'https://www.petfinder.com/search/dogs-for-adoption/us/tx/austin/';
  
  console.log('\n[DEBUG] Testing json endpoint with simpler prompt...');
  
  const response = await axios.post(
    endpoint,
    {
      url,
      prompt: 'What animals are shown on this page? List all the animal names you can see.',
    },
    {
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 90000,
    }
  );

  console.log('[DEBUG] JSON response:');
  console.log(JSON.stringify(response.data, null, 2));
}

async function testMarkdown() {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/markdown`;
  
  const url = 'https://www.petfinder.com/search/dogs-for-adoption/us/tx/austin/';
  
  console.log('\n[DEBUG] Testing markdown endpoint...');
  
  const response = await axios.post(
    endpoint,
    {
      url,
      gotoOptions: {
        waitUntil: 'networkidle2',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 90000,
    }
  );

  console.log('[DEBUG] Markdown response (truncated):');
  const markdown = response.data?.result || '';
  console.log(markdown.substring(0, 3000));
  console.log('...');
  console.log('[Total length:', markdown.length, 'chars]');
}

async function main() {
  try {
    await testScrape();
  } catch (err: unknown) {
    console.error('[DEBUG] Scrape failed:', err);
  }

  try {
    await testJson();
  } catch (err: unknown) {
    console.error('[DEBUG] JSON failed:', err);
  }

  try {
    await testMarkdown();
  } catch (err: unknown) {
    console.error('[DEBUG] Markdown failed:', err);
  }
}

main().catch(console.error);