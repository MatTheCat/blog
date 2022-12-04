const path = require('path')
require('require-jsonc');

const args = require('yargs/yargs')(process.argv.slice(2))
  .command(
    '* [output]',
    'Convert given VS Code themes into a single CSS file.',
    yargs => {
      yargs.positional('output', {
        describe: 'Resulting CSS file path',
        default: path.join(__dirname, '../source/assets/code.css'),
      })
    })
    .option('light', {
      default: path.join(__dirname, 'theme/light_plus.json'),
      demandOption: true,
      description: 'Light theme file path',
      requiresArg: true,
    })
    .option('dark', {
      default: path.join(__dirname, 'theme/dark_plus.json'),
      demandOption: true,
      description: 'Dark theme file path',
      requiresArg: true,
    })
    .version(false)
    .argv
;

function generateRuleSets(tokenColors) {
  const ruleSets = new Map();
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

  return ruleSets;
}

function sortRuleSets(ruleSets) {
  return new Map(
    [...ruleSets.entries()]
    .sort(([firstKey], [secondKey]) => firstKey.length - secondKey.length || (firstKey > secondKey ? 1 : -1))
  );
}

function processTheme(themePath) {
  const resolvedThemePath = path.resolve(process.cwd(), themePath);
  const theme = require(resolvedThemePath);
  const ruleSets = generateRuleSets(theme.tokenColors);

  if ('include' in theme) {
    const dependeeRuleSets = processTheme(path.resolve(
      path.dirname(resolvedThemePath),
      theme.include
    ));

    for (const [scope, declarations] of dependeeRuleSets) {
      const dependentDeclarations = ruleSets.get(scope);
      if (!dependentDeclarations) {
        ruleSets.set(scope, declarations);

        continue;
      }

      for (const [property, value] of declarations.entries()) {
        if (!dependentDeclarations.has(property)) {
          dependentDeclarations.set(property, value);
        }
      }
    }
  }

  return ruleSets;
}

function printRuleSetsAsCss(ruleSets, stream, indentation = '') {
  for (const [scope, declarations] of ruleSets.entries()) {
    stream.write(`${indentation}[class*=" ${scope.replaceAll(' ', '"] [class*=" ')}"] {\n`);
    for (const [property, value] of declarations.entries()) {
      stream.write(`${indentation}    ${property}: ${value};\n`)
    }
    stream.write('}\n');
  }
}

const stream = require('fs').createWriteStream(args.output);

printRuleSetsAsCss(sortRuleSets(processTheme(args['light'])), stream);

stream.write('@media (prefers-color-scheme: dark) {\n');

printRuleSetsAsCss(sortRuleSets(processTheme(args['dark'])), stream, '    ');

stream.end(`}\n`);
