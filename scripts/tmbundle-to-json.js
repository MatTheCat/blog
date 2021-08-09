const fs = require('fs');
const vsctm = require('vscode-textmate');

const grammarFile = process.argv.pop();
const grammar = vsctm.parseRawGrammar(fs.readFileSync(grammarFile, 'utf8'), grammarFile);
fs.writeFileSync(`grammar/${grammar.scopeName}.json`, JSON.stringify(grammar, null, '\t'));
fs.unlinkSync(grammarFile);
