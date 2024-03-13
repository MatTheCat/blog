import { readdir, readFile } from "fs/promises"

const reports = [];

for (const file of await readdir("source", {withFileTypes: true})) {
    if (file.isDirectory()) {
        continue;
    }

    reports.push(checkPage(file.name)
        .then(async redirections => {
            const report = {
                page: file.name,
                redirections: new Map(),
                errors: [],
            }

            for (const [href, redirectionPromise] of redirections) {
                try {
                    const redirection = await redirectionPromise

                    if (redirection) {
                        report.redirections.set(href, redirection)

                        process.stdout.write('\x1b[1m\x1b[33mR\x1b[0m️')
                    } else {
                        process.stdout.write('.')
                    }
                } catch (e) {
                    report.errors.push(e)

                    process.stdout.write('\x1b[1m\x1b[31mE\x1b[0m️')
                }
            }

            return report;
        })
    )
}

Promise.all(reports)
    .then(reports => {
        console.log()

        let redirectionCount = 0, errorCount = 0
        for (const report of reports) {
            redirectionCount += report.redirections.size
            errorCount += report.errors.length
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
            if (!report.errors.length && !report.redirections.size) {
                continue
            }

            console.group(`\x1b[4m${report.page}\x1b[0m`)
            for (const error of report.errors) {
                console.log('\x1b[31m●\x1b[0m %s', error)
            }
            for (const [src, dest] of report.redirections) {
                console.log('\x1b[33m●\x1b[0m %s redirects to %s', src, dest)
            }
            console.groupEnd()
            console.log()
        }
    })
    .then(() => process.exit())

async function checkPage(page) {
    const redirections = new Map()

    const html = await readFile(`source/${page}`, "utf8")

    for (const [, href] of html.matchAll(/<a [^>]*href="((?=https?:)[^"]+)/g)) {
        redirections.set(href, getRedirection(href))
    }

    return redirections
}

async function getRedirection(url) {
    const response = await fetch(url)

    if (!response.ok) {
        throw `Request to “${url}“ yielded “${response.status} ${response.statusText}“.`
    }

    const urlObject = new URL(url)
    urlObject.hash = ""

    return response.url === urlObject.href ? null : response.url
}
