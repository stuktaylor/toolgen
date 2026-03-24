function buildPrompt(userPrompt) {
  return [
    'Build a single-page web app as a full HTML document.',
    'Return exactly one self-contained HTML document with embedded CSS and JavaScript.',
    'Do not wrap the response in markdown fences.',
    'The result must work when rendered in an iframe srcdoc.',
    'Use semantic HTML and keep the UI readable for non-technical users.',
    '',
    `User request: ${userPrompt.trim()}`,
  ].join('\n');
}

function extractHtmlDocument(responseText) {
  const match =
    responseText.match(/<!DOCTYPE html[\s\S]*?<\/html>/i) ||
    responseText.match(/<html[\s\S]*?<\/html>/i);

  if (!match) {
    throw new Error('Codex did not return a valid HTML document.');
  }

  return match[0].trim();
}

function toTitleCase(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function fallbackName(prompt) {
  const cleaned = prompt
    .trim()
    .replace(/^(build|create|make)\s+(me\s+)?(an?\s+)?/i, '')
    .replace(/\s+for\s+.+$/i, '')
    .replace(/\s+tool$/i, '')
    .trim();

  return toTitleCase(cleaned || 'Untitled Tool');
}

function extractToolName({ html, prompt }) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = match ? match[1].replace(/\s+/g, ' ').trim() : '';
  return title || fallbackName(prompt);
}

async function createSdkClient() {
  const { Codex } = await import('@openai/codex-sdk');
  return new Codex();
}

async function generateTool({ prompt, sdk = null, workingDirectory = process.cwd() }) {
  const client = sdk || (await createSdkClient());
  const thread = client.startThread({
    workingDirectory,
    skipGitRepoCheck: true,
  });
  const turn = await thread.run(buildPrompt(prompt));
  const html = extractHtmlDocument(turn.finalResponse || '');

  return {
    name: extractToolName({ html, prompt }),
    html,
  };
}

module.exports = {
  buildPrompt,
  extractHtmlDocument,
  extractToolName,
  generateTool,
};
