#!/usr/bin/env node

// Single source of truth for the project version: the root VERSION file.
//
// Usage:
//   node scripts/sync-version.js              Sync client/admin-client/server to match VERSION
//   node scripts/sync-version.js 0.2.0        Set VERSION to 0.2.0 and sync everything
//   node scripts/sync-version.js --check      Exit non-zero if anything is out of sync (CI)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'VERSION');

const CLIENT_PKG = path.join(ROOT, 'client', 'package.json');
const ADMIN_PKG = path.join(ROOT, 'admin-client', 'package.json');
const SERVER_CSPROJ = path.join(ROOT, 'server', 'GhostList.WebApi', 'GhostList.WebApi.csproj');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const explicitVersion = args.find((a) => !a.startsWith('--'));

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function readVersionFile() {
    return fs.readFileSync(VERSION_FILE, 'utf8').trim();
}

let version = explicitVersion ?? readVersionFile();

if (!SEMVER.test(version)) {
    console.error(`Invalid version "${version}" (expected semver, e.g. 1.2.3)`);
    process.exit(1);
}

let dirty = false;

function syncJsonVersion(file) {
    const text = fs.readFileSync(file, 'utf8');
    const updated = text.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`);
    if (updated === text) return false;
    if (!checkOnly) fs.writeFileSync(file, updated);
    return true;
}

function syncCsprojVersion(file) {
    const text = fs.readFileSync(file, 'utf8');
    let updated;
    if (/<Version>[^<]*<\/Version>/.test(text)) {
        updated = text.replace(/<Version>[^<]*<\/Version>/, `<Version>${version}</Version>`);
    } else {
        // Insert right after the opening <PropertyGroup> tag.
        updated = text.replace(/(<PropertyGroup>)/, `$1\n    <Version>${version}</Version>`);
    }
    if (updated === text) return false;
    if (!checkOnly) fs.writeFileSync(file, updated);
    return true;
}

// If an explicit version was passed, write it to VERSION first.
if (explicitVersion) {
    const current = fs.existsSync(VERSION_FILE) ? readVersionFile() : '';
    if (current !== version) {
        dirty = true;
        if (!checkOnly) fs.writeFileSync(VERSION_FILE, `${version}\n`);
    }
}

const changedFiles = [];
for (const [label, file, syncFn] of [
    ['client/package.json', CLIENT_PKG, syncJsonVersion],
    ['admin-client/package.json', ADMIN_PKG, syncJsonVersion],
    ['server/GhostList.WebApi/GhostList.WebApi.csproj', SERVER_CSPROJ, syncCsprojVersion],
]) {
    const changed = syncFn(file);
    if (changed) {
        changedFiles.push(label);
        dirty = true;
    }
}

if (checkOnly) {
    if (dirty) {
        console.error(`Version mismatch with VERSION (${version}). Out of sync: ${changedFiles.join(', ') || 'VERSION file'}`);
        console.error('Run "node scripts/sync-version.js" to fix.');
        process.exit(1);
    }
    console.log(`All versions match VERSION (${version}).`);
    process.exit(0);
}

if (!dirty) {
    console.log(`Already in sync at ${version}.`);
    process.exit(0);
}

console.log(`Synced version ${version} to: VERSION, ${changedFiles.join(', ')}`);

// Refresh the generated version.ts files so a local dev server picks up the change immediately.
for (const dir of ['client', 'admin-client']) {
    const generator = path.join(ROOT, dir, 'scripts', 'generate-version.js');
    if (fs.existsSync(generator)) {
        require(generator);
    }
}
