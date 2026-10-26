import { EstadoFisico, Papel, Prisma, PrismaClient, StatusEquipamento, TipoEquipamento } from '@prisma/client';
import { Db, NomeSequencia, Pagina, garantirVersao, proximaSequencia, skipTake } from './base';


export class UsuarioRepositorio {
  constructor(private readonly db: Db) {}
  buscarPorNome(nome: string) { return this.db.usuario.findUnique({ where: { nome } }); }
  listar() { return this.db.usuario.findMany({ orderBy: { nome: 'asc' } }); }
  contarAdminsAtivos() { return this.db.usuario.count({ where: { papel: 'ADMIN', ativo: true } }); }
  criar(d: { nome: string; papel: Papel; senhaHash: string }) { return this.db.usuario.create({ data: d }); }

  async atualizar(id: string, versao: number, data: Prisma.UsuarioUpdateManyMutationInput) {
    garantirVersao(await this.db.usuario.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } }), 'Usuário', versao);
    return this.db.usuario.findUniqueOrThrow({ where: { id } });
  }

  registrarFalha(id: string, bloquearAte: Date | null) {
    return this.db.usuario.update({
      where: { id },
      data: bloquearAte ? { falhasLogin: 0, bloqueadoAte: bloquearAte } : { falhasLogin: { increment: 1 } },
    });
  }
  limparFalhas(id: string) { return this.db.usuario.update({ where: { id }, data: { falhasLogin: 0, bloqueadoAte: null } }); }
}

export class ParametroRepositorio {
  constructor(private readonly db: Db) {}
  listar() { return this.db.parametro.findMany({ orderBy: { chave: 'asc' } }); }
  buscar(chave: string) { return this.db.parametro.findUnique({ where: { chave } }); }
  criar(chave: string, valor: number, ator: string) {
    return this.db.parametro.create({ data: { chave, valor, atualizadoPor: ator } });
  }
  async atualizar(chave: string, versao: number, valor: number, ator: string) {
    garantirVersao(await this.db.parametro.updateMany({
      where: { chave, versao }, data: { valor, atualizadoPor: ator, versao: { increment: 1 } },
    }), 'Parâmetro', versao);
    return this.db.parametro.findUniqueOrThrow({ where: { chave } });
  }
}

const incluirOrg = { contrato: true, _count: { select: { lotes: true } } } satisfies Prisma.OrganizacaoInclude;

export class OrganizacaoRepositorio {
  constructor(private readonly db: Db) {}
  buscarPorCodigo(codigo: string) { return this.db.organizacao.findUnique({ where: { codigo }, include: incluirOrg }); }
  existeCnpj(cnpj: string) { return this.db.organizacao.count({ where: { cnpj } }).then((n) => n > 0); }
  criar(d: Prisma.OrganizacaoUncheckedCreateInput) { return this.db.organizacao.create({ data: d, include: incluirOrg }); }

  async listar(p: Pagina, filtro: { ativa?: boolean; busca?: string }) {
    const where: Prisma.OrganizacaoWhereInput = {
      ativa: filtro.ativa,
      ...(filtro.busca ? { OR: [{ nome: { contains: filtro.busca, mode: 'insensitive' } }, { cnpj: { contains: filtro.busca.toUpperCase() } }] } : {}),
    };
    const [itens, total] = await Promise.all([
      this.db.organizacao.findMany({ where, include: incluirOrg, orderBy: { codigo: 'asc' }, ...skipTake(p) }),
      this.db.organizacao.count({ where }),
    ]);
    return { itens, total };
  }

  async atualizar(id: string, versao: number, data: Prisma.OrganizacaoUpdateManyMutationInput) {
    garantirVersao(await this.db.organizacao.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } }), 'Organização', versao);
    return this.db.organizacao.findUniqueOrThrow({ where: { id }, include: incluirOrg });
  }

  criarContrato(d: Prisma.ContratoUncheckedCreateInput) { return this.db.contrato.create({ data: d }); }
  async atualizarContrato(id: string, versao: number, data: Prisma.ContratoUpdateManyMutationInput) {
    garantirVersao(await this.db.contrato.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } }), 'Contrato', versao);
    return this.db.contrato.findUniqueOrThrow({ where: { id } });
  }
}

export class LoteRepositorio {
  constructor(private readonly db: Db) {}
  buscarPorCodigo(codigo: string) {
    return this.db.lote.findUnique({
      where: { codigo },
      include: { organizacao: { select: { codigo: true } }, equipamentos: { orderBy: { codigo: 'asc' } } },
    });
  }
  existeNf(organizacaoId: string, notaFiscal: string) {
    return this.db.lote.count({ where: { organizacaoId, notaFiscal } }).then((n) => n > 0);
  }
  criar(d: Prisma.LoteUncheckedCreateInput) { return this.db.lote.create({ data: d }); }

