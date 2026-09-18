const assert = require('assert');
const diagrams = require('../../lib/diagram');

const processText = 'First prepare the input. Next validate the records. Finally publish the result.';
const timelineText = 'In 2019 the project began. Then in 2020 the team expanded. By 2021 the service launched.';
const comparisonText = 'Unlike a cache, a database persists data. In contrast, a cache is temporary. Both improve application speed.';

assert.strictEqual(diagrams.typeFor(processText), 'flowchart');
assert.strictEqual(diagrams.typeFor(timelineText), 'timeline');
assert.strictEqual(diagrams.typeFor(comparisonText), 'comparison');
assert.ok(diagrams.valid(diagrams.generate(processText)));
assert.ok(diagrams.valid(diagrams.generate(timelineText)));
assert.deepStrictEqual(diagrams.timelineEvents(timelineText).map(event => event.year), ['2019', '2020', '2021']);
assert.ok(diagrams.generate(`${timelineText} ${'In 2022 the service grew rapidly. '.repeat(12)}`).split('\n').length <= 10);
assert.ok(diagrams.parts(processText).length >= 3);
assert.strictEqual(diagrams.generate('A short sentence.'), null);
console.log('PASS: diagram detection, generation, and validation');
