export function formatPrice(amount: number | null | undefined, currency = '$'): string {
  if (amount == null) return '—';
  if (amount % 1 === 0) {
    return `${currency}${amount}`;
  }
  return `${currency}${amount.toFixed(2)}`;
}
