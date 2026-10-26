import { ErroValidacao } from '../dominio/erros';
import { FonteDepreciacao } from '../dominio/equipamentos';
import { UnidadeDeTrabalho } from '../repositorios/repositorios';
import { parametroDTO } from './apresentacao';
import { Ator, conferirVersao } from './comum';

export const PARAMETROS_PADRAO: Record<string, number> = {
  'aliquota.icms': 18, 'aliquota.iss': 5, 'aliquota.pis_cofins': 9.25,
  'depreciacao.COMPUTADOR': 20, 'depreciacao.SERVIDOR': 20, 'depreciacao.MONITOR': 20,
  'depreciacao.TELECOM': 10, 'depreciacao.PERIFERICO': 20, 'depreciacao.OUTRO': 10,
};

export class ParametroServico {
  constructor(private readonly uow: UnidadeDeTrabalho) {}

  async listar() {
    const mapa = new Map<string, ReturnType<typeof parametroDTO>>();
    for (const [chave, valor] of Object.entries(PARAMETROS_PADRAO)) {
      mapa.set(chave, { chave, valor, atualizadoEm: null, atualizadoPor: '(padrão)', versao: 0 });
    }
    for (const p of await this.uow.leitura.parametros.listar()) mapa.set(p.chave, parametroDTO(p));
    return [...mapa.values()].sort((a, b) => a.chave.localeCompare(b.chave));
  }

  async fonteDepreciacao(): Promise<FonteDepreciacao> {
    const valores = new Map((await this.listar()).map((p) => [p.chave, p.valor]));
    return (tipo) => valores.get(`depreciacao.${tipo}`);
  }

  async definir(ator: Ator, chave: string, valor: number, versao?: number) {
    if (!/^(aliquota|depreciacao)\.[A-Za-z0-9_]{1,40}$/.test(chave)) {
      throw new ErroValidacao('Chave inválida. Use "aliquota.<nome>" ou "depreciacao.<TIPO>".');
    }
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) throw new ErroValidacao('Valor inválido: informe um percentual entre 0 e 100.');
    return this.uow.executar(async (r) => {
      const atual = await r.parametros.buscar(chave);
      conferirVersao(versao, atual?.versao ?? 0, 'Parâmetro');
      const p = atual ? await r.parametros.atualizar(chave, atual.versao, valor, ator.nome) : await r.parametros.criar(chave, valor, ator.nome);
      await r.auditoria.registrar(ator.nome, 'PARAM_DEFINIR', `${chave} = ${valor}`);
      return parametroDTO(p);
    });
  }
}
