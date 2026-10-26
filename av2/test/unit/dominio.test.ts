import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseData } from '../../src/dominio/datas';
import { FabricaEquipamento, Servidor } from '../../src/dominio/equipamentos';
import { PapelUsuario } from '../../src/dominio/papeis';
import {
  ValidadorCNPJ, ValidadorDataLote, ValidadorMudancaEstado, ValidadorSenha, ValidadorTransicaoStatus,
} from '../../src/dominio/validadores';



describe('ValidadorCNPJ', () => {
  const v = new ValidadorCNPJ();
  it('aceita CNPJ numérico válido, com ou sem máscara', () => {
    assert.ok(v.validar('11.222.333/0001-81').ok);
    assert.ok(v.validar('11222333000181').ok);
  });
  it('aceita CNPJ alfanumérico (jul/2026)', () => assert.ok(v.validar('12ABC34501DE35').ok));
  it('recusa DV errado e dígitos repetidos', () => {
    assert.equal(v.validar('11222333000182').ok, false);
    assert.equal(v.validar('11111111111111').ok, false);
  });
});

describe('ValidadorDataLote', () => {
  const v = new ValidadorDataLote(() => new Date(2026, 9, 26, 12));
  it('aceita hoje e até 90 dias atrás', () => {
    assert.ok(v.validar('2026-10-26').ok);
    assert.ok(v.validar('28/07/2026').ok);
  });
  it('recusa data futura, muito antiga ou inexistente', () => {
    assert.equal(v.validar('2026-10-27').ok, false);
    assert.equal(v.validar('2026-07-27').ok, false);
    assert.equal(v.validar('2026-02-30').ok, false);
  });
});

describe('máquina de estados', () => {
  const v = new ValidadorTransicaoStatus();
  it('só desmonta depois da triagem completa', () => {
    assert.ok(v.validar({ atual: 'TRIADO', para: 'EM_DESMONTE', triagemCompleta: true }).ok);
    assert.equal(v.validar({ atual: 'TRIADO', para: 'EM_DESMONTE', triagemCompleta: false }).ok, false);
    assert.equal(v.validar({ atual: 'EM_TRIAGEM', para: 'EM_DESMONTE', triagemCompleta: true }).ok, false);
  });
  it('status final não sai do lugar', () => assert.equal(v.validar({ atual: 'RECICLADO', para: 'REUTILIZADO', triagemCompleta: true }).ok, false));
});

describe('ValidadorMudancaEstado', () => {
  const v = new ValidadorMudancaEstado();
  it('queda de 1 categoria dispensa justificativa', () => assert.ok(v.validar({ de: 'BOM', para: 'REGULAR' }).ok));
  it('queda de 2+ exige justificativa de 10+ caracteres', () => {
    assert.equal(v.validar({ de: 'BOM', para: 'RUIM', justificativa: 'curta' }).ok, false);
    assert.ok(v.validar({ de: 'BOM', para: 'RUIM', justificativa: 'tela trincada em transporte' }).ok);
  });
});

describe('ValidadorSenha', () => {
  const v = new ValidadorSenha();
  it('exige complexidade e recusa senha com o nome do usuário', () => {
    assert.ok(v.validar({ senha: 'Verde@Forte2026', usuario: 'maria' }).ok);
    assert.equal(v.validar({ senha: 'fraca', usuario: 'maria' }).ok, false);
    assert.equal(v.validar({ senha: 'Maria@Forte2026', usuario: 'maria' }).ok, false);
  });
  it('recusa senha acima de 72 bytes (limite do bcrypt)', () => {
    assert.equal(v.validar({ senha: `Aa1@${'x'.repeat(80)}`, usuario: 'maria' }).ok, false);
  });
});

describe('papéis (polimorfismo)', () => {
  it('cada papel responde pelas suas permissões', () => {
    assert.ok(PapelUsuario.porNome('ADMIN').pode('usuario:gerir'));
    assert.equal(PapelUsuario.porNome('AUDITOR').pode('equip:escrever'), false);
    assert.ok(PapelUsuario.porNome('AUDITOR').pode('auditoria:ler'));
    assert.equal(PapelUsuario.porNome('CADASTRO').pode('lote:escrever'), false);
    assert.ok(PapelUsuario.porNome('ALMOXARIFADO').pode('equip:escrever'));
  });
});

describe('equipamentos (herança + fábrica)', () => {
  it('fábrica devolve a subclasse certa', () => {
    assert.ok(FabricaEquipamento.criar('SERVIDOR', { valorAquisicao: null, anoFabricacao: null }) instanceof Servidor);
  });
  it('depreciação linear usa o parâmetro global e nunca fica negativa', () => {
    const e = FabricaEquipamento.criar('TELECOM', { valorAquisicao: 1000, anoFabricacao: 2020 });
    assert.equal(e.avaliar(() => undefined, 2026).valorResidual, 400); // padrão 10%/ano * 6 anos
    assert.equal(e.avaliar(() => 50, 2026).valorResidual, 0);
  });
  it('código de barras tem DV módulo 10', () => {
    assert.equal(FabricaEquipamento.codigoBarras(2), 'GC000000028');
    assert.match(FabricaEquipamento.codigoBarras(12345), /^GC\d{9}$/);
  });
});

describe('datas', () => {
  it('lê os dois formatos aceitos', () => {
    assert.deepEqual(parseData('2026-10-26'), { a: 2026, m: 10, d: 26 });
    assert.deepEqual(parseData('26/10/2026'), { a: 2026, m: 10, d: 26 });
  });
});
