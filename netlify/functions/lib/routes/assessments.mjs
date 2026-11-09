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
    path: '/api/v1/assessments',
    handler: async (event) => {
      const user = await authenticate(event);
      requirePermission('assessments:read')(user);

      const snapshot = await db.collection('assessments').get();
      const assessments = [];
      snapshot.forEach(doc => {
        assessments.push(doc.data());
      });

      return sendSuccess(assessments);
    }
  },
  {
    method: 'GET',
    path: '/api/v1/assessments/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('assessments:read')(user);

      const { id } = params;
      const astDoc = await db.collection('assessments').doc(id).get();

      if (!astDoc.exists) {
        throw new NotFoundError('Assessment not found.');
      }

      return sendSuccess(astDoc.data());
    }
  },
  {
    method: 'POST',
    path: '/api/v1/assessments',
    handler: async (event) => {
      const user = await authenticate(event);
      requirePermission('assessments:write')(user);

      const body = JSON.parse(event.body || '{}');
      const { title, type, classId, subjectId, date, totalMarks } = body;

      if (!title || !type || !classId || !date) {
        throw new BadRequestError('Title, type, classId, and date are required.');
      }

      const customId = await allocateId('ast');
      const now = new Date().toISOString();

      const assessmentData = {
        id: customId,
        title,
        type,
        classId,
        subjectId: subjectId || '',
        date,
        totalMarks: totalMarks || 100,
        grades: [],
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now
      };

      await db.collection('assessments').doc(customId).set(assessmentData);

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'ASSESSMENT_CREATE',
        targetType: 'assessment',
        targetId: customId,
        details: { title, classId }
      });

      return sendCreated(assessmentData);
    }
  },
  {
    method: 'PUT',
    path: '/api/v1/assessments/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('assessments:write')(user);

      const { id } = params;
      const body = JSON.parse(event.body || '{}');

      const astRef = db.collection('assessments').doc(id);
      const astDoc = await astRef.get();

      if (!astDoc.exists) {
        throw new NotFoundError('Assessment not found.');
      }

      const updateData = {
        ...body,
        updatedAt: new Date().toISOString()
      };

      await astRef.update(updateData);

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'ASSESSMENT_UPDATE',
        targetType: 'assessment',
        targetId: id,
        details: updateData
      });

      const updatedDoc = await astRef.get();
      return sendSuccess(updatedDoc.data());
    }
  },
  {
    method: 'DELETE',
    path: '/api/v1/assessments/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('assessments:delete')(user);

      const { id } = params;
      const astRef = db.collection('assessments').doc(id);
      const astDoc = await astRef.get();

      if (!astDoc.exists) {
        throw new NotFoundError('Assessment not found.');
      }

      await astRef.delete();

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'ASSESSMENT_DELETE',
        targetType: 'assessment',
        targetId: id
      });

      return sendNoContent();
    }
  }
];
