import { describe, it } from 'node:test';
import assert from 'node:assert';
import { requirePermission, requireRole } from '../../netlify/functions/lib/authorization.mjs';
import { ForbiddenError } from '../../netlify/functions/lib/errors.mjs';

describe('API Authorization & RBAC Middleware Tests', () => {
  it('permits access when user has direct permission', () => {
    const user = { role: 'teacher', email: 'teacher@stem.academy' };
    const check = requirePermission('academics:write');
    assert.doesNotThrow(() => check(user));
  });

  it('throws ForbiddenError when user lacks permission', () => {
    const user = { role: 'student', email: 'student@stem.academy' };
    const check = requirePermission('users:delete');
    assert.throws(() => check(user), ForbiddenError);
  });

  it('allows wildcard admin role for all protected permissions', () => {
    const user = { role: 'admin', email: 'admin@stem.academy' };
    const check = requirePermission('users:delete');
    assert.doesNotThrow(() => check(user));
  });

  it('enforces allowed roles check correctly', () => {
    const user = { role: 'student', email: 'student@stem.academy' };
    const checkRole = requireRole(['admin', 'teacher']);
    assert.throws(() => checkRole(user), ForbiddenError);

    const teacherUser = { role: 'teacher', email: 'teacher@stem.academy' };
    assert.doesNotThrow(() => checkRole(teacherUser));
  });
});
