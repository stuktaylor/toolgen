const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPrompt,
  extractHtmlDocument,
  extractToolName,
  generateTool,
} = require('../codegen');

test('buildPrompt asks Codex for a single self-contained HTML document', () => {
  const prompt = buildPrompt('Build a PTO calculator for HR');

  assert.match(prompt, /full HTML document/i);
  assert.match(prompt, /single-page web app/i);
  assert.match(prompt, /embedded CSS and JavaScript/i);
  assert.match(prompt, /Do not wrap the response in markdown fences/i);
  assert.match(prompt, /Build a PTO calculator for HR/);
});

test('extractHtmlDocument returns the first complete HTML document from mixed output', () => {
  const response = [
    'Here is your tool:',
    '```html',
    '<!DOCTYPE html><html><head><title>Leave Tool</title></head><body>OK</body></html>',
    '```',
  ].join('\n');

  const html = extractHtmlDocument(response);

  assert.equal(
    html,
    '<!DOCTYPE html><html><head><title>Leave Tool</title></head><body>OK</body></html>'
  );
});

test('extractHtmlDocument throws when there is no full HTML document', () => {
  assert.throws(
    () => extractHtmlDocument('I could not complete the task.'),
    /valid HTML document/
  );
});

test('extractToolName prefers the HTML title and falls back to the prompt', () => {
  const fromHtml = extractToolName({
    html: '<!DOCTYPE html><html><head><title>Shift Planner</title></head><body></body></html>',
    prompt: 'Build a shift planner for the support team',
  });
  const fromPrompt = extractToolName({
    html: '<!DOCTYPE html><html><head></head><body></body></html>',
    prompt: 'Build a budget dashboard for finance',
  });

  assert.equal(fromHtml, 'Shift Planner');
  assert.equal(fromPrompt, 'Budget Dashboard');
});

test('generateTool uses the sdk thread and returns extracted html and name', async () => {
  const calls = [];
  const sdk = {
    startThread(options) {
      calls.push({ type: 'startThread', options });
      return {
        run(input) {
          calls.push({ type: 'run', input });
          return Promise.resolve({
            finalResponse:
              '<!DOCTYPE html><html><head><title>People Directory</title></head><body>Done</body></html>',
          });
        },
      };
    },
  };

  const result = await generateTool({
    prompt: 'Build a people directory search tool',
    sdk,
    workingDirectory: '/tmp/toolsgen-test',
  });

  assert.equal(result.name, 'People Directory');
  assert.match(result.html, /<!DOCTYPE html>/);
  assert.equal(calls[0].type, 'startThread');
  assert.equal(calls[0].options.workingDirectory, '/tmp/toolsgen-test');
  assert.equal(calls[1].type, 'run');
  assert.match(calls[1].input, /people directory search tool/i);
});
