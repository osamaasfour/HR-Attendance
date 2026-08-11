/**
 * HR requests — vacation, sick, unpaid, business trip, early leave, late arrive, missing
 * Collection: hrRequests (also reads legacy leaveRequests for display migration)
 */

import { useCallback, useEffect, useState } from 'react';
import {
  db,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  Timestamp,
} from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import {
  computeRemainingVacation,
  resolveAnnualLeaveAllowance,
  resolveLeaveBalanceAdjustment,
} from '../utils/leaveBalance';
import { trySendAppEmail } from '../utils/sendEmail';
import { requestTypeKey, translations, translate } from '../i18n/translations';
import type { HrRequest, HrRequestStatus, HrRequestType } from '../types';

function daysBetween(start: string, end: string): number {
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  const diff = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

export const HR_REQUEST_TYPES: HrRequestType[] = [
  'vacation',
  'sick',
  'unpaid',
  'business_trip',
  'early_leave',
  'late_arrive',
  'missing',
];

/** English fallback label for non-React / stored notification text */
export function labelForRequestType(type: HrRequestType | string): string {
  return translations.en[requestTypeKey(type)];
}

async function loadUserEmail(uid: string | null | undefined): Promise<string | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const email = (snap.data() as any)?.email;
    return typeof email === 'string' ? email : null;
  } catch {
    return null;
  }
}