  async listar(p: Pagina, filtro: { organizacaoCodigo?: string }) {
    const where: Prisma.LoteWhereInput = filtro.organizacaoCodigo ? { organizacao: { codigo: filtro.organizacaoCodigo } } : {};
    const [itens, total] = await Promise.all([
      this.db.lote.findMany({
        where, orderBy: { codigo: 'asc' }, ...skipTake(p),
        include: { organizacao: { select: { codigo: true } }, _count: { select: { equipamentos: true } } },
      }),
      this.db.lote.count({ where }),
    ]);
    return { itens, total };
  }
}

const incluirEquip = { lote: { select: { codigo: true } } } satisfies Prisma.EquipamentoInclude;

export class EquipamentoRepositorio {
  constructor(private readonly db: Db) {}
  buscarPorCodigo(codigo: string) { return this.db.equipamento.findUnique({ where: { codigo }, include: incluirEquip }); }
  buscarPorBarras(codigoBarrasInterno: string) {
    return this.db.equipamento.findUnique({ where: { codigoBarrasInterno }, include: incluirEquip });
  }
  existeSerie(serie: string) { return this.db.equipamento.count({ where: { serie } }).then((n) => n > 0); }
  criar(d: Prisma.EquipamentoUncheckedCreateInput) { return this.db.equipamento.create({ data: d, include: incluirEquip }); }

  async listar(p: Pagina, filtro: { loteCodigo?: string; status?: StatusEquipamento; tipo?: TipoEquipamento; estado?: EstadoFisico }) {
    const where: Prisma.EquipamentoWhereInput = {
      status: filtro.status, tipo: filtro.tipo, estado: filtro.estado,
      ...(filtro.loteCodigo ? { lote: { codigo: filtro.loteCodigo } } : {}),
    };
    const [itens, total] = await Promise.all([
      this.db.equipamento.findMany({ where, include: incluirEquip, orderBy: { codigo: 'asc' }, ...skipTake(p) }),
      this.db.equipamento.count({ where }),
    ]);
    return { itens, total };
  }

  async atualizar(id: string, versao: number, data: Prisma.EquipamentoUpdateManyMutationInput) {
    garantirVersao(await this.db.equipamento.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } }), 'Equipamento', versao);
    return this.db.equipamento.findUniqueOrThrow({ where: { id }, include: incluirEquip });
  }

  contarPorStatus() { return this.db.equipamento.groupBy({ by: ['status'], _count: { _all: true } }); }
  contarPorTipo() { return this.db.equipamento.groupBy({ by: ['tipo'], _count: { _all: true } }); }
  paraAvaliacao() {
    return this.db.equipamento.findMany({
      where: { valorAquisicao: { not: null }, anoFabricacao: { not: null } },
      select: { tipo: true, valorAquisicao: true, anoFabricacao: true },
    });
  }
}

export class MovimentacaoRepositorio {
  constructor(private readonly db: Db) {}
  criar(d: Prisma.MovimentacaoUncheckedCreateInput) { return this.db.movimentacao.create({ data: d }); }
  listarDoEquipamento(equipamentoId: string) {
    return this.db.movimentacao.findMany({ where: { equipamentoId }, orderBy: { id: 'asc' } });
  }
}

export class AuditoriaRepositorio {
  constructor(private readonly db: Db) {}
  registrar(ator: string, operacao: string, resumo: string) {
    return this.db.auditoria.create({ data: { ator, operacao, resumo: resumo.slice(0, 500) } });
  }
  async listar(p: Pagina, filtro: { desde?: Date; ator?: string; operacao?: string }) {
    const where: Prisma.AuditoriaWhereInput = {
      ts: filtro.desde ? { gte: filtro.desde } : undefined, ator: filtro.ator, operacao: filtro.operacao,
    };
    const [itens, total] = await Promise.all([
      this.db.auditoria.findMany({ where, orderBy: { id: 'desc' }, ...skipTake(p) }),
      this.db.auditoria.count({ where }),
    ]);
    return { itens, total };
  }
}

// Conjunto de repositórios amarrados ao mesmo cliente (normal ou transacional).
export class Repositorios {
  readonly usuarios: UsuarioRepositorio;
  readonly parametros: ParametroRepositorio;
  readonly organizacoes: OrganizacaoRepositorio;
  readonly lotes: LoteRepositorio;
  readonly equipamentos: EquipamentoRepositorio;
  readonly movimentacoes: MovimentacaoRepositorio;
  readonly auditoria: AuditoriaRepositorio;

  constructor(private readonly db: Db) {
    this.usuarios = new UsuarioRepositorio(db);
    this.parametros = new ParametroRepositorio(db);
    this.organizacoes = new OrganizacaoRepositorio(db);
    this.lotes = new LoteRepositorio(db);
    this.equipamentos = new EquipamentoRepositorio(db);
    this.movimentacoes = new MovimentacaoRepositorio(db);
    this.auditoria = new AuditoriaRepositorio(db);
  }

  proximaSequencia(seq: NomeSequencia) { return proximaSequencia(this.db, seq); }
}

export class UnidadeDeTrabalho {
  readonly leitura: Repositorios;
  constructor(private readonly prisma: PrismaClient) { this.leitura = new Repositorios(prisma); }

  executar<T>(fn: (r: Repositorios) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(new Repositorios(tx)), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 15_000,
    });
  }
}
