const fs = require('fs');
const path = require('path');
const {compileAsset, compilePage, manifest, yieldFiles} = require('../compile');

const compileTimeouts = new Map();

fs.watch('source', (eventType, file) => {
  if (file.endsWith('~')) return;

  scheduleCompilation(file, () => handlePageChange(file));
});

fs.watch('source/assets', (eventType, file) => {
  if (file.endsWith('~')) return;

  const asset = `assets/${file}`;
  scheduleCompilation(asset, () => handleAssetChange(asset));
});

fs.readdirSync('source/assets', {withFileTypes: true}).forEach(dirent => {
  if (!dirent.isDirectory()) {
    return;
  }

  fs.watch(`source/assets/${dirent.name}`, (eventType, file) => {
    if (file.endsWith('~')) return;

    const asset = `assets/${dirent.name}/${file}`;
    scheduleCompilation(asset, () => handleAssetChange(asset));
  });
});

function scheduleCompilation(file, callback) {
  clearTimeout(compileTimeouts.get(file));
  compileTimeouts.set(file, setTimeout(callback, 1000));
}

async function handlePageChange(page) {
  const fullPath = `source/${page}`;

  if (fs.existsSync(fullPath)) {
    return compilePage(fullPath);
  }

  fs.promises.unlink(`public/${page}`);
}

async function handleAssetChange(asset) {
  const fullPath = `source/${asset}`;

  const [oldPath, assetExists] = await Promise.all([
    manifest.get(asset),
    fs.promises.access(fullPath).then(() => true).catch(() => false),
  ]);

  if (oldPath) {
    fs.promises.unlink(`public/${oldPath}`);
  }

  if (!assetExists) {
    manifest.delete(asset);

    return;
  }

  const newPath = await compileAsset(fullPath);
  if (!oldPath || oldPath === newPath) {
    return;
  }

  const replacements = [];
  for await (const page of yieldFiles('public', false)) {
    replacements.push(replaceInFile(page, oldPath, newPath));
  }

  return Promise.all(replacements);
}

async function replaceInFile(file, substr, newSubstr) {
  const content = await fs.promises.readFile(file, 'utf8');

  return fs.promises.writeFile(file, content.replace(substr, newSubstr));
}
