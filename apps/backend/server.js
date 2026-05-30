// Passenger-compatible entry point for Hostinger shared hosting.
// Loads tsx ESM loader then dynamically imports the TypeScript entry point.
require('tsx');
import('./src/index.ts');
