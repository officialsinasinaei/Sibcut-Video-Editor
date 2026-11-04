'use strict';

const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    console.error('❌ FAIL:', message);
    process.exitCode = 1;
  } else {
    console.log('✅ PASS:', message);
  }
}

console.log('=== 1. Checking package.json Metadata ===');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
assert(pkg.build.productName === 'Sibcut Video Editor', `productName is 'Sibcut Video Editor' (actual: ${pkg.build.productName})`);
assert(pkg.description.includes('Sibcut Video Editor:'), 'description mentions Sibcut Video Editor');
assert(pkg.author.includes('Sina Sinaei'), `author includes 'Sina Sinaei' (actual: ${pkg.author})`);
assert(pkg.build.copyright.includes('Sina Sinaei'), 'copyright acknowledges Sina Sinaei');
assert((pkg.build.portable && pkg.build.portable.artifactName === 'Sibcut-Video-Editor-Portable.exe') || pkg.build.win.artifactName === 'Sibcut-Video-Editor-Portable.exe', `artifactName for Portable is 'Sibcut-Video-Editor-Portable.exe'`);

console.log('\n=== 2. Checking src/lib/version.js ===');
const versionFile = path.join(__dirname, '..', 'src', 'lib', 'version.js');
assert(fs.existsSync(versionFile), 'src/lib/version.js exists');
const versionContent = fs.readFileSync(versionFile, 'utf8');
assert(versionContent.includes("APP_NAME = 'Sibcut Video Editor'"), 'APP_NAME is Sibcut Video Editor');
assert(versionContent.includes("CREATOR_NAME = 'Sina Sinaei'"), 'CREATOR_NAME is Sina Sinaei');
assert(versionContent.includes("CREATOR_EMAIL = 'sina9100t@gmail.com'"), 'CREATOR_EMAIL is sina9100t@gmail.com');
assert(versionContent.includes("ORIGINAL_PROJECT_NAME = 'Everything'"), 'ORIGINAL_PROJECT_NAME is Everything');
assert(versionContent.includes("ORIGINAL_PROJECT_AUTHOR = 'HeyPuter'"), 'ORIGINAL_PROJECT_AUTHOR is HeyPuter');

console.log('\n=== 3. Checking About Dialog Implementation ===');
const aboutFile = path.join(__dirname, '..', 'src', 'ui', 'about-dialog.js');
assert(fs.existsSync(aboutFile), 'src/ui/about-dialog.js exists');
const aboutContent = fs.readFileSync(aboutFile, 'utf8');
assert(aboutContent.includes('openAboutDialog'), 'Exports openAboutDialog');
assert(aboutContent.includes('openLicensesDialog'), 'Exports openLicensesDialog');
assert(aboutContent.includes('mailto:'), 'Contains mailto link for creator email');
assert(aboutContent.includes('github.com/HeyPuter/everything'), 'Contains external link to original Everything repository');

console.log('\n=== 4. Checking OPEN-SOURCE-NOTICES.md ===');
const noticesFile = path.join(__dirname, '..', 'OPEN-SOURCE-NOTICES.md');
assert(fs.existsSync(noticesFile), 'OPEN-SOURCE-NOTICES.md exists');
const noticesContent = fs.readFileSync(noticesFile, 'utf8');
assert(noticesContent.includes('HeyPuter'), 'Acknowledges HeyPuter');
assert(noticesContent.includes('Everything'), 'Acknowledges Everything project');
assert(noticesContent.includes('Permission is hereby granted, free of charge'), 'Includes MIT License text');
assert(noticesContent.includes('Sina Sinaei'), 'Acknowledges Sina Sinaei as creator');

console.log('\n=== 5. Checking Window Titles and HTML ===');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(indexHtml.includes('<title>Sibcut Video Editor</title>'), 'index.html title is Sibcut Video Editor');

const electronMain = fs.readFileSync(path.join(__dirname, '..', 'electron-main.cjs'), 'utf8');
assert(electronMain.includes("title:     'Sibcut Video Editor'"), 'electron-main.cjs window title is Sibcut Video Editor');
assert(electronMain.includes("About Sibcut Video Editor"), 'electron-main.cjs Help menu has About Sibcut Video Editor');
assert(electronMain.includes("mailto:"), 'electron-main.cjs safe window handler permits mailto: URLs');

console.log('\n=== 6. Checking UI Components ===');
const topbar = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'topbar.js'), 'utf8');
assert(topbar.includes('About Sibcut Video Editor'), 'topbar menu includes About Sibcut Video Editor');

const home = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'home.js'), 'utf8');
assert(home.includes("'Sibcut Video Editor'"), 'home.js brand name is Sibcut Video Editor');

const editor = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'editor.js'), 'utf8');
assert(editor.includes('Sibcut Video Editor'), 'editor.js title uses Sibcut Video Editor');
assert(editor.includes('openAboutDialog()'), 'editor.js openAbout calls openAboutDialog()');

console.log('\n=== Summary ===');
if (!process.exitCode) {
  console.log('🎉 ALL REBRAND AND ATTRIBUTION CHECKS PASSED!');
} else {
  console.error('⚠️ SOME REBRAND CHECKS FAILED.');
}
