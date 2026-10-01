// Imported first (by name) in virtualTestUser.test.js so these assignments run
// before env.js is evaluated — ESM import declarations are hoisted ahead of
// any plain top-level statement in the importing file, so setting
// process.env directly at the top of that file (after its own imports) would
// run too late.
process.env.TEST_USER_ENABLED = 'true';
process.env.TEST_USER_EMAIL = 'virtualtest@zorx.test';
process.env.TEST_USER_PASSWORD = 'virtual-pass-123';
