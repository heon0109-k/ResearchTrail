'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config/rag.yaml'), 'utf8');
const retrieval = fs.readFileSync(path.join(root, 'web/js/chat-retrieval.js'), 'utf8');

for (const [key, constant] of Object.entries({
  chunk_chars: 'CHUNK_CHARS',
  overlap: 'OVERLAP',
  max_chunks: 'MAX_CHUNKS',
  max_context_chars: 'MAX_CONTEXT_CHARS'
})) {
  const configured = config.match(new RegExp(`^  ${key}: *(\\d+) *(?:#.*)?$`, 'm'));
  const implemented = retrieval.match(new RegExp(`\\b${constant} *= *(\\d+)\\b`));
  assert.ok(configured, `Missing config value: ${key}`);
  assert.ok(implemented, `Missing retrieval constant: ${constant}`);
  assert.equal(Number(configured[1]), Number(implemented[1]), `${key} must match ${constant}`);
}

console.log('PASS: RAG configuration matches all four retrieval constants.');
