import type { Match, MatchStatus, EnrollmentStatus } from '@appdeportes/types';

// ─── Date / time ─────────────────────────────────────────────────────────────

export function formatDate(iso: string, locale = 'es-EC'): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 || 12;
  return `${display}:${m} ${ampm}`;
}

export function formatCurrency(amount: number, symbol = '$'): string {
  return `${symbol}${amount.toFixed(2)}`;
}

// ─── Match helpers ────────────────────────────────────────────────────────────

export function isMatchBookable(match: Match): boolean {
  if (!match.is_visible) return false;
  if (match.status !== 'open') return false;
  if (match.type === 'open' && match.max_players !== null) {
    return true; // enrollment count check happens server-side
  }
  return match.type === 'reservation';
}

export function matchStatusLabel(status: MatchStatus): string {
  const labels: Record<MatchStatus, string> = {
    open: 'Abierto',
    confirmed: 'Confirmado',
    en_curso: 'En curso',
    jugado: 'Jugado',
    completed: 'Completado',
    cancelled: 'Cancelado',
  };
  return labels[status];
}

export function enrollmentStatusLabel(status: EnrollmentStatus): string {
  const labels: Record<EnrollmentStatus, string> = {
    pending: 'Pendiente',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    refunded: 'Reembolsado',
  };
  return labels[status];
}

// ─── Validation helpers ───────────────────────────────────────────────────────

export function isValidPhone(phone: string): boolean {
  // Ecuador mobile: 09XXXXXXXX (10 digits)
  return /^09\d{8}$/.test(phone.trim());
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
