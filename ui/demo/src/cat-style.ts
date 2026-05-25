export interface CatStyle {
  label: string;
  cls: string;
  emoji: string;
  color: string;
}

const FALLBACK: CatStyle = { label: 'Otros', cls: 'otros', emoji: '📦', color: '#5a6b85' };

const BY_SLUG: Record<string, CatStyle> = {
  supermercado: { label: 'Supermercado', cls: 'super', emoji: '🛒', color: '#e91e63' },
  combustible: { label: 'Combustible', cls: 'comb', emoji: '⛽', color: '#ffb547' },
  transferencia: { label: 'Transferencias', cls: 'trans', emoji: '💸', color: '#16c6a4' },
  restaurante: { label: 'Restaurante', cls: 'rest', emoji: '🍔', color: '#7c5cff' },
  cafeteria: { label: 'Cafetería', cls: 'rest', emoji: '☕', color: '#a16ad8' },
  alimentacion: { label: 'Alimentación', cls: 'rest', emoji: '🥖', color: '#7c5cff' },
  farmacia: { label: 'Farmacia', cls: 'otros', emoji: '💊', color: '#1a8f6a' },
  salud: { label: 'Salud', cls: 'otros', emoji: '🏥', color: '#1a8f6a' },
  tecnologia: { label: 'Tecnología', cls: 'otros', emoji: '💻', color: '#1877f2' },
  hogar: { label: 'Hogar', cls: 'otros', emoji: '🏠', color: '#a76b00' },
  ropa: { label: 'Ropa', cls: 'otros', emoji: '👕', color: '#c2185b' },
  entretenimiento: { label: 'Entretenimiento', cls: 'otros', emoji: '🎬', color: '#7c5cff' },
  transporte: { label: 'Transporte', cls: 'otros', emoji: '🚌', color: '#0f56c9' },
  viajes: { label: 'Viajes', cls: 'otros', emoji: '✈️', color: '#0f56c9' },
  servicios: { label: 'Servicios', cls: 'otros', emoji: '🧾', color: '#5a6b85' },
  educacion: { label: 'Educación', cls: 'otros', emoji: '📚', color: '#0f56c9' },
  mascotas: { label: 'Mascotas', cls: 'otros', emoji: '🐾', color: '#a76b00' },
  belleza: { label: 'Belleza', cls: 'otros', emoji: '💅', color: '#c2185b' },
  deportes: { label: 'Deportes', cls: 'otros', emoji: '🏋️', color: '#1a8f6a' },
  azar: { label: 'Azar', cls: 'otros', emoji: '🎰', color: '#c2185b' },
  cripto: { label: 'Cripto', cls: 'otros', emoji: '₿', color: '#ffb547' },
  agro: { label: 'Agro', cls: 'otros', emoji: '🌾', color: '#1a8f6a' },
  automotor: { label: 'Automotor', cls: 'otros', emoji: '🚗', color: '#0f56c9' },
  comercial: { label: 'Comercial', cls: 'otros', emoji: '🏢', color: '#5a6b85' },
  construccion: { label: 'Construcción', cls: 'otros', emoji: '🏗️', color: '#a76b00' },
  financiero: { label: 'Financiero', cls: 'otros', emoji: '🏦', color: '#0f56c9' },
  floreria: { label: 'Florería', cls: 'otros', emoji: '💐', color: '#c2185b' },
  funeraria: { label: 'Funeraria', cls: 'otros', emoji: '🕯️', color: '#5a6b85' },
  inmobiliaria: { label: 'Inmobiliaria', cls: 'otros', emoji: '🏘️', color: '#a76b00' },
  libreria: { label: 'Librería', cls: 'otros', emoji: '📒', color: '#0f56c9' },
  medios: { label: 'Medios', cls: 'otros', emoji: '📰', color: '#5a6b85' },
  optica: { label: 'Óptica', cls: 'otros', emoji: '👓', color: '#0f56c9' },
  religioso: { label: 'Religioso', cls: 'otros', emoji: '⛪', color: '#5a6b85' },
  seguros: { label: 'Seguros', cls: 'otros', emoji: '🛡️', color: '#0f56c9' },
  tabaco: { label: 'Tabaco', cls: 'otros', emoji: '🚬', color: '#5a6b85' },
  otros: FALLBACK,
  'sin-categoria': { label: 'Sin categoría', cls: 'otros', emoji: '❔', color: '#9aa6b7' },
};

export function catStyle(slug: string | null | undefined): CatStyle {
  if (!slug) return FALLBACK;
  return BY_SLUG[slug] ?? { ...FALLBACK, label: slug };
}
