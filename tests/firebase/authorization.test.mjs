import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'node:fs';

let testEnv;

describe('Firestore Security Rules & RBAC Tests', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'stem-academy-test',
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
        host: 'localhost',
        port: 8080
      }
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestoreData();
  });

  it('allows authenticated users to read user profiles', async () => {
    const adminContext = testEnv.authenticatedContext('admin_user', { email: 'admin@stem.academy' });
    const studentContext = testEnv.authenticatedContext('student_user', { email: 'student@stem.academy' });

    // Seed test user profile via admin context
    await adminContext.firestore().collection('users').doc('student_user').set({
      id: 'USR-0001',
      role: 'student',
      status: 'active'
    });

    const studentDb = studentContext.firestore();
    await assertSucceeds(studentDb.collection('users').doc('student_user').get());
  });

  it('restricts class creation to teachers and admins', async () => {
    const studentContext = testEnv.authenticatedContext('student_user', { email: 'student@stem.academy' });
    const teacherContext = testEnv.authenticatedContext('teacher_user', { email: 'teacher@stem.academy' });

    const classData = {
      id: 'CLS-0001',
      name: 'Advanced Physics',
      grade: '12',
      section: 'A'
    };

    // Student should fail to create class
    await assertFails(studentContext.firestore().collection('classes').doc('CLS-0001').set(classData));

    // Teacher should succeed in creating class
    await assertSucceeds(teacherContext.firestore().collection('classes').doc('CLS-0001').set(classData));
  });

  it('restricts audit log reading to admins only', async () => {
    const teacherContext = testEnv.authenticatedContext('teacher_user', { email: 'teacher@stem.academy' });
    const adminContext = testEnv.authenticatedContext('admin_user', { email: 'admin@stem.academy' });

    // Setup user document for role checks
    await adminContext.firestore().collection('users').doc('admin_user').set({ role: 'admin' });
    await adminContext.firestore().collection('users').doc('teacher_user').set({ role: 'teacher' });

    const auditRef = teacherContext.firestore().collection('auditLogs').doc('log_1');
    await assertFails(auditRef.get());

    const adminAuditRef = adminContext.firestore().collection('auditLogs').doc('log_1');
    // Even if doc doesn't exist, read attempt tests permission rules
    await assertSucceeds(adminAuditRef.get());
  });
});
