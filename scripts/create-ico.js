const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, '../assets/icon.png');
const squarePngPath = path.join(__dirname, '../assets/icon-square.png');

console.log('=== AI Markdown Editor Icon Setup ===');
console.log('');

try {
  if (fs.existsSync(pngPath)) {
    const stats = fs.statSync(pngPath);
    console.log(`✓ Original icon found: ${pngPath}`);
    console.log(`  Size: ${Math.round(stats.size / 1024)} KB`);
    console.log(`  Dimensions: 716 x 729 (non-square)`);
    console.log('');
    
    console.log('📋 To fix the icon issue, you need to:');
    console.log('');
    console.log('1. Create a square version of the icon:');
    console.log('   - Resize to 512x512 or 256x256 pixels');
    console.log('   - Save as PNG format');
    console.log('   - Ensure it\'s perfectly square');
    console.log('');
    console.log('2. Online tools you can use:');
    console.log('   • https://www.iloveimg.com/resize-image');
    console.log('   • https://www.canva.com/');
    console.log('   • https://photopea.com/ (free Photoshop alternative)');
    console.log('');
    console.log('3. For Windows installer (.ico format):');
    console.log('   • https://convertio.co/png-ico/');
    console.log('   • Upload the square PNG and convert to ICO');
    console.log('   • Save as assets/icon.ico');
    console.log('');
    console.log('4. Update package.json after creating .ico:');
    console.log('   "icon": "assets/icon.ico" (instead of .png)');
    console.log('');
    
    // Check if square version exists
    if (fs.existsSync(squarePngPath)) {
      console.log(`✓ Square version found: ${squarePngPath}`);
    } else {
      console.log(`⚠ Square version not found. Please create: ${squarePngPath}`);
    }
    
  } else {
    console.log('❌ PNG file not found at:', pngPath);
  }
} catch (error) {
  console.error('❌ Error:', error.message);
}