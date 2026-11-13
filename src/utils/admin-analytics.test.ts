import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSubscriptionPayment,
  isVerifiedSubscriptionPayment,
  computeExecutiveKPIs,
  buildAppointmentTrendSeries,
  buildAppointmentStatusBreakdown,
  buildSubscriptionRevenueSeries,
  buildBusinessGrowthSeries,
  buildBusinessCategoryDistribution,
  filterAdminAppointments,
  computeAppointmentAdminSummary,
  canTransitionAppointmentStatus,
  canRescheduleAppointment,
  isExpiringSoon,
  buildChronologicalActivityFeed,
  type AdminBusinessRecord,
  type AdminAppointmentRecord,
  type AdminSubscriptionRecord,
  type AdminPaymentRecord,
  type AdminSmsRecord,
  type AdminAuditRecord,
} from './admin-analytics.ts';

const NOW = new Date('2026-11-12T12:00:00Z');

const sampleBusinesses: AdminBusinessRecord[] = [
  {
    id: 'b1',
    owner_id: 'o1',
    name: 'Glow Studio',
    slug: 'glow-studio',
    category: 'Beauty & Wellness',
    phone: '0241111111',
    address: 'Accra',
    is_active: true,
    registration_status: 'approved',
    created_at: '2026-11-01T10:00:00Z',
  },
  {
    id: 'b2',
    owner_id: 'o2',
    name: 'Prime Cuts',
    slug: 'prime-cuts',
    category: 'Barbershop',
    phone: '0552222222',
    address: 'Kumasi',
    is_active: false,
    registration_status: 'pending',
    created_at: '2026-11-10T10:00:00Z',
  },
];

const sampleAppointments: AdminAppointmentRecord[] = [
  {
    id: 'a1a1a1a1-0000-0000-0000-000000000001',
    business_id: 'b1',
    service_id: 's1',
    customer_name: 'Ama Mensah',
    customer_phone: '0249998888',
    customer_email: 'hidden@example.com',
    appointment_date: '2026-11-12',
    appointment_time: '09:00',
    end_time: '10:00',
    status: 'confirmed',
    payment_status: 'paid',
    service_price: 80,
    payment_required: 80,
    payment_received: 80,
    created_at: '2026-11-11T09:00:00Z',
    business: { id: 'b1', name: 'Glow Studio', category: 'Beauty & Wellness' },
    service: { id: 's1', name: 'Braiding' },
  },
  {
    id: 'a2a2a2a2-0000-0000-0000-000000000002',
    business_id: 'b2',
    service_id: 's2',
    customer_name: 'Kofi Boateng',
    customer_phone: '0507776666',
    appointment_date: '2026-11-10',
    appointment_time: '14:00',
    end_time: '15:00',
    status: 'pending',
    payment_status: 'pending',
    service_price: 40,
    payment_required: 40,
    payment_received: 0,
    created_at: '2026-11-10T08:00:00Z',
    business: { id: 'b2', name: 'Prime Cuts', category: 'Barbershop' },
    service: { id: 's2', name: 'Fade Haircut' },
  },
  {
    id: 'a3a3a3a3-0000-0000-0000-000000000003',
    business_id: 'b1',
    service_id: 's1',
    customer_name: 'Esi Osei',
    customer_phone: '0273334444',
    appointment_date: '2026-10-01',
    appointment_time: '11:00',
    end_time: '12:00',
    status: 'completed',
    payment_status: 'paid',
    service_price: 80,
    payment_required: 80,
    payment_received: 80,
    created_at: '2026-10-01T08:00:00Z',
    business: { id: 'b1', name: 'Glow Studio', category: 'Beauty & Wellness' },
    service: { id: 's1', name: 'Braiding' },
  },
];

const sampleSubscriptions: AdminSubscriptionRecord[] = [
  {
    id: 'sub1',
    business_id: 'b1',
    status: 'active',
    current_period_end: '2026-11-14T12:00:00Z',
    payment_status: 'paid',
    created_at: '2026-10-15T10:00:00Z',
  },
  {
    id: 'sub2',
    business_id: 'b2',
    status: 'trialing',
    current_period_end: '2026-11-17T10:00:00Z',
    payment_status: 'none',
    created_at: '2026-11-10T10:00:00Z',
  },
];

