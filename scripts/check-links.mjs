import { readdir, readFile } from "fs/promises"

const reports = [];

for (const file of await readdir("source", {withFileTypes: true})) {
    if (file.isDirectory()) {
        continue;
    }

    reports.push(new Promise(async (resolve) => {
        const report = {
            page: file.name,
            redirections: new Map(),
            errors: new Map(),
        }

        for await (const uri of yieldUrls(file.name)) {
            try {
                const redirection = await getRedirection(uri);

                if (redirection) {
                    report.redirections.set(uri, redirection)

                    process.stdout.write('\x1b[1m\x1b[33mR\x1b[0m️')
                } else {
                    process.stdout.write('.')
                }
            } catch (e) {
                report.errors.set(uri, e)

                process.stdout.write('\x1b[1m\x1b[31mE\x1b[0m️')
            }
        }

        resolve(report)
    }));
}

Promise.all(reports)
    .then(reports => {
        console.log()

        let redirectionCount = 0, errorCount = 0
        for (const report of reports) {
            redirectionCount += report.redirections.size
            errorCount += report.errors.size
        }

        if (!errorCount && !redirectionCount) {
            console.log('\x1b[42m%d No issue found\x1b[0m')
        }
        if (errorCount) {
            console.log('\x1b[41m%d error%s\x1b[0m', errorCount, errorCount > 1 ? 's' : '')
        }
        if (redirectionCount) {
            console.log('\x1b[43m%d redirection%s\x1b[0m', redirectionCount, redirectionCount > 1 ? 's' : '')
        }

        console.log()

        for (const report of reports) {
            if (!report.errors.size && !report.redirections.size) {
                continue
            }

            console.group(`\x1b[4m${report.page}\x1b[0m`)
            for (const [href, error] of report.errors) {
                console.log('\x1b[31m●\x1b[0m %s (%s)', error, href)
            }
            for (const [src, dest] of report.redirections) {
                console.log('\x1b[33m●\x1b[0m %s redirects to %s', src, dest)
            }
            console.groupEnd()
            console.log()
        }
    })
    .then(() => process.exit())

async function* yieldUrls(page) {
    for (const [, href] of (await readFile(`source/${page}`, "utf8")).matchAll(/<a [^>]*href="((?=https?:)[^"]+)/g)) {
        yield href;
    }
}

async function getRedirection(url) {
    const response = await fetch(url, {
        headers: {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0'},
    })

    if (!response.ok) {
        throw `${response.status} ${response.statusText}`
    }

    const urlObject = new URL(url)
    urlObject.hash = ""

    return response.url === urlObject.href ? null : response.url
}
