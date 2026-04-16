#!/usr/bin/env node
/**
 * build.js — generates bookmarklet.min.js from src/exporter.js
 * Run: node build.js
 */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'src/exporter.js'), 'utf8');

// Simple minification: strip comments, collapse whitespace
function minify(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/\/\/[^\n]*/g, '')          // line comments
    .replace(/\n+/g, ' ')               // newlines
    .replace(/\s{2,}/g, ' ')            // extra spaces
    .replace(/;\s*/g, ';')
    .replace(/{\s*/g, '{')
    .replace(/}\s*/g, '}')
    .replace(/,\s*/g, ',')
    .replace(/\(\s*/g, '(')
    .replace(/\)\s*/g, ')')
    .trim();
}

// Wrap as bookmarklet
const minified = minify(src);
const bookmarklet = `javascript:(function(){${minified}})();`;

// Write outputs
fs.writeFileSync('bookmarklet.min.js', bookmarklet);
fs.writeFileSync('bookmarklet.txt', bookmarklet); // plain text for README copy-paste

console.log(`✅ Built bookmarklet (${(bookmarklet.length / 1024).toFixed(1)} KB)`);
console.log(`   → bookmarklet.min.js`);
console.log(`   → bookmarklet.txt`);
console.log('');
console.log('To install: create a new bookmark in your browser');
console.log('and paste the contents of bookmarklet.txt as the URL.');
