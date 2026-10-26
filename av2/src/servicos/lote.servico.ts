import { formatarISO, hojeCivil, parseData, paraDate } from '../dominio/datas';
import { ErroConflito, ErroNaoEncontrado, ErroNegocio, ErroValidacao } from '../dominio/erros';
import { ValidadorDataLote } from '../dominio/validadores';
import { Pagina, Paginado } from '../repositorios/base';
import { UnidadeDeTrabalho } from '../repositorios/repositorios';
import { equipamentoDTO, loteDTO } from './apresentacao';
import { Ator, Relogio } from './comum';
import { DadosEquipamento, EquipamentoServico } from './equipamento.servico';
import { OrganizacaoServico } from './organizacao.servico';

export const MAX_EQUIPAMENTOS_POR_REQUISICAO = 500;

type LoteDTO = ReturnType<typeof loteDTO>;

export class LoteServico {
  private readonly vData: ValidadorDataLote;

  constructor(
    private readonly uow: UnidadeDeTrabalho,
    private readonly equipamentos: EquipamentoServico,
    private readonly relogio: Relogio = () => new Date(),
  ) { this.vData = new ValidadorDataLote(relogio); }

  async listar(p: Pagina, f: { organizacao?: string }): Promise<Paginado<LoteDTO>> {
    const { itens, total } = await this.uow.leitura.lotes.listar(p, { organizacaoCodigo: f.organizacao?.toUpperCase() });
    return { itens: itens.map(loteDTO), total, ...p };
  }

  async obter(codigo: string) {
    const l = await this.uow.leitura.lotes.buscarPorCodigo(codigo.trim().toUpperCase());
    if (!l) throw new ErroNaoEncontrado(`Lote "${codigo}" não encontrado.`);
    return { ...loteDTO(l), totalEquipamentos: l.equipamentos.length, equipamentos: l.equipamentos.map((e) => equipamentoDTO({ ...e, lote: l })) };
  }

  
  async criar(ator: Ator, d: { organizacao: string; notaFiscal: string; transportadora: string; dataEntrada?: string; equipamentos?: DadosEquipamento[] }) {
    const dataTxt = d.dataEntrada ?? formatarISO(hojeCivil(this.relogio()));
    this.vData.exigir(dataTxt);
    const data = parseData(dataTxt)!;
    const nf = d.notaFiscal.trim();
    if (!/^\d{1,9}$/.test(nf)) throw new ErroValidacao('Nota fiscal inválida: use apenas dígitos (até 9).');
    const transp = d.transportadora.trim();
    if (transp.length < 2 || transp.length > 60) throw new ErroValidacao('Transportadora deve ter entre 2 e 60 caracteres.');
    const itens = d.equipamentos ?? [];
    if (itens.length > MAX_EQUIPAMENTOS_POR_REQUISICAO) {
      throw new ErroValidacao(`No máximo ${MAX_EQUIPAMENTOS_POR_REQUISICAO} equipamentos por requisição.`);
    }

    return this.uow.executar(async (r) => {
      const org = await OrganizacaoServico.buscar(r, d.organizacao);
      if (!org.ativa) throw new ErroNegocio(`Organização ${org.codigo} está inativa.`);
      const dia = paraDate(data);
      if (!org.contrato || dia < org.contrato.inicio || dia > org.contrato.fim) {
        throw new ErroNegocio(`Organização ${org.codigo} não possui contrato de coleta vigente em ${formatarISO(data)}.`);
      }
      if (await r.lotes.existeNf(org.id, nf)) throw new ErroConflito(`Já existe lote da organização ${org.codigo} com a nota fiscal ${nf}.`);

      const seq = await r.proximaSequencia('seq_lote_codigo');
      const lote = await r.lotes.criar({
        codigo: `LT-${String(seq).padStart(6, '0')}`, organizacaoId: org.id, notaFiscal: nf,
        transportadora: transp, dataEntrada: dia, criadoPor: ator.nome,
      });
      await r.auditoria.registrar(ator.nome, 'LOTE_CRIAR', `Lote ${lote.codigo} (${org.codigo}, NF ${nf}, ${transp}) criado com ${itens.length} equipamento(s)`);

      const equipamentos = [];
      for (const [i, item] of itens.entries()) {
        try {
          equipamentos.push(await this.equipamentos.registrarNoLote(r, ator, lote, item));
        } catch (e) {
          if (e instanceof Error) e.message = `Equipamento #${i + 1}: ${e.message}`;
          throw e;
        }
      }
      return { ...loteDTO({ ...lote, organizacao: org }), totalEquipamentos: equipamentos.length, equipamentos };
    });
  }
}
