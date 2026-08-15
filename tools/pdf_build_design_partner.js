// ORQ8 design-partner one-pager — aimed at solo founders, focused on the
// Golden Workflow demo and joining the beta. One page, dependency-free (Node >= 14).
// Output: ORQ8_DESIGN_PARTNER.pdf (US Letter). Run: node tools/pdf_build_design_partner.js

const path = require('path');
const { title, subtitle, h1, p, bullet, spacer, rule, yPos, build } = require('./pdf_engine');

const OUT = path.join(__dirname, '..', 'ORQ8_DESIGN_PARTNER.pdf');

// ================= CONTENT =================
title('ORQ8 — Design Partner Program');
subtitle('The AI Organization Operating System for one-person companies, built with solo founders. Tell ORQ8 what you want: it hires the team, does the work, and reports back. Free access through beta for a deliberately small cohort of 3–5 design partners.');

h1('The Golden Workflow — what the demo shows');
bullet('You speak. It understands. Give ORQ8 a vague idea, a link, or a question — "I think there is a business here, investigate it." The Executive Agent classifies intent, gathers context from Company Memory, and convenes the right team.');
bullet('It deliberates like a real organization. A temporary strategy council (market researcher, finance analyst, legal researcher, growth strategist) researches independently and challenges one another; the Executive Agent returns a recommendation with evidence, alternatives, confidence, and the approval required.');
bullet('You approve. It hires, executes, reports. You decide in the Decision Center — approve, reject, or modify. Temporary agents are hired with business cases, execute with approvals and blockers flagged, write lessons to Company Memory, and send a weekly report. Everything is audited; nothing consequential happens without you.');
p('Example. "I think we should build an AI customer support product for African businesses. Find out whether this is worth pursuing." -> council -> recommendation -> your approval -> validation project -> hired AI team executes -> weekly report.');

h1('What you get');
bullet('Free Pro-equivalent access through beta (~6 months), no card required.');
bullet('A direct line to the founder — your feedback ships, and your roadmap is our roadmap.');
bullet('Early access before anyone else, plus naming rights in the changelog.');

h1('What we ask in return');
bullet('Use ORQ8 on ONE real business decision in your first two weeks — not a demo, a real one.');
bullet('One 30-minute onboarding call, then one feedback call per month.');
bullet('Honest criticism: what is broken, confusing, or missing.');
bullet('Permission to use your story as a case study — anonymized if you prefer.');

h1('How to join the beta');
bullet('Apply: email [you@orq8.ai] with three lines — who you are, what you build, and the one decision you would feed ORQ8.');
bullet('20-minute call: we walk the Golden Workflow on YOUR real idea — never a canned demo.');
bullet('Onboard: your organization, Company Constitution, and first council are set up with you.');
bullet('Loop: monthly feedback calls; what you report gets fixed. Slots are deliberately limited to 3–5.');

p('You stay the CEO. The system runs the organization.');
spacer(6);
rule(yPos() - 4);

build(OUT, {
  headerText: 'ORQ8  |  The AI Organization Operating System',
  footerLeft: 'orq8.ai',
  pageNumbers: true,
  contact: '[hello@orq8.ai]',
});
