import React from 'react';

export const StatusBar = () => (
  <div className="statusbar">
    <span>15:36</span>
    <div className="right">
      <div className="bars"><i /><i /><i /><i /></div>
      <span style={{ fontWeight: 700, fontSize: 13 }}>LTE</span>
      <div className="batt"><i style={{ width: '85%' }} /></div>
    </div>
  </div>
);

export const QR = ({ size = 28, color = '#fff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" />
    <rect x="14" y="14" width="3" height="3" fill={color} />
    <rect x="18" y="14" width="3" height="3" fill={color} />
    <rect x="14" y="18" width="3" height="3" fill={color} />
    <rect x="18" y="18" width="3" height="3" fill={color} />
  </svg>
);

export const Shell = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff7e1">
    <path d="M12 3c-5 0-8 3.5-8 8 0 2 1 5 3 6 0-2 1-4 2-4-1 1-1 3 0 4 1-3 3-4 3-4s-2 3-1 5c2-2 3-5 3-7 1 2 2 4 1 6 2-1 3-4 3-6 0-5-3-8-6-8z" />
  </svg>
);

export const Headset = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M4 14v-3a8 8 0 0116 0v3" stroke="#1877f2" strokeWidth="2" strokeLinecap="round" />
    <rect x="2.5" y="13" width="5" height="7" rx="1.5" fill="#1877f2" />
    <rect x="16.5" y="13" width="5" height="7" rx="1.5" fill="#1877f2" />
  </svg>
);

export const Recarga = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="7" width="15" height="10" rx="2" fill="#fff" />
    <circle cx="18" cy="18" r="4" fill="#fff" />
    <path d="M18 16v4M16 18h4" stroke="#0f56c9" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const Envia = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
    <path d="M15 5h5v5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 5L12 13" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M9 19H4v-5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 19l8-8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const Efectiviza = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="7" width="18" height="11" rx="2" fill="#fff" />
    <circle cx="12" cy="12.5" r="2.4" fill="#0f56c9" />
    <path d="M12 19v3M9 21l3-2 3 2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const MiCred = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="3.2" fill="#fff" />
    <path d="M4 20c2-4 14-4 16 0" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export const Bank = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
    <path d="M3 10l9-5 9 5" stroke="#1877f2" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M5 10v7M9 10v7M15 10v7M19 10v7" stroke="#1877f2" strokeWidth="1.8" />
    <path d="M3 19h18" stroke="#1877f2" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const Alias = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
    <circle cx="10" cy="8" r="3.4" stroke="#1877f2" strokeWidth="1.8" />
    <path d="M3 20c1.5-3.5 12-3.5 13 0" stroke="#1877f2" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M18 6l2 2M20 6l-2 2" stroke="#1877f2" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export function MovIcon({ type }: { type: 'qr' | 'bn' | 'shell' }) {
  if (type === 'qr') return <div className="ic qr"><QR size={22} /></div>;
  if (type === 'bn') return <div className="ic bn">BN</div>;
  if (type === 'shell') return <div className="ic shell"><Shell size={24} /></div>;
  return <div className="ic bn">·</div>;
}
