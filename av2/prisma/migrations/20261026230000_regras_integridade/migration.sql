-- Regras de integridade que o Prisma não expressa no schema.
-- A validação principal continua nos serviços; aqui é a última barreira, pra que nenhum
-- caminho (script, SQL manual, bug) consiga gravar um estado inconsistente.

-- Sequências dos códigos legíveis (BR001, LT-000001, EQ-000001). nextval é seguro sob concorrência,
-- diferente do "max + 1" que a AV1 fazia em memória.
CREATE SEQUENCE seq_organizacao_codigo START 1;
CREATE SEQUENCE seq_lote_codigo START 1;
CREATE SEQUENCE seq_equipamento_codigo START 1;

-- ---------- CHECK constraints ----------
ALTER TABLE usuarios
  ADD CONSTRAINT ck_usuarios_nome CHECK (nome ~ '^[a-z][a-z0-9._-]{2,31}$'),
  ADD CONSTRAINT ck_usuarios_falhas CHECK (falhas_login >= 0),
  ADD CONSTRAINT ck_usuarios_versao CHECK (versao >= 1);

ALTER TABLE parametros
  ADD CONSTRAINT ck_parametros_chave CHECK (chave ~ '^(aliquota|depreciacao)\.[A-Za-z0-9_]{1,40}$'),
  ADD CONSTRAINT ck_parametros_valor CHECK (valor >= 0 AND valor <= 100);

ALTER TABLE organizacoes
  ADD CONSTRAINT ck_organizacoes_cnpj CHECK (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  ADD CONSTRAINT ck_organizacoes_nome CHECK (char_length(nome) BETWEEN 3 AND 120),
  ADD CONSTRAINT ck_organizacoes_versao CHECK (versao >= 1);

ALTER TABLE contratos
  ADD CONSTRAINT ck_contratos_periodo CHECK (fim >= inicio),
  ADD CONSTRAINT ck_contratos_prazo CHECK (prazo_armazenamento_dias BETWEEN 1 AND 3650),
  ADD CONSTRAINT ck_contratos_clausulas CHECK (jsonb_typeof(clausulas) = 'array');

ALTER TABLE lotes
  ADD CONSTRAINT ck_lotes_nf CHECK (nota_fiscal ~ '^[0-9]{1,9}$'),
  ADD CONSTRAINT ck_lotes_transportadora CHECK (char_length(transportadora) BETWEEN 2 AND 60);

ALTER TABLE equipamentos
  ADD CONSTRAINT ck_equipamentos_barras CHECK (codigo_barras_interno ~ '^GC[0-9]{9}$'),
  ADD CONSTRAINT ck_equipamentos_valor CHECK (valor_aquisicao IS NULL OR valor_aquisicao >= 0),
  ADD CONSTRAINT ck_equipamentos_ano CHECK (ano_fabricacao IS NULL OR ano_fabricacao BETWEEN 1970 AND 2100),
  -- passou da triagem => os dados da triagem têm que existir (regra "só desmonta após triagem completa")
  ADD CONSTRAINT ck_equipamentos_triagem CHECK (
    status IN ('RECEBIDO', 'EM_TRIAGEM')
    OR (triagem_classe IS NOT NULL AND triagem_em IS NOT NULL AND triagem_responsavel IS NOT NULL)
  ),
  ADD CONSTRAINT ck_equipamentos_versao CHECK (versao >= 1);

-- ---------- Máquina de estados do equipamento ----------
CREATE OR REPLACE FUNCTION fn_equipamento_transicao() RETURNS trigger AS $$
DECLARE
  permitido boolean;
BEGIN
  IF OLD.status IN ('REUTILIZADO', 'RECICLADO', 'DESCARTADO')
     AND (NEW.status <> OLD.status OR NEW.estado <> OLD.estado) THEN
    RAISE EXCEPTION 'GC-TRANSICAO: equipamento % está em status final (%)', OLD.codigo, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status <> OLD.status THEN
    permitido := CASE OLD.status
      WHEN 'RECEBIDO'    THEN NEW.status = 'EM_TRIAGEM'
      WHEN 'EM_TRIAGEM'  THEN NEW.status = 'TRIADO'
      WHEN 'TRIADO'      THEN NEW.status IN ('EM_DESMONTE', 'REUTILIZADO', 'DESCARTADO')
      WHEN 'EM_DESMONTE' THEN NEW.status IN ('RECICLADO', 'REUTILIZADO', 'DESCARTADO')
      ELSE false
    END;
    IF NOT permitido THEN
      RAISE EXCEPTION 'GC-TRANSICAO: transição % -> % não permitida', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_equipamento_transicao
  BEFORE UPDATE ON equipamentos
  FOR EACH ROW EXECUTE FUNCTION fn_equipamento_transicao();

-- Equipamento novo sempre entra como RECEBIDO
CREATE OR REPLACE FUNCTION fn_equipamento_insert() RETURNS trigger AS $$
BEGIN
  IF NEW.status <> 'RECEBIDO' THEN
    RAISE EXCEPTION 'GC-TRANSICAO: equipamento novo deve entrar como RECEBIDO'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_equipamento_insert
  BEFORE INSERT ON equipamentos
  FOR EACH ROW EXECUTE FUNCTION fn_equipamento_insert();

-- ---------- Histórico e auditoria imutáveis (o papel do journal encadeado da AV1) ----------
CREATE OR REPLACE FUNCTION fn_bloquear_alteracao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'GC-IMUTAVEL: registros de % não podem ser alterados nem apagados', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movimentacoes_imutavel
  BEFORE UPDATE OR DELETE ON movimentacoes
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_alteracao();

CREATE TRIGGER trg_auditoria_imutavel
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_alteracao();
