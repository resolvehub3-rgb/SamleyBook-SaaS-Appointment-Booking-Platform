import React, { useState } from 'react';
import { Users, Phone, Mail, Search, Calendar, MessageCircle } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';

export const CustomersView: React.FC = () => {
  const { customers, appointments } = useBusiness();
  const [search, setSearch] = useState('');

  // Combine customers from customer table with unique customers found in appointments
  const customerMap = new Map<string, { name: string; phone: string; email?: string | null; bookingsCount: number; lastDate?: string }>();

  customers.forEach((c) => {
    customerMap.set(c.phone, {
      name: c.full_name,
      phone: c.phone,
      email: c.email,
      bookingsCount: 0,
    });
  });

  appointments.forEach((a) => {
    const existing = customerMap.get(a.customer_phone);
    if (existing) {
      existing.bookingsCount += 1;
      if (!existing.lastDate || a.appointment_date > existing.lastDate) {
        existing.lastDate = a.appointment_date;
      }
    } else {
      customerMap.set(a.customer_phone, {
        name: a.customer_name,
        phone: a.customer_phone,
        email: a.customer_email,
        bookingsCount: 1,
        lastDate: a.appointment_date,
      });
    }
  });

  const customerList = Array.from(customerMap.values()).filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-zinc-900 tracking-tight">Customer Records</h2>
          <p className="text-xs text-zinc-500">
            Clients who have booked appointments with your business
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Search customers by name, phone or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
        />
      </div>

      {customerList.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-zinc-200/80 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-zinc-900">No Customer Records Yet</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            When clients book services through your QR code or booking page, their details will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-100 text-zinc-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Customer Name</th>
                  <th className="py-3.5 px-6">Phone Number</th>
                  <th className="py-3.5 px-6">Email Address</th>
                  <th className="py-3.5 px-6">Total Bookings</th>
                  <th className="py-3.5 px-6">Last Visit</th>
                  <th className="py-3.5 px-6 text-right">Quick Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {customerList.map((c, idx) => (
                  <tr key={idx} className="hover:bg-zinc-50/50 transition">
                    <td className="py-4 px-6 font-bold text-zinc-900">{c.name}</td>
                    <td className="py-4 px-6 font-mono text-zinc-700">{c.phone}</td>
                    <td className="py-4 px-6 text-zinc-500">{c.email || '—'}</td>
                    <td className="py-4 px-6">
                      <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[11px] font-bold">
                        {c.bookingsCount} booking{c.bookingsCount !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-zinc-600">{c.lastDate || '—'}</td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`tel:${c.phone}`}
                          className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:text-orange-600 hover:bg-orange-50 transition"
                          title="Call Customer"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={`https://wa.me/${c.phone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:text-emerald-600 hover:bg-emerald-50 transition"
                          title="WhatsApp Chat"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
