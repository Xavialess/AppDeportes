// ─── Enums ───────────────────────────────────────────────────────────────────

export type UserRole = 'player' | 'owner' | 'admin';
export type SubscriptionStatus = 'active' | 'inactive' | 'trial' | 'cancelled';
export type MatchType = 'open' | 'reservation';
export type MatchStatus = 'open' | 'confirmed' | 'en_curso' | 'jugado' | 'completed' | 'cancelled';
export type EnrollmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'refunded';
export type PaymentMethod = 'in_app' | 'in_person';
export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'failed';

// ─── Domain Models ────────────────────────────────────────────────────────────

export interface Country {
  id: string;
  name: string;
  code: string;
  currency_code: string;
  currency_symbol: string;
  is_active: boolean;
  created_at: string;
}

export interface City {
  id: string;
  country_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Sport {
  id: string;
  name: string;
  icon: string | null;
  formats: string[];
  is_active: boolean;
  created_at: string;
}

export interface CitySport {
  id: string;
  city_id: string;
  sport_id: string;
  is_active: boolean;
  created_at: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  max_matches_per_month: number;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: UserRole;
  is_pro: boolean;
  matches_played: number;
  created_at: string;
}

export interface OwnerProfile {
  id: string;
  user_id: string;
  plan_id: string | null;
  subscription_status: SubscriptionStatus;
  cancellation_count: number;
  created_at: string;
}

export interface Club {
  id: string;
  owner_id: string;
  city_id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  images: string[];
  is_active: boolean;
  created_at: string;
}

export interface Field {
  id: string;
  club_id: string;
  city_id: string;
  name: string;
  images: string[];
  created_at: string;
}

export interface Match {
  id: string;
  field_id: string;
  sport_id: string;
  type: MatchType;
  status: MatchStatus;
  date: string;
  start_time: string;
  end_time: string;
  format: string;
  price_per_player: number | null;
  total_price: number | null;
  min_players: number | null;
  max_players: number | null;
  confirmation_deadline: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  enrolled_count_at_cancellation: number | null;
  is_visible: boolean;
  created_at: string;
}

export interface Enrollment {
  id: string;
  match_id: string;
  user_id: string;
  status: EnrollmentStatus;
  attended: boolean | null;
  payment_id: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  match_id: string;
  enrollment_id: string | null;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string | null;
  provider_transaction_id: string | null;
  created_at: string;
}

// ─── Extended / joined views ─────────────────────────────────────────────────

export interface MatchWithDetails extends Match {
  field: Field;
  sport: Sport;
  enrolled_count?: number;
}

export interface EnrollmentWithMatch extends Enrollment {
  match: MatchWithDetails;
}

export interface FieldWithCity extends Field {
  city: City & { country: Country };
}

export interface FieldWithClub extends Field {
  club: Club;
}

export interface ClubWithCity extends Club {
  city: City & { country: Country };
}
