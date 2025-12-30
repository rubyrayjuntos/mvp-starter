import fs from 'fs';

describe('Prompt templates', () => {
  test('issue extraction prompt contains placeholder', () => {
    const prompt = fs.readFileSync('prompts/issue-extraction.txt', 'utf8');
    expect(prompt).toContain('{{OCR_TEXT}}');
  });

  test('negotiation prompt contains placeholders', () => {
    const prompt = fs.readFileSync('prompts/negotiation-plan.txt', 'utf8');
    expect(prompt).toContain('{{ISSUES_JSON}}');
    expect(prompt).toContain('{{CONTEXT_JSON}}');
  });
});