import { FastifyReply, FastifyRequest } from 'fastify';
import { Ator } from '../servicos/comum';
import { AutenticacaoServico } from '../servicos/autenticacao.servico';
import { DadosEquipamento, EquipamentoServico } from '../servicos/equipamento.servico';
import { LoteServico } from '../servicos/lote.servico';
import { DadosContrato, OrganizacaoServico } from '../servicos/organizacao.servico';
import { ParametroServico } from '../servicos/parametro.servico';
import { RelatorioServico } from '../servicos/relatorio.servico';
import { UsuarioServico } from '../servicos/usuario.servico';
import { Pagina } from '../repositorios/base';



type Req<P = unknown, B = unknown, Q = unknown> = FastifyRequest<{ Params: P; Body: B; Querystring: Q }>;
type ComCodigo = { codigo: string };
type QPagina = { pagina?: number; tamanho?: number };

const ator = (req: FastifyRequest): Ator => ({ nome: req.user.sub, papel: req.user.papel });
const pagina = (q: QPagina): Pagina => ({ pagina: q.pagina ?? 1, tamanho: q.tamanho ?? 20 });

export class AutenticacaoController {
  constructor(private readonly auth: AutenticacaoServico) {}

  login = async (req: Req<unknown, { usuario: string; senha: string }>, reply: FastifyReply) => {
    const a = await this.auth.login(req.body.usuario, req.body.senha);
    const token = await reply.jwtSign({ sub: a.nome, papel: a.papel });
    return { token, tipo: 'Bearer', usuario: a.nome, papel: a.papel };
  };
  perfil = (req: FastifyRequest) => this.auth.perfil(ator(req));
  alterarSenha = (req: Req<unknown, { senhaAtual: string; novaSenha: string }>) =>
    this.auth.alterarPropriaSenha(ator(req), req.body.senhaAtual, req.body.novaSenha);
}

export class UsuarioController {
  constructor(private readonly usuarios: UsuarioServico) {}
  listar = () => this.usuarios.listar();
  criar = async (req: Req<unknown, { nome: string; papel: string; senha: string }>, reply: FastifyReply) =>
    reply.status(201).send(await this.usuarios.criar(ator(req), req.body));
  alterarAtivo = (req: Req<{ nome: string }, { ativo: boolean; versao?: number }>) =>
    this.usuarios.alterarAtivo(ator(req), req.params.nome, req.body.ativo, req.body.versao);
  redefinirSenha = (req: Req<{ nome: string }, { senha: string }>) =>
    this.usuarios.redefinirSenha(ator(req), req.params.nome, req.body.senha);
}

export class ParametroController {
  constructor(private readonly params: ParametroServico) {}
  listar = () => this.params.listar();
  definir = (req: Req<{ chave: string }, { valor: number; versao?: number }>) =>
    this.params.definir(ator(req), req.params.chave, req.body.valor, req.body.versao);
}

export class OrganizacaoController {
  constructor(private readonly orgs: OrganizacaoServico) {}
  listar = (req: Req<unknown, unknown, QPagina & { ativa?: boolean; busca?: string }>) =>
    this.orgs.listar(pagina(req.query), { ativa: req.query.ativa, busca: req.query.busca });
  obter = (req: Req<ComCodigo>) => this.orgs.obter(req.params.codigo);
  criar = async (req: Req<unknown, { cnpj: string; nome: string; tipo: string }>, reply: FastifyReply) =>
    reply.status(201).send(await this.orgs.criar(ator(req), req.body));
  alterar = (req: Req<ComCodigo, { nome?: string; ativa?: boolean; versao?: number }>) =>
    this.orgs.alterar(ator(req), req.params.codigo, req.body);
  definirContrato = (req: Req<ComCodigo, DadosContrato>) => this.orgs.definirContrato(ator(req), req.params.codigo, req.body);
}

type CorpoLote = { organizacao: string; notaFiscal: string; transportadora: string; dataEntrada?: string; equipamentos?: DadosEquipamento[] };

export class LoteController {
  constructor(private readonly lotes: LoteServico, private readonly equipamentos: EquipamentoServico) {}
  listar = (req: Req<unknown, unknown, QPagina & { organizacao?: string }>) =>
    this.lotes.listar(pagina(req.query), { organizacao: req.query.organizacao });
  obter = (req: Req<ComCodigo>) => this.lotes.obter(req.params.codigo);
  criar = async (req: Req<unknown, CorpoLote>, reply: FastifyReply) => reply.status(201).send(await this.lotes.criar(ator(req), req.body));
  adicionarEquipamento = async (req: Req<ComCodigo, DadosEquipamento>, reply: FastifyReply) =>
    reply.status(201).send(await this.equipamentos.registrar(ator(req), req.params.codigo, req.body));
}

export class EquipamentoController {
  constructor(private readonly equipamentos: EquipamentoServico) {}
  listar = (req: Req<unknown, unknown, QPagina & { lote?: string; status?: string; tipo?: string; estado?: string }>) =>
    this.equipamentos.listar(pagina(req.query), req.query);
  obter = (req: Req<ComCodigo>) => this.equipamentos.obter(req.params.codigo);
  obterPorBarras = (req: Req<{ barras: string }>) => this.equipamentos.obterPorBarras(req.params.barras);
  registrar = async (req: Req<unknown, DadosEquipamento & { lote: string }>, reply: FastifyReply) => {
    const { lote, ...dados } = req.body;
    return reply.status(201).send(await this.equipamentos.registrar(ator(req), lote, dados));
  };
  moverStatus = (req: Req<ComCodigo, { status: string; observacao?: string; versao?: number }>) =>
    this.equipamentos.moverStatus(ator(req), req.params.codigo, req.body);
  triar = (req: Req<ComCodigo, { estado: string; classe: string; justificativa?: string; observacao?: string; versao?: number }>) =>
    this.equipamentos.triar(ator(req), req.params.codigo, req.body);
  alterarEstado = (req: Req<ComCodigo, { estado: string; justificativa?: string; versao?: number }>) =>
    this.equipamentos.alterarEstado(ator(req), req.params.codigo, req.body);
  rastrear = (req: Req<ComCodigo>) => this.equipamentos.rastrear(req.params.codigo);
}

export class RelatorioController {
  constructor(private readonly relatorios: RelatorioServico) {}
  resumo = () => this.relatorios.resumo();
  auditoria = (req: Req<unknown, unknown, QPagina & { dias?: number; ator?: string; operacao?: string }>) =>
    this.relatorios.auditoria(pagina(req.query), req.query);
}
