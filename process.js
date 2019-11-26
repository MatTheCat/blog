const crypto = require("crypto");
const cssnano = require("cssnano");
const fs = require("fs");
const { JSDOM } = require("jsdom");
const mathjax = require("mathjax-node");
const path = require("path");
const postcss = require("postcss");
const Prism = require("prismjs");

require("prismjs/components/index")(["http", "php-extras"]);

Promise.all([
  listFiles("source"),
  listFiles("source/assets", true),
  fs.promises.mkdir("public/assets", { recursive: true }),
]).then(([htmlFiles, assets]) => {
  fs.promises.writeFile("public/.nojekyll", "");
  fs.promises.writeFile("public/CNAME", "www.matthecat.com");
  fs.promises.copyFile("source/assets/favicon.ico", "public/favicon.ico");

  const promises = {};

  htmlFiles.forEach(file => {
    promises[file] = [transformPost(file), `public/${path.basename(file)}`];
  });

  assets.forEach(asset => {
    if ("source/assets/favicon.ico" === asset) {
      return;
    }

    const dirname = path.dirname(asset);
    const basedir = path.basename(dirname);
    const global = "assets" === basedir;

    const destFolder = `public/${path.relative("source", dirname)}`;
    const data = transformAsset(asset);

    const dest = data.then(data => {
      const hash = crypto.createHash("md5");
      hash.update(data);

      return `${destFolder}/${hash.digest("hex")}${path.extname(asset)}`;
    });

    if (!global && !fs.existsSync(destFolder)) {
      fs.mkdirSync(destFolder);
    }

    promises[asset] = [data, dest];

    const dependents = global ? htmlFiles : [`source/${basedir}.html`];
    dependents.forEach(dependent => {
      promises[dependent][0] = Promise.all([
        promises[dependent][0],
        promises[asset][1]
      ]).then(([data, dest]) => data.replace(path.relative("source", asset), path.relative("public", dest)));
    });
  });

  Object.values(promises).forEach(filePromises => {
    Promise.all(filePromises).then(([data, file]) => fs.promises.writeFile(file, data));
  });
});

function listFiles(dir, recursive = false) {
  return fs.promises.readdir(dir, {withFileTypes: true}).then(dirents => {
    if (!recursive) {
      return dirents.filter(dirent => dirent.isFile()).map(dirent => `${dir}/${dirent.name}`);
    }

    return Promise.all(dirents.map(dirent => {
      const filePath = `${dir}/${dirent.name}`;

      return dirent.isDirectory() ? listFiles(filePath, true) : filePath;
    })).then(files => files.flat());
  });
}

function getManifest() {
  return fs.promises.readFile("manifest.json", "utf8")
  .catch(() => '{}')
  .then(json => JSON.parse(json));
}

function transformPost(post) {
  return fs.promises.readFile(post, "utf8").then(html => {
    let dom = new JSDOM(html);
    let document = dom.window.document;

    return Promise.all([
      rewriteMath(document),
      rewriteTitles(document),
      Prism.highlightAllUnder(document.body),
      sizeSvg(document),
    ]).then(() => {
      const html = dom.serialize();
      dom.window.close();

      return html;
    });
  });
}

function sizeSvg(document) {
  document.querySelectorAll(".svg_sizer svg").forEach((svg) => {
    svg.setAttribute("preserveAspectRatio", "xMidYMax slice");
    const [x, y, width, height] = svg.getAttribute("viewBox").split(" ");
    svg.setAttribute("style", `padding-top: calc(${100*(height - y)/(width - x)}% - 1px)`);
  });
}

function rewriteTitles(document) {
  document.querySelectorAll("h2, h3").forEach((title) => {
    title.id = encodeURIComponent(title.textContent.replace(/\s+/g, "_"));
  });
}

function transformAsset(source) {
  switch (path.extname(source)) {
    case ".css":
      return fs.promises.readFile(source, 'utf8')
        .then(css => postcss([cssnano]).process(css, {from: source}))
        .then(result => Buffer.from(result.css, 'utf8'))
      ;
  }

  return fs.promises.readFile(source);
}

function rewriteMath(document) {
  let state = {};
  let mathNodes = document.querySelectorAll('.math');

  if (!mathNodes.length) {
    return;
  }

  return Promise.all(Array.from(mathNodes).map((mathNode) => {
    return new Promise((resolve) => {
      mathjax.typeset({
        format: 'AsciiMath',
        math: mathNode.innerHTML,
        state: state,
        svg: true,
        useFontCache: true,
        useGlobalCache: true,
      }, (data) => {
        mathNode.innerHTML = data.svg;
        const svg = mathNode.querySelector('svg');
        svg.removeAttribute('xmlns');
        svg.removeAttribute('xmlns:xlink');
        resolve();
      })
    })
  })).then(() => {
    if (state.defs) {
      let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute("display", "none");
      svg.innerHTML = state.defs.outerHTML;
      document.body.prepend(svg);
    }
  })
}
