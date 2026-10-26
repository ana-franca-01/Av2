import { FabricaEquipamento } from '../dominio/equipamentos';
import { ErroValidacao } from '../dominio/erros';
import { Pagina } from '../repositorios/base';
import { UnidadeDeTrabalho } from '../repositorios/repositorios';
import { auditoriaDTO } from './apresentacao';
import { Relogio } from './comum';
import { ParametroServico } from './parametro.servico';

export class RelatorioServico {
  constructor(
    private readonly uow: UnidadeDeTrabalho,
    private readonly params: ParametroServico,
    private readonly relogio: Relogio = () => new Date(),
  ) {}

  async resumo() {
    const r = this.uow.leitura;
    const [porStatus, porTipo, avaliaveis, fonte] = await Promise.all([
      r.equipamentos.contarPorStatus(), r.equipamentos.contarPorTipo(), r.equipamentos.paraAvaliacao(), this.params.fonteDepreciacao(),
    ]);
    const ano = this.relogio().getFullYear();
    let aquisicao = 0, residual = 0;
    for (const e of avaliaveis) {
      const av = FabricaEquipamento.criar(e.tipo, { valorAquisicao: e.valorAquisicao!.toNumber(), anoFabricacao: e.anoFabricacao })
        .avaliar(fonte, ano);
      aquisicao += av.valorAquisicao ?? 0;
      residual += av.valorResidual ?? 0;
    }
    const total = porStatus.reduce((s, g) => s + g._count._all, 0);
    return {
      totalEquipamentos: total,
      porStatus: Object.fromEntries(porStatus.map((g) => [g.status, g._count._all])),
      porTipo: Object.fromEntries(porTipo.map((g) => [g.tipo, g._count._all])),
      financeiro: {
        equipamentosAvaliados: avaliaveis.length,
        valorAquisicaoTotal: Math.round(aquisicao * 100) / 100,
        valorResidualTotal: Math.round(residual * 100) / 100,
      },
    };
  }

  async auditoria(p: Pagina, f: { dias?: number; ator?: string; operacao?: string }) {
    if (f.dias !== undefined && (!Number.isInteger(f.dias) || f.dias < 1 || f.dias > 3650)) throw new ErroValidacao('dias deve ser inteiro entre 1 e 3650.');
    const desde = f.dias ? new Date(this.relogio().getTime() - f.dias * 86_400_000) : undefined;
    const { itens, total } = await this.uow.leitura.auditoria.listar(p, { desde, ator: f.ator?.toLowerCase(), operacao: f.operacao?.toUpperCase() });
    return { itens: itens.map(auditoriaDTO), total, ...p };
  }
}
