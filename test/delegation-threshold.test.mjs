import test from "node:test";
import assert from "node:assert/strict";
import { shouldDelegateInvestigation, explainDelegationSkip } from "../src/delegation.mjs";

test("skip tiny prompt on small repo", () => {
  const question = "explain @src/App.tsx";
  assert.equal(shouldDelegateInvestigation({ question, repoFileCount: 15 }), false);
  assert.match(explainDelegationSkip({ question, repoFileCount: 15 }), /below delegation threshold/);
});

test("delegate large repo even for short prompt", () => {
  assert.equal(shouldDelegateInvestigation({ question: "fix bug", repoFileCount: 120 }), true);
  assert.equal(shouldDelegateInvestigation({ question: "explain @src/App.tsx", repoFileCount: 48 }), true);
});

test("delegate when many files mentioned", () => {
  const question = "explain auth.js, db.js, middleware.js, session.js";
  assert.equal(shouldDelegateInvestigation({ question, repoFileCount: 10 }), true);
});
