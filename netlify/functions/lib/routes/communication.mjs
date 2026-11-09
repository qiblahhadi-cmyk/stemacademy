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
    path: '/api/v1/communication',
    handler: async (event) => {
      const user = await authenticate(event);
      requirePermission('notices:read')(user);

      const snapshot = await db.collection('communications').get();
      const communications = [];
      snapshot.forEach(doc => {
        communications.push(doc.data());
      });

      return sendSuccess(communications);
    }
  },
  {
    method: 'GET',
    path: '/api/v1/communication/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('notices:read')(user);

      const { id } = params;
      const comDoc = await db.collection('communications').doc(id).get();

      if (!comDoc.exists) {
        throw new NotFoundError('Communication notice not found.');
      }

      return sendSuccess(comDoc.data());
    }
  },
  {
    method: 'POST',
    path: '/api/v1/communication',
    handler: async (event) => {
      const user = await authenticate(event);
      requirePermission('notices:write')(user);

      const body = JSON.parse(event.body || '{}');
      const { title, content, targetAudience, priority } = body;

      if (!title || !content) {
        throw new BadRequestError('Title and content are required.');
      }

      const customId = await allocateId('com');
      const now = new Date().toISOString();

      const communicationData = {
        id: customId,
        title,
        content,
        targetAudience: targetAudience || 'all',
        priority: priority || 'normal',
        authorId: user.uid,
        createdAt: now,
        updatedAt: now
      };

      await db.collection('communications').doc(customId).set(communicationData);

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'COMMUNICATION_CREATE',
        targetType: 'communication',
        targetId: customId,
        details: { title, targetAudience }
      });

      return sendCreated(communicationData);
    }
  },
  {
    method: 'PUT',
    path: '/api/v1/communication/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('notices:write')(user);

      const { id } = params;
      const body = JSON.parse(event.body || '{}');

      const comRef = db.collection('communications').doc(id);
      const comDoc = await comRef.get();

      if (!comDoc.exists) {
        throw new NotFoundError('Communication notice not found.');
      }

      const updateData = {
        ...body,
        updatedAt: new Date().toISOString()
      };

      await comRef.update(updateData);

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'COMMUNICATION_UPDATE',
        targetType: 'communication',
        targetId: id,
        details: updateData
      });

      const updatedDoc = await comRef.get();
      return sendSuccess(updatedDoc.data());
    }
  },
  {
    method: 'DELETE',
    path: '/api/v1/communication/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('notices:delete')(user);

      const { id } = params;
      const comRef = db.collection('communications').doc(id);
      const comDoc = await comRef.get();

      if (!comDoc.exists) {
        throw new NotFoundError('Communication notice not found.');
      }

      await comRef.delete();

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'COMMUNICATION_DELETE',
        targetType: 'communication',
        targetId: id
      });

      return sendNoContent();
    }
  }
];
