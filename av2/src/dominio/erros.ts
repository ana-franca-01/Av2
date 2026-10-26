

export class ErroGreencode extends Error {
  constructor(
    mensagem: string,
    readonly statusHttp: number = 500,
    readonly codigo: string = 'GC-000',
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = new.target.name;
  }
}

export class ErroValidacao extends ErroGreencode {
  constructor(m: string, detalhes?: unknown) { super(m, 400, 'GC-VAL', detalhes); }
}
export class ErroAutenticacao extends ErroGreencode {
  constructor(m = 'Usuário ou senha inválidos.') { super(m, 401, 'GC-AUTH'); }
}
export class ErroPermissao extends ErroGreencode {
  constructor(m: string) { super(m, 403, 'GC-PERM'); }
}
export class ErroNaoEncontrado extends ErroGreencode {
  constructor(m: string) { super(m, 404, 'GC-404'); }
}
export class ErroConflito extends ErroGreencode {
  constructor(m: string, detalhes?: unknown) { super(m, 409, 'GC-CONF', detalhes); }
}
// versionamento otimista: alguém gravou o registro entre a leitura e a escrita
export class ErroConcorrencia extends ErroGreencode {
  constructor(m: string, detalhes?: unknown) { super(m, 409, 'GC-VERSAO', detalhes); }
}
export class ErroNegocio extends ErroGreencode {
  constructor(m: string) { super(m, 422, 'GC-NEG'); }
}
export class ErroBloqueio extends ErroGreencode {
  constructor(m: string) { super(m, 429, 'GC-BLOQ'); }
}
