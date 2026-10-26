import { Papel } from './tipos';

export type Permissao =
  | 'usuario:gerir' | 'param:gerir' | 'param:ler'
  | 'org:ler' | 'org:escrever' | 'lote:ler' | 'lote:escrever'
  | 'equip:ler' | 'equip:escrever' | 'relatorio:ler' | 'auditoria:ler';

export abstract class PapelUsuario {
  abstract readonly nome: Papel;
  abstract readonly rotulo: string;
  protected abstract permissoes(): Permissao[];
  private conj?: Set<Permissao>;

  pode(p: Permissao): boolean {
    if (!this.conj) this.conj = new Set(this.permissoes());
    return this.conj.has(p);
  }

  static porNome(n: Papel): PapelUsuario {
    switch (n) {
      case 'ADMIN': return new PapelAdministrador();
      case 'CADASTRO': return new PapelOperadorCadastro();
      case 'ALMOXARIFADO': return new PapelGestorAlmoxarifado();
      case 'AUDITOR': return new PapelAuditor();
    }
  }
}

export class PapelAdministrador extends PapelUsuario {
  readonly nome = 'ADMIN' as const;
  readonly rotulo = 'Administrador do sistema';
  protected permissoes(): Permissao[] {
    return ['usuario:gerir', 'param:gerir', 'param:ler', 'org:ler', 'org:escrever', 'lote:ler', 'lote:escrever',
      'equip:ler', 'equip:escrever', 'relatorio:ler', 'auditoria:ler'];
  }
}

export class PapelOperadorCadastro extends PapelUsuario {
  readonly nome = 'CADASTRO' as const;
  readonly rotulo = 'Operador de cadastro';
  protected permissoes(): Permissao[] { return ['org:ler', 'org:escrever', 'lote:ler', 'equip:ler', 'param:ler']; }
}

export class PapelGestorAlmoxarifado extends PapelUsuario {
  readonly nome = 'ALMOXARIFADO' as const;
  readonly rotulo = 'Gestor de almoxarifado';
  protected permissoes(): Permissao[] {
    return ['org:ler', 'lote:ler', 'lote:escrever', 'equip:ler', 'equip:escrever', 'param:ler'];
  }
}

export class PapelAuditor extends PapelUsuario {
  readonly nome = 'AUDITOR' as const;
  readonly rotulo = 'Auditor (somente leitura)';
  protected permissoes(): Permissao[] {
    return ['org:ler', 'lote:ler', 'equip:ler', 'param:ler', 'relatorio:ler', 'auditoria:ler'];
  }
}
