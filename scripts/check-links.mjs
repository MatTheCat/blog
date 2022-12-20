import { readdir, readFile } from "fs/promises"

for (const file of await readdir("source", {withFileTypes: true})) {
    if (file.isDirectory()) {
        continue;
    }

    checkPage(file.name).then(async report => {
        console.log(`\x1b[4m${file.name}\x1b[0m`)

        for (const [href, check] of report) {
            try {
                const betterUrl = await check;

                if (betterUrl) {
                    console.log(`\x1b[33m⚠\x1b[0m️${href} => ${betterUrl}`)
                } else {
                    console.log(`\x1b[32m✓\x1b[0m ${href}`)
                }
            } catch (e) {
                console.log(`\x1b[31m✕\x1b[0m ${href} (${e})`)
            }
        }

        if (!report.size) {
            console.log(`\x1b[90m∅\x1b[0m`)
        }

        console.log()
    })
}


async function checkPage(page) {
    const report = new Map()

    const html = await readFile(`source/${page}`, "utf8")

    for (const [, href] of html.matchAll(/<a [^>]*href="((?=https?:)[^"]+)/g)) {
        report.set(href, findBetterUrl(href))
    }

    await Promise.allSettled(report.values())

    return report
}

async function findBetterUrl(href) {
    const response = await fetch(href)

    if (!response.ok) {
        throw `Request to “${href}“ yielded “${response.status} ${response.statusText}“.`
    }

    const url = new URL(href)
    url.hash = ""

    return response.url === url.href ? null : response.url
}
