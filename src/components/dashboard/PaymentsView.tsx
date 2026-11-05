import React, { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, Clock, XCircle, Search, ExternalLink } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';
import { formatGHS } from '../../utils/booking-logic';
import { PaymentTransaction } from '../../types/database';

export const PaymentsView: React.FC = () => {
  const { currentBusiness, appointments } = useBusiness();
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!currentBusiness) return;
      const supabase = getSupabase();
      if (!supabase) return;

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

  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="text-xl font-black text-zinc-900 tracking-tight">Payment Records & Settlement</h2>
        <p className="text-xs text-zinc-500">
          Transaction history and verified payment receipts processed through Moolre
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/80 shadow-xs space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Total Revenue Collected
          </span>
          <p className="text-2xl font-black text-zinc-900">{formatGHS(totalCollected)}</p>
          <p className="text-[11px] text-zinc-500">From all completed and confirmed bookings</p>
        </div>

        <div className="p-6 rounded-3xl bg-white border border-zinc-200/80 shadow-xs space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Payment Gateway Provider
          </span>
          <p className="text-2xl font-black text-orange-600">Moolre</p>
          <p className="text-[11px] text-zinc-500">Mobile Money direct merchant workflow</p>
        </div>

        <div className="p-6 rounded-3xl bg-white border border-zinc-200/80 shadow-xs space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Recorded Transactions
          </span>
          <p className="text-2xl font-black text-zinc-900">
            {transactions.length || appointments.filter((a) => a.payment_received > 0).length}
          </p>
          <p className="text-[11px] text-zinc-500">Verified server-side payments</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900">Transaction History</h3>
            <p className="text-xs text-zinc-500">Real-time payment logs</p>
          </div>
        </div>

        {transactions.length === 0 && appointments.filter((a) => a.payment_received > 0).length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
              <CreditCard className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-zinc-900">No payment records yet</h4>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              When clients pay for bookings through Moolre, the verified transactions will be logged here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-100 text-zinc-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">Customer Phone</th>
                  <th className="py-3.5 px-6">Provider</th>
                  <th className="py-3.5 px-6">Reference</th>
                  <th className="py-3.5 px-6">Amount</th>
                  <th className="py-3.5 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {transactions.length > 0 ? (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-zinc-50/50 transition">
                      <td className="py-4 px-6 text-zinc-600">
                        {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-4 px-6 font-mono font-bold text-zinc-800">
                        {tx.customer_phone}
                      </td>
                      <td className="py-4 px-6 font-semibold text-zinc-700">
                        {tx.payment_provider}
                      </td>
                      <td className="py-4 px-6 font-mono text-[11px] text-zinc-500">
                        {tx.moolre_reference || tx.id.substring(0, 8)}
                      </td>
                      <td className="py-4 px-6 font-bold text-zinc-900">
                        {formatGHS(tx.amount)}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            tx.status === 'successful'
                              ? 'bg-emerald-50 text-emerald-700'
                              : tx.status === 'pending'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
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
                      <tr key={a.id} className="hover:bg-zinc-50/50 transition">
                        <td className="py-4 px-6 text-zinc-600">{a.appointment_date}</td>
                        <td className="py-4 px-6 font-mono font-bold text-zinc-800">{a.customer_phone}</td>
                        <td className="py-4 px-6 font-semibold text-zinc-700">Moolre MoMo</td>
                        <td className="py-4 px-6 font-mono text-[11px] text-zinc-500">
                          {a.id.substring(0, 8)}
                        </td>
                        <td className="py-4 px-6 font-bold text-zinc-900">{formatGHS(a.payment_received)}</td>
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
