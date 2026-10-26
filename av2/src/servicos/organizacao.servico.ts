import { Prisma } from '@prisma/client';
import { diaOrdinal, parseData, paraDate } from '../dominio/datas';
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from '../dominio/erros';
import { TIPOS_ORG, normalizarEnum } from '../dominio/tipos';
import { ValidadorCNPJ } from '../dominio/validadores';
import { Pagina, Paginado } from '../repositorios/base';
import { Repositorios, UnidadeDeTrabalho } from '../repositorios/repositorios';
import { contratoDTO, organizacaoDTO } from './apresentacao';
import { Ator, conferirVersao } from './comum';

export interface Clausula { titulo: string; texto: string }
export interface DadosContrato {
  inicio: string; fim: string; prazoArmazenamentoDias: number; descricao?: string; clausulas?: Clausula[]; versao?: number;
}

type OrgDTO = ReturnType<typeof organizacaoDTO>;

export class OrganizacaoServico {
  private readonly vCnpj = new ValidadorCNPJ();
  constructor(private readonly uow: UnidadeDeTrabalho) {}

  static async buscar(r: Repositorios, codigo: string) {
    const o = await r.organizacoes.buscarPorCodigo(codigo.trim().toUpperCase());
    if (!o) throw new ErroNaoEncontrado(`Organização "${codigo}" não encontrada.`);
    return o;
  }

  async listar(p: Pagina, filtro: { ativa?: boolean; busca?: string }): Promise<Paginado<OrgDTO>> {
    const { itens, total } = await this.uow.leitura.organizacoes.listar(p, filtro);
    return { itens: itens.map(organizacaoDTO), total, ...p };
  }

  async obter(codigo: string) { return organizacaoDTO(await OrganizacaoServico.buscar(this.uow.leitura, codigo)); }

  async criar(ator: Ator, d: { cnpj: string; nome: string; tipo: string }) {
    this.vCnpj.exigir(d.cnpj);
    const cnpj = ValidadorCNPJ.normalizar(d.cnpj);
    const nome = d.nome.trim();
    if (nome.length < 3 || nome.length > 120) throw new ErroValidacao('Nome da organização deve ter entre 3 e 120 caracteres.');
    const tipo = normalizarEnum(d.tipo, TIPOS_ORG, 'Tipo');
    return this.uow.executar(async (r) => {
      if (await r.organizacoes.existeCnpj(cnpj)) throw new ErroConflito(`CNPJ ${ValidadorCNPJ.formatar(cnpj)} já cadastrado.`);
      const seq = await r.proximaSequencia('seq_organizacao_codigo');
      const org = await r.organizacoes.criar({ codigo: `BR${String(seq).padStart(3, '0')}`, cnpj, nome, tipo, criadoPor: ator.nome });
      await r.auditoria.registrar(ator.nome, 'ORG_CRIAR', `Organização ${org.codigo} (${ValidadorCNPJ.formatar(cnpj)}) cadastrada`);
      return organizacaoDTO(org);
    });
  }

  async alterar(ator: Ator, codigo: string, d: { nome?: string; ativa?: boolean; versao?: number }) {
    const data: Prisma.OrganizacaoUpdateManyMutationInput = {};
    if (d.nome !== undefined) {
      const nome = d.nome.trim();
      if (nome.length < 3 || nome.length > 120) throw new ErroValidacao('Nome da organização deve ter entre 3 e 120 caracteres.');
      data.nome = nome;
    }
    if (d.ativa !== undefined) data.ativa = d.ativa;
    if (Object.keys(data).length === 0) throw new ErroValidacao('Nada para alterar: informe nome e/ou ativa.');
    return this.uow.executar(async (r) => {
      const org = await OrganizacaoServico.buscar(r, codigo);
      conferirVersao(d.versao, org.versao, 'Organização');
      const salvo = await r.organizacoes.atualizar(org.id, org.versao, data);
      await r.auditoria.registrar(ator.nome, 'ORG_ALTERAR', `Organização ${org.codigo} alterada: ${JSON.stringify(data)}`);
      return organizacaoDTO(salvo);
    });
  }

  async definirContrato(ator: Ator, codigo: string, d: DadosContrato) {
    const ini = parseData(d.inicio), fim = parseData(d.fim);
    if (!ini || !fim) throw new ErroValidacao('Datas inválidas. Use AAAA-MM-DD ou DD/MM/AAAA.');
    if (diaOrdinal(fim) < diaOrdinal(ini)) throw new ErroValidacao('A data final do contrato é anterior à inicial.');
    const prazo = d.prazoArmazenamentoDias;
    if (!Number.isInteger(prazo) || prazo < 1 || prazo > 3650) throw new ErroValidacao('prazoArmazenamentoDias deve ser inteiro entre 1 e 3650.');
    const termos = {
      inicio: paraDate(ini), fim: paraDate(fim), prazoArmazenamentoDias: prazo,
      descricao: (d.descricao ?? '').trim(), clausulas: (d.clausulas ?? []) as unknown as Prisma.InputJsonValue,
    };
    return this.uow.executar(async (r) => {
      const org = await OrganizacaoServico.buscar(r, codigo);
      let contrato;
      if (org.contrato) {
        conferirVersao(d.versao, org.contrato.versao, 'Contrato');
        contrato = await r.organizacoes.atualizarContrato(org.contrato.id, org.contrato.versao, termos);
        await r.auditoria.registrar(ator.nome, 'CONTRATO_ALTERAR', `Contrato ${contrato.numero} de ${org.codigo} alterado`);
      } else {
        contrato = await r.organizacoes.criarContrato({ ...termos, numero: `${org.codigo}-C01`, organizacaoId: org.id });
        await r.auditoria.registrar(ator.nome, 'CONTRATO_CRIAR', `Contrato ${contrato.numero} para ${org.codigo}`);
      }
      return contratoDTO(contrato);
    });
  }
}
