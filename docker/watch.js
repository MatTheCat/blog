const fs = require("fs");
const compile = require("../compile");

const compileTimeouts = new Map();

fs.watch('source', (eventType, page) => {
    if (page.endsWith('~')) {
        return;
    }

    if ("rename" === eventType && !fs.existsSync(`source/${page}`)) {
        return fs.promises.unlink(`public/${page}`);
    }

    clearTimeout(compileTimeouts.get(page));
    compileTimeouts.set(page, setTimeout(() => compile(page), 1000));
});