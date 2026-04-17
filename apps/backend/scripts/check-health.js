require('dotenv').config();

async function main() {
  await new Promise(r => setTimeout(r, 5000));
  try {
    const res = await fetch('http://localhost:3000/health');
    console.log('Server:', (await res.json()).status);
  } catch(e) {
    console.log('Error:', e.message);
  }
}
main();