export function useHrRequests() {
  const { user } = useAuth();
  const [myRequests, setMyRequests] = useState<HrRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<HrRequest[]>([]);
  const [teamRequests, setTeamRequests] = useState<HrRequest[]>([]);
  const [usedVacationDays, setUsedVacationDays] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const refreshMine = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const q = query(
        collection(db, 'hrRequests'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      let rows = snap.docs.map((d) => ({ ...(d.data() as HrRequest), id: d.id }));

      if (rows.length === 0) {
        try {
          const legacy = await getDocs(
            query(
              collection(db, 'leaveRequests'),
              where('userId', '==', user.uid),
              orderBy('createdAt', 'desc'),
            ),
          );
          rows = legacy.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              userId: data.userId,
              userName: data.userName,
              employeeId: data.employeeId,
              type: data.type === 'annual' ? 'vacation' : data.type,
              startDate: data.startDate,
              endDate: data.endDate,
              days: data.days,
              reason: data.reason,
              status: data.status,
              reviewedBy: data.reviewedBy,
              reviewedAt: data.reviewedAt,
              createdAt: data.createdAt,
            } as HrRequest;
          });
        } catch {
          /* ignore legacy */
        }
      }

      setMyRequests(rows);
      const year = new Date().getFullYear().toString();
      const used = rows
        .filter(
          (r) =>
            r.type === 'vacation' &&
            r.status === 'approved' &&
            r.startDate?.startsWith(year),
        )
        .reduce((sum, r) => sum + (r.days || 0), 0);
      setUsedVacationDays(used);
    } catch (error) {
      console.error('[HrRequests] mine failed', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const refreshPending = useCallback(async () => {
    if (!user) return;
    if (user.role !== 'admin' && user.role !== 'manager') return;
    setIsLoading(true);
    try {
      let q;
      if (user.role === 'admin') {
        q = query(
          collection(db, 'hrRequests'),
          where('status', '==', 'pending'),
          orderBy('createdAt', 'desc'),
        );
      } else {
        q = query(
          collection(db, 'hrRequests'),
          where('managerId', '==', user.uid),
          where('status', '==', 'pending'),
          orderBy('createdAt', 'desc'),
        );
      }
      const snap = await getDocs(q);
      const tid = user.tenantId || 'default';
      setPendingRequests(
        snap.docs
          .map((d) => ({ ...(d.data() as HrRequest), id: d.id }))
          .filter((r) => (r.tenantId || 'default') === tid),
      );
    } catch (error) {
      console.error('[HrRequests] pending failed', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  /** All statuses for manager team / admin — status & history dashboard */
  const refreshTeam = useCallback(async () => {
    if (!user) return;
    if (user.role !== 'admin' && user.role !== 'manager') return;
    setIsLoading(true);
    try {
      let q;
      if (user.role === 'admin') {
        q = query(collection(db, 'hrRequests'), orderBy('createdAt', 'desc'));
      } else {
        q = query(
          collection(db, 'hrRequests'),
          where('managerId', '==', user.uid),
          orderBy('createdAt', 'desc'),
        );
      }
      const snap = await getDocs(q);
      const tid = user.tenantId || 'default';
      setTeamRequests(
        snap.docs
          .map((d) => ({ ...(d.data() as HrRequest), id: d.id }))
          .filter((r) => (r.tenantId || 'default') === tid),
      );
    } catch (error) {
      console.error('[HrRequests] team failed', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const submitRequest = useCallback(
    async (input: {
      type: HrRequestType;
      startDate: string;
      endDate: string;
      reason: string;
      plannedTime?: string;
      minutes?: number;
      location?: string;
      attachmentUrl?: string;
      attachmentName?: string;
      attachmentPath?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const isSingleDay = ['early_leave', 'late_arrive', 'missing'].includes(input.type);
      const startDate = input.startDate;
      const endDate = isSingleDay ? input.startDate : input.endDate;
      const days = daysBetween(startDate, endDate);
      const typeLabel = labelForRequestType(input.type);

      await addDoc(collection(db, 'hrRequests'), {
        userId: user.uid,
        userName: user.fullName,
        employeeId: user.employeeId,
        departmentId: user.departmentId || user.department || null,
        managerId: user.managerId || null,
        tenantId: user.tenantId || 'default',
        type: input.type,
        startDate,
        endDate,
        date: startDate,
        days,
        reason: input.reason,
        plannedTime: input.plannedTime || null,
        minutes: input.minutes ?? null,
        location: input.location || null,
        attachmentUrl: input.attachmentUrl || null,
        attachmentName: input.attachmentName || null,
        attachmentPath: input.attachmentPath || null,
        status: 'pending' as HrRequestStatus,
        createdAt: Timestamp.now(),
      });

      await addDoc(collection(db, 'notifications'), {
        userId: user.uid,
        title: translations.en.notifRequestSubmittedTitle,
        body: translate('en', 'notifRequestSubmittedBody', { type: typeLabel }),
        read: false,
        type: 'request_submitted',
        createdAt: Timestamp.now(),
      });

      if (user.managerId) {
        await addDoc(collection(db, 'notifications'), {
          userId: user.managerId,
          title: translations.en.notifApprovalNeededTitle,
          body: translate('en', 'notifApprovalNeededBody', {
            name: user.fullName,
            type: typeLabel,
          }),
          read: false,
          type: 'request_submitted',
          createdAt: Timestamp.now(),
        });

        const managerEmail = await loadUserEmail(user.managerId);
        const dateLine =
          endDate && endDate !== startDate
            ? `${startDate} → ${endDate}`
            : startDate;
        await trySendAppEmail({
          to: managerEmail,
          tenantId: user.tenantId || 'default',
          subject: `HR Approval: ${typeLabel} — ${user.fullName}`,
          text: [
            `${user.fullName} (${user.employeeId || user.email || ''}) submitted a new ${typeLabel} request.`,
            `Dates: ${dateLine}`,
            input.plannedTime ? `Time: ${input.plannedTime}` : '',
            input.minutes != null ? `Minutes: ${input.minutes}` : '',
            input.location ? `Location: ${input.location}` : '',
            `Reason: ${input.reason}`,
            '',
            'Please open the HR Attendance app → Approvals to review.',
          ]
            .filter(Boolean)
            .join('\n'),
          html: `<p><strong>${user.fullName}</strong> submitted a <strong>${typeLabel}</strong> request.</p>
<p>Dates: ${dateLine}<br/>Reason: ${input.reason}</p>
<p>Open the HR Attendance app → Approvals to review.</p>`,
        });
      }

      await refreshMine();
    },
    [user, refreshMine],
  );

  const decideRequest = useCallback(
    async (requestId: string, status: 'approved' | 'rejected', targetUserId: string) => {
      if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
        throw new Error('Not authorized');
      }
      await updateDoc(doc(db, 'hrRequests', requestId), {
        status,
        reviewedBy: user.uid,
        reviewedAt: Timestamp.now(),
        tenantId: user.tenantId || 'default',
      });
      await addDoc(collection(db, 'notifications'), {
        userId: targetUserId,
        title:
          status === 'approved'
            ? translations.en.notifApprovedTitle
            : translations.en.notifRejectedTitle,
        body:
          status === 'approved'
            ? translations.en.notifApprovedBody
            : translations.en.notifRejectedBody,
        read: false,
        type: 'request_decision',
        createdAt: Timestamp.now(),
      });

      const employeeEmail = await loadUserEmail(targetUserId);
      await trySendAppEmail({
        to: employeeEmail,
        tenantId: user.tenantId || 'default',
        subject: `HR request ${status}`,
        text: `Your HR request was ${status} by ${user.fullName}.`,
        html: `<p>Your HR request was <strong>${status}</strong> by ${user.fullName}.</p>`,
      });

      await Promise.all([refreshPending(), refreshTeam()]);
    },
    [user, refreshPending, refreshTeam],
  );

  useEffect(() => {
    refreshMine();
    refreshPending();
    refreshTeam();
  }, [refreshMine, refreshPending, refreshTeam]);

  const vacationAllowance = resolveAnnualLeaveAllowance(user);
  const leaveAdjustment = resolveLeaveBalanceAdjustment(user);
  const remainingVacation = computeRemainingVacation(
    vacationAllowance,
    usedVacationDays,
    leaveAdjustment,
  );

  return {
    myRequests,
    pendingRequests,
    teamRequests,
    usedVacationDays,
    remainingVacation,
    vacationAllowance,
    leaveBalanceAdjustment: leaveAdjustment,
    isLoading,
    submitRequest,
    decideRequest,
    refreshMine,
    refreshPending,
    refreshTeam,
  };
}

/** Back-compat alias used by older screens during migration */
export function useLeave() {
  const hr = useHrRequests();
  return {
    myRequests: hr.myRequests as any,
    pendingRequests: hr.pendingRequests as any,
    usedAnnualDays: hr.usedVacationDays,
    remainingAnnual: hr.remainingVacation,
    annualAllowance: hr.vacationAllowance,
    isLoading: hr.isLoading,
    submitLeave: async (input: {
      type: 'annual' | 'sick' | 'unpaid';
      startDate: string;
      endDate: string;
      reason: string;
    }) =>
      hr.submitRequest({
        ...input,
        type: input.type === 'annual' ? 'vacation' : input.type,
      }),
    decideLeave: hr.decideRequest,
    refreshMine: hr.refreshMine,
    refreshPending: hr.refreshPending,
  };
}
