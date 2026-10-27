import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDarkMobileChrome, applyMobileChrome, DARK_BG, BRAND_THEME } from './mobileChrome.js';

test('dark only for the phone employee app and phone login', () => {
  const dark = (pathname, role, isPhone = true) => isDarkMobileChrome({ isPhone, pathname, role });
  assert.equal(dark('/', 'EMPLOYEE'), true);
  assert.equal(dark('/attendance', 'EMPLOYEE'), true);
  assert.equal(dark('/payslips', 'EMPLOYEE'), true);
  assert.equal(dark('/login', undefined), true);
  assert.equal(dark('/', undefined), true); // before the user has loaded
  assert.equal(dark('/', 'EMPLOYEE', false), false); // tablet/desktop never change
  assert.equal(dark('/admin/reports', 'ADMIN'), false);
  assert.equal(dark('/', 'SUPER_ADMIN'), false); // admins get the light admin layout
  for (const p of ['/signup', '/forgot-password', '/change-password', '/not-authorized']) assert.equal(dark(p, undefined), false, p);
  assert.equal(dark('/administrator', 'EMPLOYEE'), true); // prefix match is per path segment
});

test('applies the html attribute and theme-color, and restores them', () => {
  const attrs = {};
  const meta = { content: BRAND_THEME, setAttribute: (k, v) => (meta[k] = v) };
  const doc = {
    documentElement: { setAttribute: (k, v) => (attrs[k] = v), removeAttribute: (k) => delete attrs[k] },
    querySelector: () => meta,
  };
  applyMobileChrome(true, doc);
  assert.equal(attrs['data-zm-chrome'], 'dark');
  assert.equal(meta.content, DARK_BG);
  applyMobileChrome(false, doc);
  assert.equal('data-zm-chrome' in attrs, false);
  assert.equal(meta.content, BRAND_THEME);
});
