const { promises: fs } = require('fs');
const oniguruma = require('vscode-oniguruma');
const vsctm = require('vscode-textmate');

const onigLib = fs.readFile(require.resolve('vscode-oniguruma/release/onig.wasm'))
  .then(wasmBin => oniguruma.loadWASM(wasmBin.buffer))
  .then(() => ({
    createOnigScanner: patterns => new oniguruma.OnigScanner(patterns),
    createOnigString: s => new oniguruma.OnigString(s),
  }));

const loadGrammar = scopeName => {
  try {
    return require(`./grammar/${scopeName}.json`);
  } catch {}
}

const registry = new vsctm.Registry({onigLib, loadGrammar});

const specialChars = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function * yieldTokens(code, grammar) {
  let ruleStack = vsctm.INITIAL;
  let offset = 0;

  for (const line of code.split('\n')) {
    const tokenizedLine = grammar.tokenizeLine(line, ruleStack);

    for (const token of tokenizedLine.tokens) {
      yield {
        scopes: token.scopes,
        startIndex: token.startIndex + offset,
      }
    }

    offset += line.length + 1;
    ruleStack = tokenizedLine.ruleStack;
  }
}

function computeOperations(code, grammar) {
  const currentScopes = new Map();
  const operations = [];

  for (const token of yieldTokens(code, grammar)) {
    // remove absent scopes from current ones and group them by start index
    const closedScopes = new Map();
    currentScopes.forEach((startIndex, scope) => {
      if (token.scopes.includes(scope)) {
        return;
      }

      const scopes = closedScopes.get(startIndex);
      scopes ? scopes.push(scope) : closedScopes.set(startIndex, [scope]);

      currentScopes.delete(scope);
    });

    // add each new scope to current ones
    token.scopes.forEach(scope => {
      if (!currentScopes.has(scope)) {
        currentScopes.set(scope, token.startIndex);
      }
    });

    // we know where to open and close closed scopes
    closedScopes.forEach((scopes, startIndex) => {
      operations.push(
        {do: 'open', scopes, at: startIndex, for: token.startIndex - startIndex},
        {do: 'close', at: token.startIndex}
      );
    });
  }

  // handle remaining scopes
  const closedScopes = new Map();
  currentScopes.forEach((startIndex, scope) => {
    const scopes = closedScopes.get(startIndex);
    scopes ? scopes.push(scope) : closedScopes.set(startIndex, [scope]);
  });

  const endIndex = code.length;
  closedScopes.forEach((scopes, startIndex) => {
    operations.push(
      {do: 'open', scopes, at: startIndex, for: endIndex - startIndex},
      {do: 'close', at: endIndex}
    );
  });

  return operations;
}

async function tokenize (code, scopeName, linesToKeep) {
  const grammar = await registry.loadGrammar(scopeName);
  const operations = computeOperations(code, grammar);

  operations.sort((a, b) => {
    if (a.at !== b.at) {
      return b.at - a.at;
    }

    const isAOpen = 'open' === a.do;
    if (a.do !== b.do) {
      return isAOpen ? -1 : 1;
    }

    if (isAOpen) {
      return a.for - b.for;
    }

    return 0;
  });

  // remove grammar scope as it is known
  operations.pop();
  operations.shift();

  let lastIndex = code.length;
  let html = operations.reduce((html, operation) => {
    let insert = 'open' === operation.do
      ? `<span class=" ${operation.scopes.join(' ')}">`
      : '</span>'
    ;

    if (lastIndex !== operation.at) {
      insert += code.substring(operation.at, lastIndex).replaceAll(/[&<>"]/g, c => specialChars[c]);

      lastIndex = operation.at;
    }

    return `${insert}${html}`;
  }, '');

  if (lastIndex) {
    html = `${code.substring(0, lastIndex)}${html}`;
  }

  if (linesToKeep) {
    html = html.split('\n').filter((_, i) => linesToKeep.includes(i + 1)).join('\n');
  }

  return html;
}

module.exports = tokenize;
