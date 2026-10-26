
export interface DataCivil { a: number; m: number; d: number }

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

export function parseData(s: string): DataCivil | null {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  let a: number, mes: number, d: number;
  if (m) { a = +m[1]; mes = +m[2]; d = +m[3]; }
  else {
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
    if (!m) return null;
    d = +m[1]; mes = +m[2]; a = +m[3];
  }
  const t = new Date(Date.UTC(a, mes - 1, d));
  if (t.getUTCFullYear() !== a || t.getUTCMonth() !== mes - 1 || t.getUTCDate() !== d) return null;
  return { a, m: mes, d };
}

export const diaOrdinal = (c: DataCivil): number => Math.floor(Date.UTC(c.a, c.m - 1, c.d) / 86_400_000);
export const formatarISO = (c: DataCivil): string => `${pad(c.a, 4)}-${pad(c.m, 2)}-${pad(c.d, 2)}`;
// "hoje" é o dia local do servidor, igual na AV1
export const hojeCivil = (agora: Date): DataCivil => ({ a: agora.getFullYear(), m: agora.getMonth() + 1, d: agora.getDate() });

export const paraDate = (c: DataCivil): Date => new Date(Date.UTC(c.a, c.m - 1, c.d));
export const deDate = (d: Date): DataCivil => ({ a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() });
export const dateISO = (d: Date): string => formatarISO(deDate(d));
