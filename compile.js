const crypto = require('crypto');
const cssnano = require('cssnano');
const {promises: fs} = require('fs');
const {JSDOM} = require('jsdom');
const mathjax = require('mathjax-node');
const path = require('path');
const postcss = require('postcss');
const Prism = require('prismjs');

require('prismjs/components/index')(
    ['http', 'makefile', 'php-extras', 'shell-session']);

async function* yieldFiles(root, recursive) {
  const dirents = await fs.readdir(root, {withFileTypes: true});
  for (const dirent of dirents) {
    if (dirent.isFile()) {
      yield `${root}/${dirent.name}`;
    } else if (recursive) {
      yield* yieldFiles(`${root}/${dirent.name}`, true);
    }
  }
}

async function processAsset(asset) {
  switch (path.extname(asset)) {
    case '.css':
      return fs.readFile(asset, 'utf8').
          then(css => postcss([cssnano]).process(css, {from: asset})).
          then(result => Buffer.from(result.css, 'utf8'))
          ;
    default:
      return fs.readFile(asset);
  }
}

function md5(string) {
  const hash = crypto.createHash('md5');
  hash.update(string);

  return hash.digest('hex');
}

const manifest = new Map();

async function compileAsset(asset) {
  const relativePath = asset.slice(7);
  const relativeDirectory = path.dirname(relativePath);

  const promise = processAsset(asset).then(content => {
    const compiledAssetPath = `${relativeDirectory}/${md5(
        content)}${path.extname(relativePath)}`;

    fs.mkdir(`public/${relativeDirectory}`, {recursive: true}).
        then(() => fs.writeFile(`public/${compiledAssetPath}`, content))
    ;

    return compiledAssetPath;
  });

  manifest.set(relativePath, promise);

  return promise;
}

async function compilePage(page) {
  return fs.readFile(page, 'utf8').then(html => {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    return Promise.all([
      rewriteMath(document),
      anchorHeadings(document),
      Prism.highlightAllUnder(document.body),
      sizeSvg(document),
      processAssets(document),
    ]).then(() => {
      const html = dom.serialize();
      dom.window.close();

      return html;
    });
  }).then(html => fs.writeFile(`public/${path.basename(page)}`, html))
      ;
}

async function processAssets(document) {
  return Promise.all(Array.from(
      document.querySelectorAll('[href^=\'assets/\'], [src^=\'assets/\']'), tag => {
        const attribute = tag.hasAttribute('href') ? 'href' : 'src';

        return manifest.get(tag.getAttribute(attribute)).
            then(path => tag.setAttribute(attribute, path));
      }));
}

function sizeSvg(document) {
  document.querySelectorAll('.svg_sizer svg').forEach(svg => {
    svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
    const [x, y, width, height] = svg.getAttribute('viewBox').split(' ');
    svg.setAttribute('style',
        `padding-top: calc(${100 * (height - y) / (width - x)}% - 1px)`);
  });
}

function anchorHeadings(document) {
  document.querySelectorAll('h2, h3').forEach(heading => {
    heading.id = encodeURIComponent(heading.textContent.replace(/\s+/g, '_'));
  });
}

async function rewriteMath(document) {
  const mathNodes = document.querySelectorAll('.math');
  if (!mathNodes.length) {
    return;
  }

  const state = {};

  return Promise.all(Array.from(mathNodes, mathNode => {
    return new Promise(resolve => {
      mathjax.typeset({
        format: 'AsciiMath',
        math: mathNode.innerHTML,
        state: state,
        svg: true,
        useFontCache: true,
        useGlobalCache: true,
      }, data => {
        mathNode.innerHTML = data.svg;
        const svg = mathNode.querySelector('svg');
        svg.removeAttribute('xmlns');
        svg.removeAttribute('xmlns:xlink');
        resolve();
      });
    });
  })).then(() => {
    if (!state.defs) {
      return;
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('display', 'none');
    svg.innerHTML = state.defs.outerHTML;
    document.body.prepend(svg);
  });
}

(async () => {
  for await (const asset of yieldFiles('source/assets', true)) {
    compileAsset(asset);
  }

  for await (const page of yieldFiles('source', false)) {
    compilePage(page);
  }
})();

module.exports = {compileAsset, compilePage, manifest, yieldFiles};
