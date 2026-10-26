import { TipoEquipamento } from './tipos';
export interface DadosFinanceiros { valorAquisicao: number | null; anoFabricacao: number | null }


export type FonteDepreciacao = (tipo: TipoEquipamento) => number | undefined;

export interface AvaliacaoFinanceira {
  depreciacaoAnualPct: number;
  idadeAnos: number | null;
  valorAquisicao: number | null;
  valorResidual: number | null;
}

export abstract class Equipamento {
  constructor(readonly dados: DadosFinanceiros) {}
  abstract readonly tipo: TipoEquipamento;
  abstract depreciacaoAnualPadrao(): number; // % ao ano
  abstract materiaisRecuperaveis(): string[];

  coeficienteDepreciacao(fonte: FonteDepreciacao): number {
    return fonte(this.tipo) ?? this.depreciacaoAnualPadrao();
  }

  // depreciação linear desde o ano de fabricação; nunca fica negativo
  avaliar(fonte: FonteDepreciacao, anoReferencia: number): AvaliacaoFinanceira {
    const pct = this.coeficienteDepreciacao(fonte);
    const { valorAquisicao, anoFabricacao } = this.dados;
    const idade = anoFabricacao === null ? null : Math.max(0, anoReferencia - anoFabricacao);
    let residual: number | null = null;
    if (valorAquisicao !== null && idade !== null) {
      const fator = Math.max(0, 1 - (pct / 100) * idade);
      residual = Math.round(valorAquisicao * fator * 100) / 100;
    }
    return { depreciacaoAnualPct: pct, idadeAnos: idade, valorAquisicao, valorResidual: residual };
  }
}

export class Computador extends Equipamento {
  readonly tipo = 'COMPUTADOR' as const;
  depreciacaoAnualPadrao(): number { return 20; }
  materiaisRecuperaveis(): string[] { return ['ouro (placas)', 'cobre', 'alumínio', 'terras raras (HDD)']; }
}
export class Servidor extends Equipamento {
  readonly tipo = 'SERVIDOR' as const;
  depreciacaoAnualPadrao(): number { return 20; }
  materiaisRecuperaveis(): string[] { return ['ouro', 'prata', 'cobre', 'paládio', 'terras raras']; }
}
export class Monitor extends Equipamento {
  readonly tipo = 'MONITOR' as const;
  depreciacaoAnualPadrao(): number { return 20; }
  materiaisRecuperaveis(): string[] { return ['vidro', 'cobre', 'plástico', 'índio (telas)']; }
}
export class EquipamentoTelecom extends Equipamento {
  readonly tipo = 'TELECOM' as const;
  depreciacaoAnualPadrao(): number { return 10; }
  materiaisRecuperaveis(): string[] { return ['cobre', 'ouro (conectores)', 'alumínio']; }
}
export class Periferico extends Equipamento {
  readonly tipo = 'PERIFERICO' as const;
  depreciacaoAnualPadrao(): number { return 20; }
  materiaisRecuperaveis(): string[] { return ['plástico', 'cobre']; }
}
export class EquipamentoGenerico extends Equipamento {
  readonly tipo = 'OUTRO' as const;
  depreciacaoAnualPadrao(): number { return 10; }
  materiaisRecuperaveis(): string[] { return ['metais diversos']; }
}

export class FabricaEquipamento {
  static criar(tipo: TipoEquipamento, dados: DadosFinanceiros): Equipamento {
    switch (tipo) {
      case 'COMPUTADOR': return new Computador(dados);
      case 'SERVIDOR': return new Servidor(dados);
      case 'MONITOR': return new Monitor(dados);
      case 'TELECOM': return new EquipamentoTelecom(dados);
      case 'PERIFERICO': return new Periferico(dados);
      default: return new EquipamentoGenerico(dados);
    }
  }

 
  static codigoBarras(sequencia: number): string {
    const digitos = String(sequencia).padStart(8, '0');
    let soma = 0;
    for (let i = 0; i < digitos.length; i++) soma += +digitos[i] * (i % 2 === 0 ? 3 : 1);
    return `GC${digitos}${(10 - (soma % 10)) % 10}`;
  }
}
