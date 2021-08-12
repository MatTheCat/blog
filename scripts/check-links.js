const fs = require("fs").promises;
const http = require("http");
const https = require("https");

fs.readdir("source", {withFileTypes: true}).then(pages => {
  pages.forEach(page => page.isDirectory() || checkPage(page.name));
});

function checkPage(page) {
  return fs.readFile(`source/${page}`, "utf8")
    .then(html => {
      Promise.all(Array.from(
        html.matchAll(/<a [^>]*href="((?=https?:)[^"]+)/g),
        ([, url]) => checkUrl(new URL(url)).then(bestUrl => [url, bestUrl.href]).catch(() => [url, null])
      )).then(results => {
        console.log(`\x1b[4m${page}\x1b[0m`)
        results.forEach(urls => {
          if (urls[0] === urls[1]) {
            return;
          }

          if (urls[1]) {
            console.log(`⚠️  ${urls[0]}\n ↳ ${urls[1]}`);
          } else {
            console.log(`❌ ${urls[0]}`);
          }
        });
      });
    })
  ;
}

function checkUrl(url) {
  const isHttp = "http:" === url.protocol;

  return new Promise((resolve, reject) => {
    (isHttp ? http : https).request(url, {headers: {"User-Agent": "URL checker"}, method: "HEAD"}, res => {
      const redirect = res.headers['location'];
      if (redirect) {
        checkUrl(new URL(redirect, url.origin))
          .then(url => resolve(url))
          .catch(reason => reject(`${url} redirection to ${redirect} failed: ${reason}`))
        ;
      } else if (200 !== res.statusCode) {
        reject(`${url} yielded a code ${res.statusCode}`);
      } else if (isHttp) {
        url.protocol = "https";
        checkUrl(url)
          .then(url => resolve(url))
          .catch(() => {
            url.protocol = "http";
            resolve(url);
          })
        ;
      } else {
        resolve(url);
      }
    }).on("error", err => reject(err)).end();
  });
}
