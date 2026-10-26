import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app';
import { carregarArquivoEnv, lerAmbiente } from '../../src/config/ambiente';
import { formatarISO, hojeCivil } from '../../src/dominio/datas';


carregarArquivoEnv();
process.env.DATABASE_URL = process.env.DATABASE_URL_TESTE;
process.env.BCRYPT_CUSTO = '4'; 

const SENHA_ADMIN = 'Admin@Teste2026';
const SENHA = 'Usuario@Teste2026';
const CNPJ_A = '11222333000181';
const CNPJ_B = '12ABC34501DE35';
const hoje = formatarISO(hojeCivil(new Date()));
const daquiA = (dias: number) => { const d = new Date(); d.setDate(d.getDate() + dias); return formatarISO(hojeCivil(d)); };

let app: FastifyInstance;
let prisma: PrismaClient;
const tokens: Record<string, string> = {};

type Opcoes = { token?: string; body?: unknown };
async function chamar(metodo: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, o: Opcoes = {}) {
  const r = await app.inject({
    method: metodo, url,
    headers: o.token ? { authorization: `Bearer ${o.token}` } : {},
    ...(o.body !== undefined ? { payload: o.body as object } : {}),
  });
  return { status: r.statusCode, corpo: r.body ? r.json() : null };
}
const login = async (usuario: string, senha: string) => chamar('POST', '/auth/login', { body: { usuario, senha } });

before(async () => {
  prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  await prisma.usuario.create({ data: { nome: 'admin', papel: 'ADMIN', senhaHash: await bcrypt.hash(SENHA_ADMIN, 4) } });
  app = await construirApp({ ambiente: lerAmbiente(), prisma, logger: false });
  await app.ready();
});

after(async () => {
  await app?.close();
  await prisma?.$disconnect();
});

describe('autenticação e autorização', () => {
  it('health é público e confirma o banco', async () => {
    const r = await chamar('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.banco, 'ok');
  });

  it('login devolve JWT; rotas protegidas exigem o token', async () => {
    const r = await login('admin', SENHA_ADMIN);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.papel, 'ADMIN');
    tokens.admin = r.corpo.token;
    assert.equal((await chamar('GET', '/organizacoes')).status, 401);
    assert.equal((await chamar('GET', '/organizacoes', { token: 'x.y.z' })).status, 401);
    assert.equal((await chamar('GET', '/auth/me', { token: tokens.admin })).corpo.nome, 'admin');
  });

  it('admin cria um usuário de cada papel; senha fraca é recusada', async () => {
    assert.equal((await chamar('POST', '/usuarios', { token: tokens.admin, body: { nome: 'fraco', papel: 'AUDITOR', senha: 'abcdefghij' } })).status, 400);
    for (const [nome, papel] of [['cad', 'CADASTRO'], ['almox', 'ALMOXARIFADO'], ['auditor', 'AUDITOR']]) {
      const r = await chamar('POST', '/usuarios', { token: tokens.admin, body: { nome, papel, senha: SENHA } });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
      assert.equal(r.corpo.senhaHash, undefined); // hash nunca sai da API
      tokens[nome] = (await login(nome, SENHA)).corpo.token;
    }
    assert.equal((await chamar('POST', '/usuarios', { token: tokens.admin, body: { nome: 'cad', papel: 'CADASTRO', senha: SENHA } })).status, 409);
  });

  it('papel sem permissão recebe 403 e a tentativa é auditada', async () => {
    const r = await chamar('POST', '/organizacoes', { token: tokens.auditor, body: { cnpj: CNPJ_A, nome: 'Qualquer', tipo: 'VAREJO' } });
    assert.equal(r.status, 403);
    assert.equal((await chamar('GET', '/usuarios', { token: tokens.almox })).status, 403);
    await new Promise((res) => setTimeout(res, 50)); // a auditoria do 403 é assíncrona
    const aud = await chamar('GET', '/relatorios/auditoria?operacao=ACESSO_NEGADO', { token: tokens.auditor });
    assert.ok(aud.corpo.total >= 2);
  });

  it('5 senhas erradas bloqueiam a conta com mensagem genérica', async () => {
    await chamar('POST', '/usuarios', { token: tokens.admin, body: { nome: 'vitima', papel: 'AUDITOR', senha: SENHA } });
    for (let i = 0; i < 5; i++) {
      const r = await login('vitima', 'Errada@123456');
      assert.equal(r.status, 401);
      assert.equal(r.corpo.mensagem, 'Usuário ou senha inválidos.');
    }
    assert.equal((await login('vitima', SENHA)).status, 429); 
    assert.equal((await login('naoexiste', SENHA)).status, 401);
    
    assert.equal((await chamar('PUT', '/usuarios/vitima/senha', { token: tokens.admin, body: { senha: 'Nova@Senha2026' } })).status, 200);
    assert.equal((await login('vitima', 'Nova@Senha2026')).status, 200);
  });

  it('não dá pra desativar o último admin nem a própria conta', async () => {
    const r = await chamar('PATCH', '/usuarios/admin/ativo', { token: tokens.admin, body: { ativo: false } });
    assert.equal(r.status, 422);
  });
});

