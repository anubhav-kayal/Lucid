const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', '@mozilla', 'readability', 'Readability.js');
const dest = path.join(__dirname, '..', 'lib', 'readability.js');

let code = fs.readFileSync(src, 'utf8');

code = code.replace(
  'if (typeof module === "object") {\n  /* eslint-disable-next-line no-redeclare */\n  /* global module */\n  module.exports = Readability;\n}',
  'if (typeof self !== "undefined") {\n  self.Readability = Readability;\n}\n\nif (typeof module === "object") {\n  module.exports = Readability;\n}'
);

fs.writeFileSync(dest, code);
console.log('Built lib/readability.js from @mozilla/readability');