const samplePayments: AdminPaymentRecord[] = [
  // Verified SaaS subscription payment -> MUST count
  {
    id: 'p1',
    business_id: 'b1',
    subscription_id: 'sub1',
    appointment_id: null,
    amount: 120,
    payment_provider: 'Moolre',
    status: 'successful',
    created_at: '2026-11-05T10:00:00Z',
  },
  // Pending SaaS subscription payment -> MUST NOT count
  {
    id: 'p2',
    business_id: 'b2',
    subscription_id: 'sub2',
    appointment_id: null,
    amount: 120,
    payment_provider: 'Moolre',
    status: 'pending',
    created_at: '2026-11-11T10:00:00Z',
  },
  // Failed SaaS subscription payment -> MUST NOT count
  {
    id: 'p3',
    business_id: 'b2',
    subscription_id: 'sub2',
    appointment_id: null,
    amount: 120,
    payment_provider: 'Moolre',
    status: 'failed',
    created_at: '2026-11-11T11:00:00Z',
  },
  // Customer service booking payment -> MUST NOT mix into SaaS subscription revenue
  {
    id: 'p4',
    business_id: 'b1',
    subscription_id: null,
    appointment_id: 'a1a1a1a1-0000-0000-0000-000000000001',
    amount: 80,
    payment_provider: 'Moolre',
    status: 'successful',
    created_at: '2026-11-11T12:00:00Z',
  },
];

const sampleSms: AdminSmsRecord[] = [
  {
    id: 'sms1',
    business_id: 'b1',
    notification_type: 'booking_confirmation',
    recipient: '233249998888',
    submission_status: 'accepted',
    delivery_status: 'delivered',
    created_at: '2026-11-11T09:05:00Z',
  },
  {
    id: 'sms2',
    business_id: 'b2',
    notification_type: 'appointment_reminder',
    recipient: '233507776666',
    submission_status: 'failed',
    delivery_status: 'failed',
    error_details: 'Gateway timeout',
    created_at: '2026-11-12T08:00:00Z',
  },
];

const sampleAudits: AdminAuditRecord[] = [
  {
    id: 'aud1',
    admin_id: 'adm1',
    admin_email: 'samleybook@gmail.com',
    action: 'business_approved',
    entity_type: 'business',
    entity_id: 'b1',
    created_at: '2026-11-01T11:00:00Z',
  },
];

