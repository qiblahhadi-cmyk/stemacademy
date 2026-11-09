import { db } from '../firebase-admin.mjs';
import { sendSuccess, sendCreated, sendNoContent } from '../response.mjs';
import { NotFoundError, BadRequestError } from '../errors.mjs';
import { authenticate } from '../auth-middleware.mjs';
import { requirePermission } from '../authorization.mjs';
import { allocateId } from '../id-allocator.mjs';
import { logAudit } from '../audit.mjs';

export const routes = [
  {
    method: 'GET',
    path: '/api/v1/assignments',
    handler: async (event) => {
      const user = await authenticate(event);
      requirePermission('assignments:read')(user);

      const snapshot = await db.collection('assignments').get();
      const assignments = [];
      snapshot.forEach(doc => {
        assignments.push(doc.data());
      });

      return sendSuccess(assignments);
    }
  },
  {
    method: 'GET',
    path: '/api/v1/assignments/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('assignments:read')(user);

      const { id } = params;
      const asmDoc = await db.collection('assignments').doc(id).get();

      if (!asmDoc.exists) {
        throw new NotFoundError('Assignment not found.');
      }

      return sendSuccess(asmDoc.data());
    }
  },
  {
    method: 'POST',
    path: '/api/v1/assignments',
    handler: async (event) => {
      const user = await authenticate(event);
      requirePermission('assignments:write')(user);

      const body = JSON.parse(event.body || '{}');
      const { title, description, classId, subjectId, dueDate, maxPoints, attachments } = body;

      if (!title || !classId || !dueDate) {
        throw new BadRequestError('Title, classId, and dueDate are required.');
      }

      const customId = await allocateId('asm');
      const now = new Date().toISOString();

      const assignmentData = {
        id: customId,
        title,
        description: description || '',
        classId,
        subjectId: subjectId || '',
        dueDate,
        maxPoints: maxPoints || 100,
        attachments: attachments || [],
        submissions: [],
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now
      };

      await db.collection('assignments').doc(customId).set(assignmentData);

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'ASSIGNMENT_CREATE',
        targetType: 'assignment',
        targetId: customId,
        details: { title, classId }
      });

      return sendCreated(assignmentData);
    }
  },
  {
    method: 'PUT',
    path: '/api/v1/assignments/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('assignments:write')(user);

      const { id } = params;
      const body = JSON.parse(event.body || '{}');

      const asmRef = db.collection('assignments').doc(id);
      const asmDoc = await asmRef.get();

      if (!asmDoc.exists) {
        throw new NotFoundError('Assignment not found.');
      }

      const updateData = {
        ...body,
        updatedAt: new Date().toISOString()
      };

      await asmRef.update(updateData);

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'ASSIGNMENT_UPDATE',
        targetType: 'assignment',
        targetId: id,
        details: updateData
      });

      const updatedDoc = await asmRef.get();
      return sendSuccess(updatedDoc.data());
    }
  },
  {
    method: 'DELETE',
    path: '/api/v1/assignments/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('assignments:delete')(user);

      const { id } = params;
      const asmRef = db.collection('assignments').doc(id);
      const asmDoc = await asmRef.get();

      if (!asmDoc.exists) {
        throw new NotFoundError('Assignment not found.');
      }

      await asmRef.delete();

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'ASSIGNMENT_DELETE',
        targetType: 'assignment',
        targetId: id
      });

      return sendNoContent();
    }
  },
  {
    method: 'POST',
    path: '/api/v1/assignments/:id/submit',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('assignments:submit')(user);

      const { id } = params;
      const body = JSON.parse(event.body || '{}');
      const { submissionUrl, notes } = body;

      const asmRef = db.collection('assignments').doc(id);
      const asmDoc = await asmRef.get();

      if (!asmDoc.exists) {
        throw new NotFoundError('Assignment not found.');
      }

      const submissionRecord = {
        studentId: user.uid,
        studentEmail: user.email,
        submissionUrl: submissionUrl || '',
        notes: notes || '',
        submittedAt: new Date().toISOString(),
        status: 'submitted'
      };

      const currentData = asmDoc.data();
      const updatedSubmissions = [...(currentData.submissions || []), submissionRecord];

      await asmRef.update({
        submissions: updatedSubmissions,
        updatedAt: new Date().toISOString()
      });

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'ASSIGNMENT_SUBMIT',
        targetType: 'assignment',
        targetId: id
      });

      return sendSuccess(submissionRecord, 201);
    }
  }
];
