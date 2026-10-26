import { diaOrdinal, hojeCivil, parseData } from './datas';
import { ErroValidacao } from './erros';
import { EstadoFisico, PESO_ESTADO, StatusEquipamento, TRANSICOES } from './tipos';

export const LOTE_MAX_DIAS_RETROATIVO = 90;

export interface ResultadoValidacao { ok: boolean; erros: string[] }

export abstract class Validador<T> {
  abstract validar(valor: T): ResultadoValidacao;
  exigir(valor: T): void {
    const r = this.validar(valor);
    if (!r.ok) throw new ErroValidacao(r.erros.join(' '));
  }
  protected resultado(erros: string[]): ResultadoValidacao { return { ok: erros.length === 0, erros }; }
}

export class ValidadorCNPJ extends Validador<string> {
  static normalizar(s: string): string { return s.replace(/[.\/\-\s]/g, '').toUpperCase(); }
  static formatar(s: string): string {
    const n = ValidadorCNPJ.normalizar(s);
    return n.length === 14 ? `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}` : s;
  }
  private static dv(base: string, pesos: number[]): number {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += (base.charCodeAt(i) - 48) * pesos[i];
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  }
  validar(valor: string): ResultadoValidacao {
    const n = ValidadorCNPJ.normalizar(valor);
    if (!/^[0-9A-Z]{12}\d{2}$/.test(n)) return this.resultado(['CNPJ com formato inválido (14 posições, DV numéricos).']);
    if (/^(\d)\1{13}$/.test(n)) return this.resultado(['CNPJ inválido (dígitos repetidos).']);
    const d1 = ValidadorCNPJ.dv(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = ValidadorCNPJ.dv(n.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    if (d1 !== +n[12] || d2 !== +n[13]) return this.resultado(['CNPJ inválido (dígitos verificadores não conferem).']);
    return this.resultado([]);
  }
}

export class ValidadorDataLote extends Validador<string> {
  constructor(private readonly relogio: () => Date = () => new Date()) { super(); }
  validar(valor: string): ResultadoValidacao {
    const c = parseData(valor);
    if (!c) return this.resultado(['Data inválida. Use AAAA-MM-DD ou DD/MM/AAAA.']);
    const dif = diaOrdinal(hojeCivil(this.relogio())) - diaOrdinal(c);
    if (dif < 0) return this.resultado(['Data de entrada futura não é permitida.']);
    if (dif > LOTE_MAX_DIAS_RETROATIVO) {
      return this.resultado([`Data de entrada anterior a mais de ${LOTE_MAX_DIAS_RETROATIVO} dias não é permitida.`]);
    }
    return this.resultado([]);
  }
}

type Transicao = { atual: StatusEquipamento; para: StatusEquipamento; triagemCompleta: boolean };

export class ValidadorTransicaoStatus extends Validador<Transicao> {
  validar(v: Transicao): ResultadoValidacao {
    if (!TRANSICOES[v.atual].includes(v.para)) {
      const ok = TRANSICOES[v.atual].join(', ') || '(estado final)';
      return this.resultado([`Transição ${v.atual} → ${v.para} não permitida. Próximos status válidos: ${ok}.`]);
    }
    if (v.para === 'EM_DESMONTE' && (v.atual !== 'TRIADO' || !v.triagemCompleta)) {
      return this.resultado(['O equipamento só pode ir para EM_DESMONTE após triagem completa.']);
    }
    return this.resultado([]);
  }
}

type MudancaEstado = { de: EstadoFisico; para: EstadoFisico; justificativa?: string };

export class ValidadorMudancaEstado extends Validador<MudancaEstado> {
  validar(v: MudancaEstado): ResultadoValidacao {
    const queda = PESO_ESTADO[v.de] - PESO_ESTADO[v.para];
    if (queda >= 2 && (v.justificativa ?? '').trim().length < 10) {
      return this.resultado([`Queda de ${queda} categorias (${v.de} → ${v.para}) exige justificativa (mín. 10 caracteres).`]);
    }
    return this.resultado([]);
  }
}

export class ValidadorSenha extends Validador<{ senha: string; usuario: string }> {
  validar({ senha, usuario }: { senha: string; usuario: string }): ResultadoValidacao {
    const e: string[] = [];
    if (senha.length < 10) e.push('mínimo de 10 caracteres');
    // bcrypt ignora o que passa de 72 bytes, então nem aceitamos
    if (Buffer.byteLength(senha, 'utf8') > 72) e.push('máximo de 72 bytes');
    if (!/[a-z]/.test(senha)) e.push('uma letra minúscula');
    if (!/[A-Z]/.test(senha)) e.push('uma letra maiúscula');
    if (!/\d/.test(senha)) e.push('um dígito');
    if (!/[^A-Za-z0-9]/.test(senha)) e.push('um símbolo');
    if (usuario && senha.toLowerCase().includes(usuario.toLowerCase())) e.push('não conter o nome de usuário');
    return this.resultado(e.length ? [`Senha fraca. Requisitos: ${e.join('; ')}.`] : []);
  }
}
