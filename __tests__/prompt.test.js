"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
describe('Prompt templates', () => {
    test('issue extraction prompt contains placeholder', () => {
        const prompt = fs_1.default.readFileSync('prompts/issue-extraction.txt', 'utf8');
        expect(prompt).toContain('{{OCR_TEXT}}');
    });
    test('negotiation prompt contains placeholders', () => {
        const prompt = fs_1.default.readFileSync('prompts/negotiation-plan.txt', 'utf8');
        expect(prompt).toContain('{{ISSUES_JSON}}');
        expect(prompt).toContain('{{CONTEXT_JSON}}');
    });
});
