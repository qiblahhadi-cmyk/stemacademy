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
    path: '/api/v1/attendance',
    handler: async (event) => {
      const user = await authenticate(event);
      requirePermission('attendance:read')(user);

      const snapshot = await db.collection('attendance').get();
      const attendanceRecords = [];
      snapshot.forEach(doc => {
        attendanceRecords.push(doc.data());
      });

      return sendSuccess(attendanceRecords);
    }
  },
  {
    method: 'GET',
    path: '/api/v1/attendance/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('attendance:read')(user);

      const { id } = params;
      const attDoc = await db.collection('attendance').doc(id).get();

      if (!attDoc.exists) {
        throw new NotFoundError('Attendance record not found.');
      }

      return sendSuccess(attDoc.data());
    }
  },
  {
    method: 'POST',
    path: '/api/v1/attendance',
    handler: async (event) => {
      const user = await authenticate(event);
      requirePermission('attendance:write')(user);

      const body = JSON.parse(event.body || '{}');
      const { classId, date, records } = body;

      if (!classId || !date || !Array.isArray(records)) {
        throw new BadRequestError('Class ID, date, and records array are required.');
      }

      const customId = await allocateId('att');
      const now = new Date().toISOString();

      const attendanceData = {
        id: customId,
        classId,
        date,
        records,
        markedBy: user.uid,
        createdAt: now,
        updatedAt: now
      };

      await db.collection('attendance').doc(customId).set(attendanceData);

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'ATTENDANCE_CREATE',
        targetType: 'attendance',
        targetId: customId,
        details: { classId, date }
      });

      return sendCreated(attendanceData);
    }
  },
  {
    method: 'PUT',
    path: '/api/v1/attendance/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('attendance:write')(user);

      const { id } = params;
      const body = JSON.parse(event.body || '{}');

      const attRef = db.collection('attendance').doc(id);
      const attDoc = await attRef.get();

      if (!attDoc.exists) {
        throw new NotFoundError('Attendance record not found.');
      }

      const updateData = {
        ...body,
        updatedAt: new Date().toISOString()
      };

      await attRef.update(updateData);

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'ATTENDANCE_UPDATE',
        targetType: 'attendance',
        targetId: id,
        details: updateData
      });

      const updatedDoc = await attRef.get();
      return sendSuccess(updatedDoc.data());
    }
  },
  {
    method: 'DELETE',
    path: '/api/v1/attendance/:id',
    handler: async (event, params) => {
      const user = await authenticate(event);
      requirePermission('attendance:write')(user);

      const { id } = params;
      const attRef = db.collection('attendance').doc(id);
      const attDoc = await attRef.get();

      if (!attDoc.exists) {
        throw new NotFoundError('Attendance record not found.');
      }

      await attRef.delete();

      await logAudit({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'ATTENDANCE_DELETE',
        targetType: 'attendance',
        targetId: id
      });

      return sendNoContent();
    }
  }
];
