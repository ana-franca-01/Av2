import { Papel } from '@prisma/client';
import { ErroConcorrencia } from '../dominio/erros';

export interface Ator { nome: string; papel: Papel }

export type Relogio = () => Date;

export function conferirVersao(informada: number | undefined, atual: number, entidade: string): void {
  if (informada !== undefined && informada !== atual) {
    throw new ErroConcorrencia(`${entidade} está na versão ${atual}, mas a requisição foi feita sobre a versão ${informada}.`, {
      versaoAtual: atual, versaoInformada: informada,
    });
  }
}
