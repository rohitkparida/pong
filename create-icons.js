// This is a simple script to create placeholder icons for the PWA
// You can run this with Node.js to generate the icons
// Or replace with actual icon files

const fs = require('fs');
const { createCanvas } = require('canvas');

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  
  // Border
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = size * 0.05;
  ctx.strokeRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8);
  
  // Paddle left
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(size * 0.2, size * 0.3, size * 0.05, size * 0.4);
  
  // Paddle right
  ctx.fillRect(size * 0.75, size * 0.3, size * 0.05, size * 0.4);
  
  // Ball
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, size * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = '#00ff00';
  ctx.fill();
  
  return canvas.toBuffer('image/png');
}

// Create 192x192 icon
const icon192 = createIcon(192);
fs.writeFileSync('icon.png', icon192);
console.log('Created icon.png (192x192)');

// Create 512x512 icon
const icon512 = createIcon(512);
fs.writeFileSync('icon-512.png', icon512);
console.log('Created icon-512.png (512x512)');

console.log('Icons created successfully!');
console.log('Note: If you don\'t have the canvas package installed, you\'ll need to create these icons manually.'); 