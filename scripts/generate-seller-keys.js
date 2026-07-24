// Generates seller invite keys and inserts them into the database.
// Usage: node scripts/generate-seller-keys.js [count]
// Defaults to 10 keys. Run this from the project root (needs ../db.js).

const crypto = require('crypto');
const path = require('path');
const { insertInviteKey } = require(path.join(__dirname, '..', 'db'));

const count = Number(process.argv[2]) || 10;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

function generateKey() {
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let group = '';
    for (let i = 0; i < 4; i++) {
      group += ALPHABET[crypto.randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

const keys = [];
for (let i = 0; i < count; i++) {
  const key = generateKey();
  insertInviteKey.run(key);
  keys.push(key);
}

console.log(`Generated ${count} seller invite key(s):\n`);
keys.forEach((k) => console.log(k));
