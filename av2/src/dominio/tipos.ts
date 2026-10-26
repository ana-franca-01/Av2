import {
  ClasseTriagem, EstadoFisico, Papel, StatusEquipamento, TipoEquipamento, TipoOrganizacao,
} from '@prisma/client';
import { ErroValidacao } from './erros';

export { ClasseTriagem, EstadoFisico, Papel, StatusEquipamento, TipoEquipamento, TipoOrganizacao };

export const PAPEIS = Object.values(Papel);
export const TIPOS_ORG = Object.values(TipoOrganizacao);
export const TIPOS_EQUIP = Object.values(TipoEquipamento);
export const ESTADOS = Object.values(EstadoFisico);
export const STATUS = Object.values(StatusEquipamento);
export const CLASSES_TRIAGEM = Object.values(ClasseTriagem);

export const PESO_ESTADO: Record<EstadoFisico, number> = { EXCELENTE: 4, BOM: 3, REGULAR: 2, RUIM: 1, SUCATA: 0 };

export const TRANSICOES: Record<StatusEquipamento, StatusEquipamento[]> = {
  RECEBIDO: ['EM_TRIAGEM'],
  EM_TRIAGEM: ['TRIADO'],
  TRIADO: ['EM_DESMONTE', 'REUTILIZADO', 'DESCARTADO'],
  EM_DESMONTE: ['RECICLADO', 'REUTILIZADO', 'DESCARTADO'],
  REUTILIZADO: [], RECICLADO: [], DESCARTADO: [],
};

export const statusFinal = (s: StatusEquipamento): boolean => TRANSICOES[s].length === 0;

export function normalizarEnum<T extends string>(valor: string, validos: readonly T[], rotulo: string): T {
  const v = valor.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!(validos as readonly string[]).includes(v)) {
    throw new ErroValidacao(`${rotulo} inválido "${valor}". Valores aceitos: ${validos.join(', ')}.`);
  }
  return v as T;
}
