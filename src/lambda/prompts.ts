export const ISSUE_EXTRACTION_PROMPT = `Extract all issues and defects from the following property inspection report text. 
Group them by category (e.g., Roof, Plumbing, Electrical).
For each issue, describe:
- The specific defect
- Its location
- The recommended action (e.g., Repair, Replace, Further Evaluation)
- Severity (Low, Medium, High)

Format the output as a clean JSON array of objects.

OCR TEXT:
{{OCR_TEXT}}`;

export const NEGOTIATION_PLAN_PROMPT = `You are an expert real estate negotiation assistant. 
Based on the following list of issues extracted from a property inspection report, generate a strategic negotiation plan for a buyer's agent.

ISSUES:
{{ISSUES}}

CONTEXT:
{{CONTEXT}}

STYLE:
{{STYLE}}

The plan should include:
1. A summary of the most critical issues.
2. A prioritized list of repair requests or credits to ask for.
3. Rationale for each request to help the agent explain it to the listing agent.
4. Tips for the agent on how to approach this specific negotiation.

Format the output in professional Markdown.`;
