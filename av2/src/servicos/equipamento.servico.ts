import { Equipamento, Prisma } from '@prisma/client';
import { FabricaEquipamento } from '../dominio/equipamentos';
import { ErroConflito, ErroNaoEncontrado, ErroNegocio, ErroValidacao } from '../dominio/erros';
import {
  CLASSES_TRIAGEM, ESTADOS, EstadoFisico, STATUS, StatusEquipamento, TIPOS_EQUIP, TipoEquipamento,
  normalizarEnum, statusFinal,
} from '../dominio/tipos';
import { ValidadorMudancaEstado, ValidadorTransicaoStatus } from '../dominio/validadores';
import { Pagina, Paginado } from '../repositorios/base';
import { Repositorios, UnidadeDeTrabalho } from '../repositorios/repositorios';
import { equipamentoDTO, movimentacaoDTO } from './apresentacao';
import { Ator, Relogio, conferirVersao } from './comum';
import { ParametroServico } from './parametro.servico';

export interface DadosEquipamento {
  tipo: string; descricao: string; serie?: string; estado?: string; valorAquisicao?: number; anoFabricacao?: number;
}

type EquipDTO = ReturnType<typeof equipamentoDTO>;

export class EquipamentoServico {
  private readonly vTransicao = new ValidadorTransicaoStatus();
  private readonly vEstado = new ValidadorMudancaEstado();

  constructor(
    private readonly uow: UnidadeDeTrabalho,
    private readonly params: ParametroServico,
    private readonly relogio: Relogio = () => new Date(),
  ) {}

  private static async buscar(r: Repositorios, codigo: string) {
    const e = await r.equipamentos.buscarPorCodigo(codigo.trim().toUpperCase());
    if (!e) throw new ErroNaoEncontrado(`Equipamento "${codigo}" não encontrado.`);
    return e;
  }

 
  // tudo na mesma transação. Ou fica tudo, ou não fica nada.
  private async mudar(
    r: Repositorios, ator: Ator, eq: Equipamento, data: Prisma.EquipamentoUpdateManyMutationInput,
    mov: { tipo: 'STATUS' | 'ESTADO' | 'TRIAGEM'; justificativa?: string; observacao?: string }, operacao: string, resumo: string,
  ) {
    const salvo = await r.equipamentos.atualizar(eq.id, eq.versao, data);
    await r.movimentacoes.criar({
      equipamentoId: eq.id, ator: ator.nome, tipo: mov.tipo,
      statusDe: eq.status, statusPara: salvo.status, estadoDe: eq.estado, estadoPara: salvo.estado,
      justificativa: mov.justificativa, observacao: mov.observacao,
    });
    await r.auditoria.registrar(ator.nome, operacao, resumo);
    return equipamentoDTO(salvo);
  }

  // Valida e insere um equipamento num lote já carregado. Público porque o serviço de lotes
  // chama dentro da transação dele (lote + N equipamentos atômicos).
  async registrarNoLote(r: Repositorios, ator: Ator, lote: { id: string; codigo: string }, d: DadosEquipamento): Promise<EquipDTO> {
    const descricao = d.descricao.trim();
    if (descricao.length < 3 || descricao.length > 120) throw new ErroValidacao('Descrição deve ter entre 3 e 120 caracteres.');
    let serie: string | undefined;
    if (d.serie) {
      serie = d.serie.trim().toUpperCase();
      if (!/^[A-Z0-9._-]{3,40}$/.test(serie)) throw new ErroValidacao('Número de série inválido (3-40 caracteres: letras, dígitos, . _ -).');
      if (await r.equipamentos.existeSerie(serie)) throw new ErroConflito(`Número de série ${serie} já registrado.`);
    }
    const anoAtual = this.relogio().getFullYear();
    if (d.anoFabricacao !== undefined && (!Number.isInteger(d.anoFabricacao) || d.anoFabricacao < 1970 || d.anoFabricacao > anoAtual)) {
      throw new ErroValidacao(`anoFabricacao deve estar entre 1970 e ${anoAtual}.`);
    }
    if (d.valorAquisicao !== undefined && (!Number.isFinite(d.valorAquisicao) || d.valorAquisicao < 0)) {
      throw new ErroValidacao('valorAquisicao não pode ser negativo.');
    }
    const tipo = normalizarEnum<TipoEquipamento>(d.tipo, TIPOS_EQUIP, 'Tipo');
    const estado = d.estado ? normalizarEnum<EstadoFisico>(d.estado, ESTADOS, 'Estado') : 'BOM';

    const seq = await r.proximaSequencia('seq_equipamento_codigo');
    const eq = await r.equipamentos.criar({
      codigo: `EQ-${String(seq).padStart(6, '0')}`, codigoBarrasInterno: FabricaEquipamento.codigoBarras(seq),
      loteId: lote.id, tipo, descricao, serie, estado, status: 'RECEBIDO',
      valorAquisicao: d.valorAquisicao, anoFabricacao: d.anoFabricacao, criadoPor: ator.nome,
    });
    await r.movimentacoes.criar({
      equipamentoId: eq.id, ator: ator.nome, tipo: 'REGISTRO', statusPara: 'RECEBIDO', estadoPara: estado,
    });
    await r.auditoria.registrar(ator.nome, 'EQUIP_REGISTRAR', `Equipamento ${eq.codigo} (${tipo}) registrado no lote ${lote.codigo}`);
    return equipamentoDTO(eq);
  }

