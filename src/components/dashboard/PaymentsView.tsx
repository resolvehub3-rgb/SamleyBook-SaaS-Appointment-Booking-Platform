import React, { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, Activity } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';
import { formatGHS } from '../../utils/booking-logic';
import { PaymentTransaction } from '../../types/database';
import { SURFACE_CARD } from './ui/DashboardTokens';

export const PaymentsView: React.FC = () => {
  const { currentBusiness, appointments } = useBusiness();
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!currentBusiness) {
        setLoading(false);
        return;
      }
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('payment_transactions')
          .select('*')
          .eq('business_id', currentBusiness.id)
          .order('created_at', { ascending: false });

        if (data) {
          setTransactions(data as PaymentTransaction[]);
        }
      } catch (err) {
        console.error('Error loading transactions:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [currentBusiness]);

  const totalCollected = appointments.reduce(
    (sum, a) => sum + Number(a.payment_received || 0),
    0
  );
  const txCount = transactions.length || appointments.filter((a) => a.payment_received > 0).length;

  return (
    <div className="space-y-6 text-left">
      {/* Pastel Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#ECFDF5] to-[#CEFAE0] border border-[#A7F3D0] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Total Revenue Collected
            </span>
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-[#111827]">{formatGHS(totalCollected)}</p>
          <p className="text-[11px] text-emerald-900/75">From all completed and confirmed bookings</p>
        </div>

        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#FFF6EE] to-[#FFE7D4] border border-[#FADAC1] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-orange-900">
              Payment Gateway Provider
            </span>
            <div className="w-8 h-8 rounded-full bg-[#F95700] text-white flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-[#F95700]">Moolre</p>
          <p className="text-[11px] text-orange-950/70">Mobile Money direct merchant workflow</p>
        </div>

        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#F2F7FF] to-[#DCEBFF] border border-[#C7DDFC] shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900">
              Recorded Transactions
            </span>
            <div className="w-8 h-8 rounded-full bg-[#2563EB] text-white flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-[#111827]">{loading ? '—' : txCount}</p>
          <p className="text-[11px] text-blue-950/70">Verified server-side payments</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className={`${SURFACE_CARD} overflow-hidden`}>
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-[#111827]">Transaction History</h3>
            <p className="text-xs text-slate-500">Real-time payment logs</p>
          </div>
        </div>

        {transactions.length === 0 && appointments.filter((a) => a.payment_received > 0).length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center mx-auto">
              <CreditCard className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-extrabold text-[#111827]">No payment records yet</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              When clients pay for bookings through Moolre, the verified transactions will be logged here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">Customer Phone</th>
                  <th className="py-3.5 px-6">Provider</th>
                  <th className="py-3.5 px-6">Reference</th>
                  <th className="py-3.5 px-6">Amount</th>
                  <th className="py-3.5 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.length > 0 ? (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-4 px-6 text-slate-600">
                        {new Date(tx.created_at).toLocaleDateString()}{' '}
                        {new Date(tx.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-4 px-6 font-mono font-bold text-[#111827]">
                        {tx.customer_phone}
                      </td>
                      <td className="py-4 px-6 font-semibold text-slate-700">
                        {tx.payment_provider}
                      </td>
                      <td className="py-4 px-6 font-mono text-[11px] text-slate-500">
                        {tx.moolre_reference || tx.id.substring(0, 8)}
                      </td>
                      <td className="py-4 px-6 font-extrabold text-[#111827]">
                        {formatGHS(tx.amount)}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                            tx.status === 'successful'
                              ? 'bg-emerald-50 text-emerald-700'
                              : tx.status === 'pending'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  appointments
                    .filter((a) => a.payment_received > 0)
                    .map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-4 px-6 text-slate-600">{a.appointment_date}</td>
                        <td className="py-4 px-6 font-mono font-bold text-[#111827]">
                          {a.customer_phone}
                        </td>
                        <td className="py-4 px-6 font-semibold text-slate-700">Moolre MoMo</td>
                        <td className="py-4 px-6 font-mono text-[11px] text-slate-500">
                          {a.id.substring(0, 8)}
                        </td>
                        <td className="py-4 px-6 font-extrabold text-[#111827]">
                          {formatGHS(a.payment_received)}
                        </td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                            successful
                          </span>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