describe('Super Admin Analytics & Business Rules', () => {
  it('strictly separates verified subscription revenue from pending/failed and booking payments', () => {
    assert.equal(isSubscriptionPayment(samplePayments[0]), true);
    assert.equal(isSubscriptionPayment(samplePayments[3]), false);

    assert.equal(isVerifiedSubscriptionPayment(samplePayments[0]), true);
    assert.equal(isVerifiedSubscriptionPayment(samplePayments[1]), false);
    assert.equal(isVerifiedSubscriptionPayment(samplePayments[2]), false);
    assert.equal(isVerifiedSubscriptionPayment(samplePayments[3]), false);

    const kpis = computeExecutiveKPIs(
      {
        businesses: sampleBusinesses,
        appointments: sampleAppointments,
        subscriptions: sampleSubscriptions,
        payments: samplePayments,
        smsNotifications: sampleSms,
      },
      30,
      NOW
    );

    assert.equal(kpis.verifiedSubscriptionRevenue, 120);
    assert.equal(kpis.subscriptionRevenueInPeriod, 120);
    assert.equal(kpis.totalBusinesses, 2);
    assert.equal(kpis.pendingRegistrations, 1);
    assert.equal(kpis.activeSubscriptions, 1);
    assert.equal(kpis.trialBusinesses, 1);
    assert.equal(kpis.smsProcessedInPeriod, 2);
    assert.equal(kpis.smsDeliveredInPeriod, 1);
    assert.equal(kpis.smsFailedInPeriod, 1);
    assert.equal(kpis.appointmentsInPeriod, 2);
  });

  it('builds real trend series and breakdowns without fabricating data', () => {
    const dailyAppts = buildAppointmentTrendSeries(sampleAppointments, 'daily', NOW);
    assert.equal(dailyAppts.length, 14);
    assert.equal(dailyAppts[dailyAppts.length - 1].value, 1); // 2026-11-12
    assert.equal(dailyAppts[dailyAppts.length - 3].value, 1); // 2026-11-10

    const breakdown = buildAppointmentStatusBreakdown(sampleAppointments);
    assert.equal(breakdown.find((x) => x.status === 'confirmed')?.count, 1);
    assert.equal(breakdown.find((x) => x.status === 'pending')?.count, 1);
    assert.equal(breakdown.find((x) => x.status === 'completed')?.count, 1);
    assert.equal(breakdown.find((x) => x.status === 'cancelled')?.count, 0);

    const revSeries = buildSubscriptionRevenueSeries(samplePayments, 'monthly', NOW);
    assert.equal(revSeries[revSeries.length - 1].value, 120);

    const bizGrowth = buildBusinessGrowthSeries(sampleBusinesses, 'monthly', NOW);
    assert.equal(bizGrowth[bizGrowth.length - 1].value, 2);

    const catDist = buildBusinessCategoryDistribution(sampleBusinesses);
    assert.equal(catDist.length, 2);
  });

  it('filters appointments across all businesses cleanly by search, business, status, service/category, and date', () => {
    const bySearch = filterAdminAppointments(sampleAppointments, {
      search: 'SB-A1A1A1',
      businessId: 'all',
      status: 'all',
      serviceOrCategory: 'all',
      dateFrom: '',
      dateTo: '',
    });
    assert.equal(bySearch.length, 1);
    assert.equal(bySearch[0].customer_name, 'Ama Mensah');

    const byBiz = filterAdminAppointments(sampleAppointments, {
      search: '',
      businessId: 'b2',
      status: 'pending',
      serviceOrCategory: 'Barbershop',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
    });
    assert.equal(byBiz.length, 1);
    assert.equal(byBiz[0].customer_name, 'Kofi Boateng');

    const summary = computeAppointmentAdminSummary(sampleAppointments, NOW);
    assert.equal(summary.todayCount, 1);
    assert.equal(summary.businessesWithBookingsToday, 1);
  });

  it('enforces safe appointment status transitions and rescheduling rules', () => {
    assert.equal(canTransitionAppointmentStatus('pending', 'confirmed').allowed, true);
    assert.equal(canTransitionAppointmentStatus('pending', 'cancelled').allowed, true);
    assert.equal(canTransitionAppointmentStatus('confirmed', 'completed').allowed, true);
    assert.equal(canTransitionAppointmentStatus('confirmed', 'pending').allowed, false);
    assert.equal(canTransitionAppointmentStatus('completed', 'cancelled').allowed, false);
    assert.equal(canTransitionAppointmentStatus('cancelled', 'confirmed').allowed, false);
    assert.equal(canRescheduleAppointment('confirmed').allowed, true);
    assert.equal(canRescheduleAppointment('completed').allowed, false);
    assert.equal(canRescheduleAppointment('cancelled').allowed, false);
  });

  it('detects expiring subscriptions accurately and builds a chronological real activity feed', () => {
    assert.equal(isExpiringSoon(sampleSubscriptions[0], NOW, 3), true);
    assert.equal(isExpiringSoon(sampleSubscriptions[1], NOW, 3), false);

    const feed = buildChronologicalActivityFeed({
      businesses: sampleBusinesses,
      appointments: sampleAppointments,
      payments: samplePayments,
      smsNotifications: sampleSms,
      auditLogs: sampleAudits,
    });
    assert.ok(feed.length > 0);
    for (let i = 1; i < feed.length; i++) {
      assert.ok(new Date(feed[i - 1].timestamp).getTime() >= new Date(feed[i].timestamp).getTime());
    }
  });
});