  async registrar(ator: Ator, loteCodigo: string, d: DadosEquipamento) {
    return this.uow.executar(async (r) => {
      const lote = await r.lotes.buscarPorCodigo(loteCodigo.trim().toUpperCase());
      if (!lote) throw new ErroNaoEncontrado(`Lote "${loteCodigo}" não encontrado.`);
      return this.registrarNoLote(r, ator, lote, d);
    });
  }

  async listar(p: Pagina, f: { lote?: string; status?: string; tipo?: string; estado?: string }): Promise<Paginado<EquipDTO>> {
    const { itens, total } = await this.uow.leitura.equipamentos.listar(p, {
      loteCodigo: f.lote?.toUpperCase(),
      status: f.status ? normalizarEnum<StatusEquipamento>(f.status, STATUS, 'Status') : undefined,
      tipo: f.tipo ? normalizarEnum<TipoEquipamento>(f.tipo, TIPOS_EQUIP, 'Tipo') : undefined,
      estado: f.estado ? normalizarEnum<EstadoFisico>(f.estado, ESTADOS, 'Estado') : undefined,
    });
    return { itens: itens.map(equipamentoDTO), total, ...p };
  }

  // detalhe com o comportamento polimórfico: depreciação, valor residual e materiais recuperáveis
  async obter(codigo: string) {
    const e = await EquipamentoServico.buscar(this.uow.leitura, codigo);
    return this.detalhar(e);
  }

  async obterPorBarras(barras: string) {
    const e = await this.uow.leitura.equipamentos.buscarPorBarras(barras.trim().toUpperCase());
    if (!e) throw new ErroNaoEncontrado(`Código de barras "${barras}" não encontrado.`);
    return this.detalhar(e);
  }

  private async detalhar(e: Equipamento & { lote: { codigo: string } }) {
    const modelo = FabricaEquipamento.criar(e.tipo, {
      valorAquisicao: e.valorAquisicao === null ? null : e.valorAquisicao.toNumber(), anoFabricacao: e.anoFabricacao,
    });
    return {
      ...equipamentoDTO(e),
      avaliacao: modelo.avaliar(await this.params.fonteDepreciacao(), this.relogio().getFullYear()),
      materiaisRecuperaveis: modelo.materiaisRecuperaveis(),
    };
  }

  async moverStatus(ator: Ator, codigo: string, d: { status: string; observacao?: string; versao?: number }) {
    const destino = normalizarEnum<StatusEquipamento>(d.status, STATUS, 'Status');
    if (destino === 'TRIADO') throw new ErroNegocio('Para marcar como TRIADO use POST /equipamentos/:codigo/triagem (a triagem completa é obrigatória).');
    return this.uow.executar(async (r) => {
      const eq = await EquipamentoServico.buscar(r, codigo);
      conferirVersao(d.versao, eq.versao, 'Equipamento');
      this.vTransicao.exigir({ atual: eq.status, para: destino, triagemCompleta: eq.triagemClasse !== null });
      return this.mudar(r, ator, eq, { status: destino }, { tipo: 'STATUS', observacao: d.observacao },
        'EQUIP_STATUS', `${eq.codigo}: ${eq.status} → ${destino}`);
    });
  }

  async triar(ator: Ator, codigo: string, d: { estado: string; classe: string; justificativa?: string; observacao?: string; versao?: number }) {
    const novoEstado = normalizarEnum<EstadoFisico>(d.estado, ESTADOS, 'Estado');
    const classe = normalizarEnum(d.classe, CLASSES_TRIAGEM, 'Classe');
    return this.uow.executar(async (r) => {
      const eq = await EquipamentoServico.buscar(r, codigo);
      conferirVersao(d.versao, eq.versao, 'Equipamento');
      if (eq.status !== 'EM_TRIAGEM') throw new ErroNegocio(`Equipamento ${eq.codigo} está ${eq.status}; a triagem exige status EM_TRIAGEM.`);
      this.vEstado.exigir({ de: eq.estado, para: novoEstado, justificativa: d.justificativa });
      return this.mudar(r, ator, eq, {
        estado: novoEstado, status: 'TRIADO', triagemClasse: classe, triagemResponsavel: ator.nome,
        triagemEm: this.relogio(), triagemObservacao: d.observacao ?? null,
      }, { tipo: 'TRIAGEM', justificativa: d.justificativa, observacao: d.observacao },
      'EQUIP_TRIAR', `${eq.codigo} triado: ${classe}, estado ${eq.estado} → ${novoEstado}`);
    });
  }

  async alterarEstado(ator: Ator, codigo: string, d: { estado: string; justificativa?: string; versao?: number }) {
    const alvo = normalizarEnum<EstadoFisico>(d.estado, ESTADOS, 'Estado');
    return this.uow.executar(async (r) => {
      const eq = await EquipamentoServico.buscar(r, codigo);
      conferirVersao(d.versao, eq.versao, 'Equipamento');
      if (statusFinal(eq.status)) throw new ErroNegocio(`Equipamento ${eq.codigo} está em status final (${eq.status}).`);
      if (alvo === eq.estado) throw new ErroNegocio(`Equipamento ${eq.codigo} já está no estado ${alvo}.`);
      this.vEstado.exigir({ de: eq.estado, para: alvo, justificativa: d.justificativa });
      return this.mudar(r, ator, eq, { estado: alvo }, { tipo: 'ESTADO', justificativa: d.justificativa },
        'EQUIP_ESTADO', `${eq.codigo}: estado ${eq.estado} → ${alvo}`);
    });
  }

  async rastrear(codigo: string) {
    const r = this.uow.leitura;
    const eq = await EquipamentoServico.buscar(r, codigo);
    return (await r.movimentacoes.listarDoEquipamento(eq.id)).map(movimentacaoDTO);
  }
}
