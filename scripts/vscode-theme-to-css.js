require('require-jsonc');

const tokenColors = process.argv.slice(2).reduce((tokenColors, themeFile) => {
  return tokenColors.concat(require(themeFile).tokenColors);
}, []);

let ruleSets = new Map();
for (const style of tokenColors) {
  for (const scope of Array.isArray(style.scope) ? style.scope : [style.scope]) {
    const declarations = ruleSets.get(scope) || new Map();

    for (const [property, value] of Object.entries(style.settings)) {
      if (value.includes('bold')) {
        declarations.set('font-weight', 'bold');
      }
      if (value.includes('italic')) {
        declarations.set('font-style', 'italic');
      }
      if (value.includes('underline')) {
        declarations.set('text-decoration', 'underline');
      }

      if ('foreground' === property) {
        declarations.set('color', value);
      } else if ('background' === property) {
        declarations.set('background', value);
      }
    }

    ruleSets.set(scope, declarations);
  }
}

ruleSets = new Map([...ruleSets.entries()].sort(([firstKey], [secondKey]) => firstKey.length - secondKey.length));

const stream = require('fs').createWriteStream('source/assets/code.css');
for (const [scope, declarations] of ruleSets.entries()) {
  stream.write(`[class*=" ${scope.replaceAll(' ', '"] [class*=" ')}"] {\n`);
  for (const [property, value] of declarations.entries()) {
    stream.write(`    ${property}: ${value};\n`)
  }
  stream.write('}\n');
}
stream.end();
