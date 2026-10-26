// Seed de desenvolvimento: popula o banco com uma massa representativa (usuários dos 4 papéis,
// organizações com e sem contrato, lotes e equipamentos em vários status).
// Passa pelos serviços de propósito — assim o seed também prova que as regras da AV1 vieram junto.
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { carregarArquivoEnv } from '../src/config/ambiente';
import { formatarISO, hojeCivil } from '../src/dominio/datas';
import { UnidadeDeTrabalho } from '../src/repositorios/repositorios';
import { Ator } from '../src/servicos/comum';
import { EquipamentoServico } from '../src/servicos/equipamento.servico';
import { LoteServico } from '../src/servicos/lote.servico';
import { OrganizacaoServico } from '../src/servicos/organizacao.servico';
import { ParametroServico } from '../src/servicos/parametro.servico';

carregarArquivoEnv();

// completa 12 posições com os 2 DVs (aceita base alfanumérica, regra de jul/2026)
export function gerarCnpj(base12: string): string {
  const dv = (b: string, pesos: number[]) => {
    const s = pesos.reduce((acc, p, i) => acc + (b.charCodeAt(i) - 48) * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${d1}${d2}`;
}

const diasAtras = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatarISO(hojeCivil(d));
};

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    if ((await prisma.usuario.count()) > 0) {
      console.log('[AVISO] banco já tem usuários; seed não executado (use npm run db:reset pra recomeçar).');
      return;
    }
    const custo = Number(process.env.BCRYPT_CUSTO ?? 12);
    const senhaAdmin = process.env.SEED_SENHA_ADMIN ?? 'Admin@Green2026';
    const senhaPadrao = process.env.SEED_SENHA_PADRAO ?? 'Teste@Green2026';

    const usuarios = [
      { nome: 'admin', papel: 'ADMIN' as const, senha: senhaAdmin },
      { nome: 'cadastro', papel: 'CADASTRO' as const, senha: senhaPadrao },
      { nome: 'almox', papel: 'ALMOXARIFADO' as const, senha: senhaPadrao },
      { nome: 'auditor', papel: 'AUDITOR' as const, senha: senhaPadrao },
    ];
    for (const u of usuarios) {
      await prisma.usuario.create({ data: { nome: u.nome, papel: u.papel, senhaHash: await bcrypt.hash(u.senha, custo) } });
    }

    const uow = new UnidadeDeTrabalho(prisma);
    const params = new ParametroServico(uow);
    const orgs = new OrganizacaoServico(uow);
    const equips = new EquipamentoServico(uow, params);
    const lotes = new LoteServico(uow, equips);
    const admin: Ator = { nome: 'admin', papel: 'ADMIN' };
    const cadastro: Ator = { nome: 'cadastro', papel: 'CADASTRO' };
    const almox: Ator = { nome: 'almox', papel: 'ALMOXARIFADO' };

    await params.definir(admin, 'depreciacao.SERVIDOR', 25);

    const varejo = await orgs.criar(cadastro, { cnpj: gerarCnpj('112223330001'), nome: 'Magazine Verde S.A.', tipo: 'VAREJO' });
    const hospital = await orgs.criar(cadastro, { cnpj: gerarCnpj('445556660001'), nome: 'Hospital Santa Clara', tipo: 'HOSPITAL' });
    const univ = await orgs.criar(cadastro, { cnpj: gerarCnpj('12ABC34501DE'), nome: 'Universidade Federal do Vale', tipo: 'UNIVERSIDADE' });
    // sem contrato: lote para ela deve ser recusado
    await orgs.criar(cadastro, { cnpj: gerarCnpj('778889990001'), nome: 'Banco Horizonte', tipo: 'BANCO' });

    const contrato = (meses: number) => ({
      inicio: diasAtras(120), fim: diasAtras(-30 * meses), prazoArmazenamentoDias: 180, descricao: 'Coleta e destinação de REEE',
      clausulas: [
        { titulo: 'Coleta', texto: 'Coleta mensal no endereço da contratante.' },
        { titulo: 'Certificado', texto: 'Emissão de certificado de destinação final por lote.' },
      ],
    });
    await orgs.definirContrato(cadastro, varejo.codigo, contrato(12));
    await orgs.definirContrato(cadastro, hospital.codigo, contrato(6));
    await orgs.definirContrato(cadastro, univ.codigo, contrato(24));

    const l1 = await lotes.criar(almox, {
      organizacao: varejo.codigo, notaFiscal: '100234', transportadora: 'TransRápida', dataEntrada: diasAtras(40),
      equipamentos: [
        { tipo: 'COMPUTADOR', descricao: 'Desktop Dell OptiPlex 7010', serie: 'DL7010-001', estado: 'BOM', valorAquisicao: 4200, anoFabricacao: 2019 },
        { tipo: 'COMPUTADOR', descricao: 'Desktop Dell OptiPlex 7010', serie: 'DL7010-002', estado: 'REGULAR', valorAquisicao: 4200, anoFabricacao: 2019 },
        { tipo: 'MONITOR', descricao: 'Monitor LG 24"', serie: 'LG24-778', estado: 'EXCELENTE', valorAquisicao: 900, anoFabricacao: 2022 },
        { tipo: 'PERIFERICO', descricao: 'Teclados e mouses (caixa)', estado: 'RUIM' },
      ],
    });
    const l2 = await lotes.criar(almox, {
      organizacao: hospital.codigo, notaFiscal: '558812', transportadora: 'LogMed Express', dataEntrada: diasAtras(10),
      equipamentos: [
        { tipo: 'SERVIDOR', descricao: 'Servidor HP ProLiant DL380', serie: 'HPDL380-G9-01', estado: 'BOM', valorAquisicao: 38000, anoFabricacao: 2017 },
        { tipo: 'TELECOM', descricao: 'Switch Cisco 2960 48p', serie: 'CS2960-4411', estado: 'BOM', valorAquisicao: 7500, anoFabricacao: 2016 },
      ],
    });
    await lotes.criar(almox, {
      organizacao: univ.codigo, notaFiscal: '9001', transportadora: 'Correios', dataEntrada: diasAtras(2),
      equipamentos: [{ tipo: 'OUTRO', descricao: 'Projetor Epson PowerLite', estado: 'REGULAR' }],
    });

    // leva alguns equipamentos por caminhos diferentes da máquina de estados
    const [c1, c2, mon, per] = l1.equipamentos.map((e) => e.codigo);
    const [srv, sw] = l2.equipamentos.map((e) => e.codigo);

    for (const c of [c1, c2, mon, per, srv]) await equips.moverStatus(almox, c, { status: 'EM_TRIAGEM' });
    await equips.triar(almox, c1, { estado: 'BOM', classe: 'REUTILIZAVEL', observacao: 'Liga e passa no POST' });
    await equips.moverStatus(almox, c1, { status: 'REUTILIZADO', observacao: 'Doado ao programa de inclusão digital' });
    await equips.triar(almox, c2, { estado: 'SUCATA', classe: 'RECICLAVEL', justificativa: 'Placa-mãe com capacitores estufados e gabinete amassado' });
    await equips.moverStatus(almox, c2, { status: 'EM_DESMONTE' });
    await equips.moverStatus(almox, c2, { status: 'RECICLADO' });
    await equips.triar(almox, mon, { estado: 'BOM', classe: 'REUTILIZAVEL' });
    await equips.triar(almox, per, { estado: 'SUCATA', classe: 'DESCARTE_SEGURO' });
    await equips.moverStatus(almox, per, { status: 'DESCARTADO' });
    await equips.alterarEstado(almox, sw, { estado: 'REGULAR' });
    // srv fica EM_TRIAGEM; o projetor da universidade fica RECEBIDO

    console.log('[SUCESSO] seed concluído.');
    console.log(`  usuários: admin (SEED_SENHA_ADMIN), cadastro / almox / auditor (SEED_SENHA_PADRAO)`);
    console.log(`  organizações: ${varejo.codigo}, ${hospital.codigo}, ${univ.codigo} (com contrato) e uma sem contrato`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`[ERRO] seed falhou: ${(e as Error).message}`);
  process.exit(1);
});
