/**
 * Shared visual design tokens matching the SamleyBook Dashboard UI Reference.
 */
export const DASHBOARD_COLORS = {
  brandOrange: '#F95700',
  brandOrangeHover: '#E04D00',
  brandOrangeSoft: '#FFF3EC',
  sidebarNavy: '#0E1733',
  sidebarCardBg: '#162244',
  canvasBg: '#F5F6FA',
  cardBg: '#FFFFFF',
  borderSubtle: '#E2E8F0',
  textPrimary: '#111827',
  textSecondary: '#64748B',
} as const;

export const KPI_CARD_THEMES = {
  total: {
    cardBg: 'bg-gradient-to-br from-[#FFF6EE] via-[#FFF1E5] to-[#FFE7D4]',
    border: 'border-[#FADAC1]',
    iconBg: 'bg-white/90 text-[#F95700] shadow-xs',
    stroke: '#F95700',
    fillStart: 'rgba(249, 87, 0, 0.24)',
    fillEnd: 'rgba(249, 87, 0, 0.02)',
    deltaPositive: 'text-[#EA580C]',
  },
  confirmed: {
    cardBg: 'bg-gradient-to-br from-[#F2F7FF] via-[#E8F1FF] to-[#DCEBFF]',
    border: 'border-[#C7DDFC]',
    iconBg: 'bg-[#2563EB] text-white shadow-xs',
    stroke: '#2563EB',
    fillStart: 'rgba(37, 99, 235, 0.22)',
    fillEnd: 'rgba(37, 99, 235, 0.02)',
    deltaPositive: 'text-[#2563EB]',
  },
  pending: {
    cardBg: 'bg-gradient-to-br from-[#FFFBEB] via-[#FEF5D6] to-[#FDEEC2]',
    border: 'border-[#FDE293]',
    iconBg: 'bg-[#F59E0B] text-white shadow-xs',
    stroke: '#D97706',
    fillStart: 'rgba(217, 119, 6, 0.22)',
    fillEnd: 'rgba(217, 119, 6, 0.02)',
    deltaPositive: 'text-[#D97706]',
  },
  completed: {
    cardBg: 'bg-gradient-to-br from-[#ECFDF5] via-[#DFFAE9] to-[#CEFAE0]',
    border: 'border-[#A7F3D0]',
    iconBg: 'bg-[#16A34A] text-white shadow-xs',
    stroke: '#16A34A',
    fillStart: 'rgba(22, 163, 74, 0.22)',
    fillEnd: 'rgba(22, 163, 74, 0.02)',
    deltaPositive: 'text-[#16A34A]',
  },
  cancelled: {
    cardBg: 'bg-gradient-to-br from-[#FFF1F2] via-[#FFE6E8] to-[#FFDADB]',
    border: 'border-[#FECDD3]',
    iconBg: 'bg-[#EF4444] text-white shadow-xs',
    stroke: '#DC2626',
    fillStart: 'rgba(220, 38, 38, 0.22)',
    fillEnd: 'rgba(220, 38, 38, 0.02)',
    deltaPositive: 'text-[#DC2626]',
  },
} as const;

export const SURFACE_CARD =
  'bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_10px_rgba(15,23,42,0.04)]';

export const PRIMARY_ORANGE_BTN =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B1A] to-[#EA580C] hover:from-[#F95700] hover:to-[#D94E04] text-white font-bold shadow-[0_4px_12px_rgba(249,87,0,0.22)] transition-all active:scale-[0.98] disabled:opacity-50';
