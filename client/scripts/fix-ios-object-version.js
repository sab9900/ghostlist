const fs = require('fs');
const path = require('path');

const pbxprojPath = path.join(__dirname, '..', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');

const SAFE_OBJECT_VERSION = '77';

if (!fs.existsSync(pbxprojPath)) {
    console.log('[fix-ios-object-version] No project.pbxproj found, skipping.');
    process.exit(0);
}

const contents = fs.readFileSync(pbxprojPath, 'utf8');
const match = contents.match(/objectVersion = (\d+);/);

if (!match) {
    console.log('[fix-ios-object-version] No objectVersion found, skipping.');
    process.exit(0);
}

if (match[1] === SAFE_OBJECT_VERSION) {
    console.log(`[fix-ios-object-version] objectVersion already ${SAFE_OBJECT_VERSION}, nothing to do.`);
    process.exit(0);
}

const updated = contents.replace(/objectVersion = \d+;/, `objectVersion = ${SAFE_OBJECT_VERSION};`);
fs.writeFileSync(pbxprojPath, updated);
console.log(`[fix-ios-object-version] objectVersion ${match[1]} -> ${SAFE_OBJECT_VERSION}`);
