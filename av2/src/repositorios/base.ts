import { Prisma, PrismaClient } from '@prisma/client';
import { ErroConcorrencia } from '../dominio/erros';

export type Db = PrismaClient | Prisma.TransactionClient;

export interface Pagina { pagina: number; tamanho: number }
export interface Paginado<T> { itens: T[]; total: number; pagina: number; tamanho: number }

export const skipTake = (p: Pagina) => ({ skip: (p.pagina - 1) * p.tamanho, take: p.tamanho });

export function garantirVersao(resultado: { count: number }, entidade: string, versaoLida: number): void {
  if (resultado.count === 0) {
    throw new ErroConcorrencia(
      `${entidade} foi alterado por outra requisição (versão ${versaoLida} desatualizada). Recarregue e tente de novo.`,
      { versaoLida },
    );
  }
}

export type NomeSequencia = 'seq_organizacao_codigo' | 'seq_lote_codigo' | 'seq_equipamento_codigo';

export async function proximaSequencia(db: Db, seq: NomeSequencia): Promise<number> {
  const r = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval(${seq}::regclass) AS n`;
  return Number(r[0].n);
}
