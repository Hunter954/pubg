export function int(n) {
  return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function num(n, digits = 1) {
  return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

export function kd(kills, deaths) {
  const d = Number(deaths || 0);
  if (d <= 0) return Number(kills || 0).toFixed(2);
  return (Number(kills || 0) / d).toFixed(2);
}