describe('cadastro, lotes e regras de negócio', () => {
  it('organização: CNPJ validado e único (inclusive alfanumérico)', async () => {
    assert.equal((await chamar('POST', '/organizacoes', { token: tokens.cad, body: { cnpj: '11222333000182', nome: 'DV Errado', tipo: 'VAREJO' } })).status, 400);
    const a = await chamar('POST', '/organizacoes', { token: tokens.cad, body: { cnpj: '11.222.333/0001-81', nome: 'Magazine Verde', tipo: 'VAREJO' } });
    assert.equal(a.status, 201);
    assert.equal(a.corpo.codigo, 'BR001');
    assert.equal((await chamar('POST', '/organizacoes', { token: tokens.cad, body: { cnpj: CNPJ_A, nome: 'Duplicada', tipo: 'VAREJO' } })).status, 409);
    const b = await chamar('POST', '/organizacoes', { token: tokens.cad, body: { cnpj: CNPJ_B, nome: 'Universidade Alfa', tipo: 'UNIVERSIDADE' } });
    assert.equal(b.status, 201);
  });

  it('lote exige contrato vigente', async () => {
    const r = await chamar('POST', '/lotes', { token: tokens.almox, body: { organizacao: 'BR001', notaFiscal: '123', transportadora: 'TransRápida' } });
    assert.equal(r.status, 422);
    assert.match(r.corpo.mensagem, /contrato/);
  });

  it('contrato 1—0..1: PUT cria e depois substitui com versão', async () => {
    const corpo = { inicio: daquiA(-30), fim: daquiA(365), prazoArmazenamentoDias: 180, clausulas: [{ titulo: 'Coleta', texto: 'Mensal' }] };
    const c1 = await chamar('PUT', '/organizacoes/BR001/contrato', { token: tokens.cad, body: corpo });
    assert.equal(c1.status, 200);
    assert.equal(c1.corpo.versao, 1);
    assert.deepEqual(c1.corpo.clausulas, [{ titulo: 'Coleta', texto: 'Mensal' }]);
    const c2 = await chamar('PUT', '/organizacoes/BR001/contrato', { token: tokens.cad, body: { ...corpo, prazoArmazenamentoDias: 90, versao: 1 } });
    assert.equal(c2.corpo.versao, 2);
    assert.equal(c2.corpo.numero, c1.corpo.numero);
    assert.equal((await chamar('PUT', '/organizacoes/BR001/contrato', { token: tokens.cad, body: { ...corpo, versao: 1 } })).status, 409);
    assert.equal((await chamar('PUT', '/organizacoes/BR001/contrato', { token: tokens.cad, body: { ...corpo, fim: daquiA(-60) } })).status, 400);
  });

  it('lote com data futura ou anterior a 90 dias é recusado', async () => {
    const base = { organizacao: 'BR001', transportadora: 'TransRápida' };
    assert.equal((await chamar('POST', '/lotes', { token: tokens.almox, body: { ...base, notaFiscal: '1', dataEntrada: daquiA(1) } })).status, 400);
    assert.equal((await chamar('POST', '/lotes', { token: tokens.almox, body: { ...base, notaFiscal: '1', dataEntrada: daquiA(-91) } })).status, 400);
  });

  it('lote + equipamentos numa transação só: um item inválido desfaz tudo', async () => {
    const r = await chamar('POST', '/lotes', {
      token: tokens.almox,
      body: {
        organizacao: 'BR001', notaFiscal: '777', transportadora: 'TransRápida',
        equipamentos: [
          { tipo: 'COMPUTADOR', descricao: 'Desktop A', serie: 'DUP-001' },
          { tipo: 'MONITOR', descricao: 'Monitor B', serie: 'DUP-001' },
        ],
      },
    });
    assert.equal(r.status, 409);
    assert.match(r.corpo.mensagem, /Equipamento #2/);
    assert.equal(await prisma.lote.count({ where: { notaFiscal: '777' } }), 0);
    assert.equal(await prisma.equipamento.count({ where: { serie: 'DUP-001' } }), 0);
  });

  it('lote válido com equipamentos; NF única por organização', async () => {
    const r = await chamar('POST', '/lotes', {
      token: tokens.almox,
      body: {
        organizacao: 'br001', notaFiscal: '100234', transportadora: 'TransRápida', dataEntrada: hoje,
        equipamentos: [
          { tipo: 'COMPUTADOR', descricao: 'Desktop Dell', serie: 'dl-001', estado: 'BOM', valorAquisicao: 4000, anoFabricacao: 2022 },
          { tipo: 'SERVIDOR', descricao: 'Servidor HP', serie: 'hp-001', estado: 'EXCELENTE' },
        ],
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.totalEquipamentos, 2);
    assert.match(r.corpo.equipamentos[0].codigoBarrasInterno, /^GC\d{9}$/);
    assert.equal(r.corpo.equipamentos[0].serie, 'DL-001');
    const dup = await chamar('POST', '/lotes', { token: tokens.almox, body: { organizacao: 'BR001', notaFiscal: '100234', transportadora: 'Outra' } });
    assert.equal(dup.status, 409);
  });
});

describe('ciclo de vida do equipamento', () => {
  let eq: string;
  let srv: string;

  before(async () => {
    const lista = await chamar('GET', '/equipamentos?status=RECEBIDO', { token: tokens.auditor });
    eq = lista.corpo.itens.find((e: { tipo: string }) => e.tipo === 'COMPUTADOR').codigo;
    srv = lista.corpo.itens.find((e: { tipo: string }) => e.tipo === 'SERVIDOR').codigo;
  });

  it('não pula etapas: RECEBIDO não vai direto pra desmonte', async () => {
    const r = await chamar('POST', `/equipamentos/${eq}/status`, { token: tokens.almox, body: { status: 'EM_DESMONTE' } });
    assert.equal(r.status, 400);
  });

  it('triagem só em EM_TRIAGEM e queda de 2+ categorias exige justificativa', async () => {
    assert.equal((await chamar('POST', `/equipamentos/${eq}/triagem`, { token: tokens.almox, body: { estado: 'BOM', classe: 'RECICLAVEL' } })).status, 422);
    assert.equal((await chamar('POST', `/equipamentos/${eq}/status`, { token: tokens.almox, body: { status: 'EM_TRIAGEM' } })).status, 200);
    const sem = await chamar('POST', `/equipamentos/${eq}/triagem`, { token: tokens.almox, body: { estado: 'SUCATA', classe: 'RECICLAVEL' } });
    assert.equal(sem.status, 400);
    const com = await chamar('POST', `/equipamentos/${eq}/triagem`, {
      token: tokens.almox, body: { estado: 'RUIM', classe: 'RECICLAVEL', justificativa: 'Gabinete amassado e placa oxidada' },
    });
    assert.equal(com.status, 200);
    assert.equal(com.corpo.status, 'TRIADO');
    assert.equal(com.corpo.triagem.responsavel, 'almox');
  });

  it('desmonte e destino final; status final não muda mais', async () => {
    assert.equal((await chamar('POST', `/equipamentos/${eq}/status`, { token: tokens.almox, body: { status: 'EM_DESMONTE' } })).status, 200);
    assert.equal((await chamar('POST', `/equipamentos/${eq}/status`, { token: tokens.almox, body: { status: 'RECICLADO' } })).status, 200);
    assert.equal((await chamar('POST', `/equipamentos/${eq}/estado`, { token: tokens.almox, body: { estado: 'SUCATA' } })).status, 422);
  });

  it('rastreabilidade registra cada passo, em ordem', async () => {
    const r = await chamar('GET', `/equipamentos/${eq}/movimentacoes`, { token: tokens.auditor });
    assert.deepEqual(r.corpo.map((m: { statusPara: string }) => m.statusPara), ['RECEBIDO', 'EM_TRIAGEM', 'TRIADO', 'EM_DESMONTE', 'RECICLADO']);
    assert.equal(r.corpo[2].justificativa, 'Gabinete amassado e placa oxidada');
  });

  it('detalhe calcula depreciação pelo parâmetro global (polimorfismo)', async () => {
    assert.equal((await chamar('PUT', '/parametros/depreciacao.COMPUTADOR', { token: tokens.almox, body: { valor: 25 } })).status, 403);
    assert.equal((await chamar('PUT', '/parametros/depreciacao.COMPUTADOR', { token: tokens.admin, body: { valor: 25 } })).status, 200);
    const r = await chamar('GET', `/equipamentos/${eq}`, { token: tokens.auditor });
    assert.equal(r.corpo.avaliacao.depreciacaoAnualPct, 25);
    const idade = new Date().getFullYear() - 2022;
    assert.equal(r.corpo.avaliacao.valorResidual, Math.max(0, 4000 * (1 - 0.25 * idade)));
    assert.ok(r.corpo.materiaisRecuperaveis.length > 0);
    const b = await chamar('GET', `/equipamentos/barras/${r.corpo.codigoBarrasInterno}`, { token: tokens.auditor });
    assert.equal(b.corpo.codigo, eq);
  });

  it('versionamento otimista: versão velha recebe 409', async () => {
    const atual = (await chamar('GET', `/equipamentos/${srv}`, { token: tokens.almox })).corpo;
    const ok = await chamar('POST', `/equipamentos/${srv}/estado`, { token: tokens.almox, body: { estado: 'BOM', versao: atual.versao } });
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.versao, atual.versao + 1);
    const velha = await chamar('POST', `/equipamentos/${srv}/estado`, { token: tokens.almox, body: { estado: 'REGULAR', versao: atual.versao } });
    assert.equal(velha.status, 409);
    assert.equal(velha.corpo.erro, 'GC-VERSAO');
  });

  it('concorrência: duas requisições simultâneas sobre a mesma versão — só uma grava', async () => {
    const atual = (await chamar('GET', `/equipamentos/${srv}`, { token: tokens.almox })).corpo;
    const corpo = { status: 'EM_TRIAGEM', versao: atual.versao };
    const rs = await Promise.all([1, 2, 3].map(() => chamar('POST', `/equipamentos/${srv}/status`, { token: tokens.almox, body: corpo })));
    const status = rs.map((r) => r.status).sort();
    assert.deepEqual(status.filter((s) => s === 200).length, 1, JSON.stringify(rs));
    assert.ok(status.filter((s) => s !== 200).every((s) => s === 409 || s === 400));
    const movs = (await chamar('GET', `/equipamentos/${srv}/movimentacoes`, { token: tokens.auditor })).corpo;
    assert.equal(movs.filter((m: { statusPara: string }) => m.statusPara === 'EM_TRIAGEM').length, 1); // nada duplicado
  });
});

describe('barreiras no banco (constraints e triggers)', () => {
  it('movimentações são imutáveis mesmo por SQL direto', async () => {
    await assert.rejects(prisma.$executeRaw`UPDATE movimentacoes SET ator = 'hacker'`, /GC-IMUTAVEL/);
    await assert.rejects(prisma.$executeRaw`DELETE FROM auditoria`, /GC-IMUTAVEL/);
  });

  it('trigger impede pular etapa da máquina de estados fora da API', async () => {
    const e = await prisma.equipamento.findFirstOrThrow({ where: { status: 'RECEBIDO' } }).catch(() => null);
    const alvo = e ?? (await prisma.equipamento.findFirstOrThrow({ where: { status: 'EM_TRIAGEM' } }));
    await assert.rejects(prisma.equipamento.update({ where: { id: alvo.id }, data: { status: 'RECICLADO' } }));
  });

  it('CHECK impede passar da triagem sem dados de triagem', async () => {
    const e = await prisma.equipamento.findFirstOrThrow({ where: { status: 'EM_TRIAGEM' } });
    await assert.rejects(prisma.equipamento.update({ where: { id: e.id }, data: { status: 'TRIADO' } }), /ck_equipamentos_triagem|check/i);
  });

  it('relatório resumo agrega por status e valor', async () => {
    const r = await chamar('GET', '/relatorios/resumo', { token: tokens.auditor });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.totalEquipamentos, 2);
    assert.equal(r.corpo.porStatus.RECICLADO, 1);
  });

  it('erros de validação de esquema viram 400 padronizado', async () => {
    const r = await chamar('POST', '/organizacoes', { token: tokens.cad, body: { cnpj: CNPJ_A, nome: 'X Corp', tipo: 'NAVE_ESPACIAL' } });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.erro, 'GC-VAL');
    assert.equal((await chamar('GET', '/rota-que-nao-existe', { token: tokens.admin })).status, 404);
  });
});
