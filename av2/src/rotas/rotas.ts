import { FastifyInstance } from 'fastify';
import {
  AutenticacaoController, EquipamentoController, LoteController, OrganizacaoController,
  ParametroController, RelatorioController, UsuarioController,
} from '../controllers/controllers';
import * as S from './esquemas';

export interface Controllers {
  auth: AutenticacaoController;
  usuarios: UsuarioController;
  parametros: ParametroController;
  organizacoes: OrganizacaoController;
  lotes: LoteController;
  equipamentos: EquipamentoController;
  relatorios: RelatorioController;
}

const seguro = [{ bearerAuth: [] }];


export function registrarRotas(app: FastifyInstance, c: Controllers): void {
  app.post('/auth/login', {
    config: { publica: true },
    schema: { tags: ['Autenticação'], summary: 'Troca usuário e senha por um JWT', body: S.login },
  }, c.auth.login);
  app.get('/auth/me', { schema: { tags: ['Autenticação'], summary: 'Usuário do token', security: seguro } }, c.auth.perfil);
  app.put('/auth/senha', {
    schema: { tags: ['Autenticação'], summary: 'Altera a própria senha', security: seguro, body: S.alterarSenha },
  }, c.auth.alterarSenha);

  const u = { tags: ['Usuários'], security: seguro };
  app.get('/usuarios', { config: { permissao: 'usuario:gerir' }, schema: { ...u, summary: 'Lista contas' } }, c.usuarios.listar);
  app.post('/usuarios', { config: { permissao: 'usuario:gerir' }, schema: { ...u, summary: 'Cria conta', body: S.criarUsuario } }, c.usuarios.criar);
  app.patch('/usuarios/:nome/ativo', {
    config: { permissao: 'usuario:gerir' }, schema: { ...u, summary: 'Desativa/reativa conta', body: S.ativoUsuario },
  }, c.usuarios.alterarAtivo);
  app.put('/usuarios/:nome/senha', {
    config: { permissao: 'usuario:gerir' }, schema: { ...u, summary: 'Redefine senha (e destrava a conta)', body: S.redefinirSenha },
  }, c.usuarios.redefinirSenha);

  const p = { tags: ['Parâmetros'], security: seguro };
  app.get('/parametros', { config: { permissao: 'param:ler' }, schema: { ...p, summary: 'Alíquotas e coeficientes de depreciação' } }, c.parametros.listar);
  app.put('/parametros/:chave', {
    config: { permissao: 'param:gerir' }, schema: { ...p, summary: 'Define um parâmetro (admin)', body: S.definirParametro },
  }, c.parametros.definir);

  const o = { tags: ['Organizações'], security: seguro };
  app.get('/organizacoes', {
    config: { permissao: 'org:ler' },
    schema: { ...o, summary: 'Lista organizações', querystring: { type: 'object', properties: { ...S.paginacao, ativa: { type: 'boolean' }, busca: { type: 'string', maxLength: 120 } } } },
  }, c.organizacoes.listar);
  app.post('/organizacoes', { config: { permissao: 'org:escrever' }, schema: { ...o, summary: 'Cadastra organização', body: S.criarOrganizacao } }, c.organizacoes.criar);
  app.get('/organizacoes/:codigo', { config: { permissao: 'org:ler' }, schema: { ...o, summary: 'Detalha organização', params: S.paramCodigo } }, c.organizacoes.obter);
  app.patch('/organizacoes/:codigo', {
    config: { permissao: 'org:escrever' }, schema: { ...o, summary: 'Altera nome/ativa', params: S.paramCodigo, body: S.alterarOrganizacao },
  }, c.organizacoes.alterar);
  app.put('/organizacoes/:codigo/contrato', {
    config: { permissao: 'org:escrever' }, schema: { ...o, summary: 'Cria ou substitui o contrato de coleta', params: S.paramCodigo, body: S.definirContrato },
  }, c.organizacoes.definirContrato);

  const l = { tags: ['Lotes'], security: seguro };
  app.get('/lotes', {
    config: { permissao: 'lote:ler' },
    schema: { ...l, summary: 'Lista lotes', querystring: { type: 'object', properties: { ...S.paginacao, organizacao: { type: 'string', maxLength: 10 } } } },
  }, c.lotes.listar);
  app.post('/lotes', {
    config: { permissao: 'lote:escrever' }, schema: { ...l, summary: 'Registra chegada de lote (com equipamentos, atômico)', body: S.criarLote },
  }, c.lotes.criar);
  app.get('/lotes/:codigo', { config: { permissao: 'lote:ler' }, schema: { ...l, summary: 'Detalha lote e equipamentos', params: S.paramCodigo } }, c.lotes.obter);
  app.post('/lotes/:codigo/equipamentos', {
    config: { permissao: 'equip:escrever' }, schema: { ...l, summary: 'Adiciona equipamento ao lote', params: S.paramCodigo, body: S.dadosEquipamento },
  }, c.lotes.adicionarEquipamento);

  const e = { tags: ['Equipamentos'], security: seguro };
  app.get('/equipamentos', { config: { permissao: 'equip:ler' }, schema: { ...e, summary: 'Lista/filtra equipamentos', querystring: S.filtroEquipamentos } }, c.equipamentos.listar);
  app.post('/equipamentos', { config: { permissao: 'equip:escrever' }, schema: { ...e, summary: 'Registra equipamento', body: S.registrarEquipamento } }, c.equipamentos.registrar);
  app.get('/equipamentos/barras/:barras', {
    config: { permissao: 'equip:ler' }, schema: { ...e, summary: 'Busca pelo código de barras interno' },
  }, c.equipamentos.obterPorBarras);
  app.get('/equipamentos/:codigo', {
    config: { permissao: 'equip:ler' }, schema: { ...e, summary: 'Detalha equipamento (depreciação, valor residual, materiais)', params: S.paramCodigo },
  }, c.equipamentos.obter);
  app.post('/equipamentos/:codigo/status', {
    config: { permissao: 'equip:escrever' }, schema: { ...e, summary: 'Muda status (RECEBIDO→EM_TRIAGEM→...)', params: S.paramCodigo, body: S.moverStatus },
  }, c.equipamentos.moverStatus);
  app.post('/equipamentos/:codigo/triagem', {
    config: { permissao: 'equip:escrever' }, schema: { ...e, summary: 'Conclui a triagem (exige EM_TRIAGEM)', params: S.paramCodigo, body: S.triagem },
  }, c.equipamentos.triar);
  app.post('/equipamentos/:codigo/estado', {
    config: { permissao: 'equip:escrever' }, schema: { ...e, summary: 'Altera estado físico', params: S.paramCodigo, body: S.alterarEstado },
  }, c.equipamentos.alterarEstado);
  app.get('/equipamentos/:codigo/movimentacoes', {
    config: { permissao: 'equip:ler' }, schema: { ...e, summary: 'Rastreabilidade completa', params: S.paramCodigo },
  }, c.equipamentos.rastrear);

  const r = { tags: ['Relatórios'], security: seguro };
  app.get('/relatorios/resumo', { config: { permissao: 'relatorio:ler' }, schema: { ...r, summary: 'Resumo operacional e financeiro' } }, c.relatorios.resumo);
  app.get('/relatorios/auditoria', {
    config: { permissao: 'auditoria:ler' },
    schema: {
      ...r, summary: 'Trilha de auditoria',
      querystring: { type: 'object', properties: { ...S.paginacao, dias: { type: 'integer', minimum: 1, maximum: 3650 }, ator: { type: 'string', maxLength: 32 }, operacao: { type: 'string', maxLength: 40 } } },
    },
  }, c.relatorios.auditoria);
}
