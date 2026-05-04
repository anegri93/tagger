import { categorias } from '../schema/index.js';
import type { LoaderConfig } from './csv.js';

interface CategoriaRow {
  slug: string;
  nombre: string;
  descripcion?: string;
}

const DEFAULTS: CategoriaRow[] = [
  { slug: 'alimentacion', nombre: 'Alimentación' },
  { slug: 'supermercado', nombre: 'Supermercado' },
  { slug: 'combustible', nombre: 'Combustible' },
  { slug: 'farmacia', nombre: 'Farmacia' },
  { slug: 'restaurante', nombre: 'Restaurante' },
  { slug: 'transporte', nombre: 'Transporte' },
  { slug: 'salud', nombre: 'Salud' },
  { slug: 'educacion', nombre: 'Educación' },
  { slug: 'hogar', nombre: 'Hogar' },
  { slug: 'servicios', nombre: 'Servicios' },
  { slug: 'entretenimiento', nombre: 'Entretenimiento' },
  { slug: 'ropa', nombre: 'Ropa' },
  { slug: 'tecnologia', nombre: 'Tecnología' },
  { slug: 'viajes', nombre: 'Viajes' },
  { slug: 'financiero', nombre: 'Financiero' },
  { slug: 'azar', nombre: 'Azar y apuestas' },
  { slug: 'transferencia', nombre: 'Transferencias P2P' },
  { slug: 'otros', nombre: 'Otros' },
];

export const categoriasLoaderConfig: LoaderConfig<
  CategoriaRow & Record<string, string>,
  { slug: string; nombre: string; descripcion: string | null }
> = {
  table: categorias,
  tableName: 'categorias',
  data: DEFAULTS as never,
  mapRow(row) {
    return {
      slug: row.slug,
      nombre: row.nombre,
      descripcion: row.descripcion ?? null,
    };
  },
  upsert: {
    target: categorias.slug,
    setUpdate: (r) => ({
      nombre: r.nombre,
      descripcion: r.descripcion,
      updatedAt: new Date(),
    }),
  },
};
