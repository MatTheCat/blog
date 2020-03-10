const crypto = require("crypto");
const cssnano = require("cssnano");
const fs = require("fs").promises;
const {JSDOM} = require("jsdom");
const mathjax = require("mathjax-node");
const path = require("path");
const postcss = require("postcss");
const Prism = require("prismjs");

require("prismjs/components/index")(["http", "php-extras"]);

Promise.all([
    fs.readdir("source", {withFileTypes: true}),
    fs.mkdir("public/assets", {recursive: true}),
]).then(([pages]) => {
    fs.writeFile("public/.nojekyll", "");
    fs.writeFile("public/CNAME", "www.matthecat.com");
    fs.copyFile("source/assets/favicon.ico", "public/favicon.ico");

    pages.forEach(page =>  page.isDirectory() || compile(page.name));
});

function compile(page) {
    return fs.readFile(`source/${page}`, "utf8")
        .then(html => {
            let dom = new JSDOM(html);
            let document = dom.window.document;

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
        })
        .then(html => fs.writeFile(`public/${page}`, html))
    ;
}

const assetsProcessing = new Map();

function processAssets(document) {
    return Promise.all(Array.from(document.querySelectorAll("[href^='assets/'], [src^='assets/']"), tag => {
        const attribute = tag.hasAttribute("href") ? "href" : "src";
        const asset = tag.getAttribute(attribute);
        const promise = assetsProcessing.get(asset) || transformAsset(`source/${asset}`).then(content => {
            const hash = crypto.createHash("md5");
            hash.update(content);

            const dirName = path.dirname(asset);
            const filePath = `${dirName}/${hash.digest("hex")}${path.extname(asset)}`;

            fs.mkdir(`public/${dirName}`)
                .catch(() => {})
                .finally(() => fs.writeFile(`public/${filePath}`, content))
            ;

            return filePath;
        });

        assetsProcessing.set(asset, promise);

        return promise.then(value => tag.setAttribute(attribute, value));
    }));
}

function sizeSvg(document) {
    document.querySelectorAll(".svg_sizer svg").forEach(svg => {
        svg.setAttribute("preserveAspectRatio", "xMidYMax slice");
        const [x, y, width, height] = svg.getAttribute("viewBox").split(" ");
        svg.setAttribute("style", `padding-top: calc(${100 * (height - y) / (width - x)}% - 1px)`);
    });
}

function anchorHeadings(document) {
    document.querySelectorAll("h2, h3").forEach((title) => {
        title.id = encodeURIComponent(title.textContent.replace(/\s+/g, "_"));
    });
}

function transformAsset(asset) {
    switch (path.extname(asset)) {
        case ".css":
            return fs.readFile(asset, "utf8")
                .then(css => postcss([cssnano]).process(css, {from: asset}))
                .then(result => Buffer.from(result.css, "utf8"))
                ;
    }

    return fs.readFile(asset);
}

function rewriteMath(document) {
    let state = {};
    let mathNodes = document.querySelectorAll(".math");

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
                const svg = mathNode.querySelector("svg");
                svg.removeAttribute("xmlns");
                svg.removeAttribute("xmlns:xlink");
                resolve();
            })
        })
    })).then(() => {
        if (state.defs) {
            let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("display", "none");
            svg.innerHTML = state.defs.outerHTML;
            document.body.prepend(svg);
        }
    });
}

module.exports = compile;
