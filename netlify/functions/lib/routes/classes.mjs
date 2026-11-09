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
    path: '/api/v1/classes',
    handler: async (event) => {
      const user = await authenticate(event);
      requirePermission('academics:read')(user);

      const snapshot = await db.collection('classes').get();
      const classes = [];
      snapshot.forEach(doc => {
        classes.push(doc.data());
      });

      return sendSuccess(classes);
    }
  },
  {
    method: 'GET',
    path: '/api/v1/classes/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('academics:read')(user);

      const { id } = params;
      const classDoc = await db.collection('classes').doc(id).get();

      if (!classDoc.exists) {
        throw new NotFoundError('Class record not found.');
      }

      return sendSuccess(classDoc.data());
    }
  },
  {
    method: 'POST',
    path: '/api/v1/classes',
    handler: async (event) => {
      const user = await authenticate(event);
      requirePermission('academics:write')(user);

      const body = JSON.parse(event.body || '{}');
      const { name, grade, section, room, teacherId, academicYear } = body;

      if (!name || !grade || !section) {
        throw new BadRequestError('Name, grade, and section are required fields.');
      }

      const customId = await allocateId('cls');
      const now = new Date().toISOString();

      const classData = {
        id: customId,
        name,
        grade,
        section,
        room: room || '',
        teacherId: teacherId || null,
        academicYear: academicYear || new Date().getFullYear().toString(),
        createdAt: now,
        updatedAt: now
      };

      await db.collection('classes').doc(customId).set(classData);

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'CLASS_CREATE',
        targetType: 'class',
        targetId: customId,
        details: classData
      });

      return sendCreated(classData);
    }
  },
  {
    method: 'PUT',
    path: '/api/v1/classes/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('academics:write')(user);

      const { id } = params;
      const body = JSON.parse(event.body || '{}');

      const classRef = db.collection('classes').doc(id);
      const classDoc = await classRef.get();

      if (!classDoc.exists) {
        throw new NotFoundError('Class record not found.');
      }

      const updateData = {
        ...body,
        updatedAt: new Date().toISOString()
      };

      await classRef.update(updateData);

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'CLASS_UPDATE',
        targetType: 'class',
        targetId: id,
        details: updateData
      });

      const updatedDoc = await classRef.get();
      return sendSuccess(updatedDoc.data());
    }
  },
  {
    method: 'DELETE',
    path: '/api/v1/classes/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('academics:delete')(user);

      const { id } = params;
      const classRef = db.collection('classes').doc(id);
      const classDoc = await classRef.get();

      if (!classDoc.exists) {
        throw new NotFoundError('Class record not found.');
      }

      await classRef.delete();

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'CLASS_DELETE',
        targetType: 'class',
        targetId: id
      });

      return sendNoContent();
    }
  }
];
