import { CLASSES_TRIAGEM, ESTADOS, PAPEIS, STATUS, TIPOS_EQUIP, TIPOS_ORG } from '../dominio/tipos';


const texto = (min: number, max: number, extra: object = {}) => ({ type: 'string', minLength: min, maxLength: max, ...extra });
const data = { type: 'string', description: 'AAAA-MM-DD ou DD/MM/AAAA', maxLength: 10 };
const versao = { type: 'integer', minimum: 0, description: 'Versão lida pelo cliente (controle de concorrência otimista)' };
const justificativa = texto(1, 500, { description: 'Obrigatória (≥ 10 caracteres) em queda de 2+ categorias de estado' });

export const paramCodigo = { type: 'object', required: ['codigo'], properties: { codigo: texto(1, 12) } };

export const paginacao = {
  pagina: { type: 'integer', minimum: 1, default: 1 },
  tamanho: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
};

export const login = {
  type: 'object', required: ['usuario', 'senha'], additionalProperties: false,
  properties: { usuario: texto(1, 32), senha: texto(1, 200) },
};

export const alterarSenha = {
  type: 'object', required: ['senhaAtual', 'novaSenha'], additionalProperties: false,
  properties: { senhaAtual: texto(1, 200), novaSenha: texto(10, 200) },
};

export const criarUsuario = {
  type: 'object', required: ['nome', 'papel', 'senha'], additionalProperties: false,
  properties: { nome: texto(3, 32), papel: { type: 'string', enum: PAPEIS }, senha: texto(10, 200) },
};

export const ativoUsuario = {
  type: 'object', required: ['ativo'], additionalProperties: false, properties: { ativo: { type: 'boolean' }, versao },
};

export const redefinirSenha = {
  type: 'object', required: ['senha'], additionalProperties: false, properties: { senha: texto(10, 200) },
};

export const definirParametro = {
  type: 'object', required: ['valor'], additionalProperties: false,
  properties: { valor: { type: 'number', minimum: 0, maximum: 100 }, versao },
};

export const criarOrganizacao = {
  type: 'object', required: ['cnpj', 'nome', 'tipo'], additionalProperties: false,
  properties: { cnpj: texto(14, 18), nome: texto(3, 120), tipo: { type: 'string', enum: TIPOS_ORG } },
};

export const alterarOrganizacao = {
  type: 'object', additionalProperties: false, minProperties: 1,
  properties: { nome: texto(3, 120), ativa: { type: 'boolean' }, versao },
};

export const definirContrato = {
  type: 'object', required: ['inicio', 'fim', 'prazoArmazenamentoDias'], additionalProperties: false,
  properties: {
    inicio: data, fim: data,
    prazoArmazenamentoDias: { type: 'integer', minimum: 1, maximum: 3650 },
    descricao: texto(0, 500),
    clausulas: {
      type: 'array', maxItems: 100,
      items: { type: 'object', required: ['titulo', 'texto'], additionalProperties: false, properties: { titulo: texto(1, 120), texto: texto(1, 4000) } },
    },
    versao,
  },
};

export const dadosEquipamento = {
  type: 'object', required: ['tipo', 'descricao'], additionalProperties: false,
  properties: {
    tipo: { type: 'string', enum: TIPOS_EQUIP },
    descricao: texto(3, 120),
    serie: texto(3, 40),
    estado: { type: 'string', enum: ESTADOS, default: 'BOM' },
    valorAquisicao: { type: 'number', minimum: 0, maximum: 999999999999 },
    anoFabricacao: { type: 'integer', minimum: 1970, maximum: 2100 },
  },
};

export const registrarEquipamento = {
  ...dadosEquipamento,
  required: ['lote', ...dadosEquipamento.required],
  properties: { lote: texto(1, 12), ...dadosEquipamento.properties },
};

export const criarLote = {
  type: 'object', required: ['organizacao', 'notaFiscal', 'transportadora'], additionalProperties: false,
  properties: {
    organizacao: texto(1, 10, { description: 'Código da organização (ex.: BR001)' }),
    notaFiscal: texto(1, 9, { pattern: '^[0-9]+$' }),
    transportadora: texto(2, 60),
    dataEntrada: data,
    equipamentos: { type: 'array', maxItems: 500, items: dadosEquipamento, description: 'Registrados na mesma transação do lote' },
  },
};

export const moverStatus = {
  type: 'object', required: ['status'], additionalProperties: false,
  properties: { status: { type: 'string', enum: STATUS.filter((s) => s !== 'TRIADO') }, observacao: texto(1, 500), versao },
};

export const triagem = {
  type: 'object', required: ['estado', 'classe'], additionalProperties: false,
  properties: {
    estado: { type: 'string', enum: ESTADOS }, classe: { type: 'string', enum: CLASSES_TRIAGEM },
    justificativa, observacao: texto(1, 500), versao,
  },
};

export const alterarEstado = {
  type: 'object', required: ['estado'], additionalProperties: false,
  properties: { estado: { type: 'string', enum: ESTADOS }, justificativa, versao },
};

export const filtroEquipamentos = {
  type: 'object', additionalProperties: false,
  properties: {
    ...paginacao, lote: texto(1, 12),
    status: { type: 'string', enum: STATUS }, tipo: { type: 'string', enum: TIPOS_EQUIP }, estado: { type: 'string', enum: ESTADOS },
  },
};
