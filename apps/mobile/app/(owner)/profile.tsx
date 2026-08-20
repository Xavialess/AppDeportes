import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing, fonts } from '../../lib/theme';
import { useSession } from '../../hooks/useSession';
import CanchaLoader from '../../components/CanchaLoader';

interface OwnerProfile {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  cancellation_count: number;
  plan_id: string | null;
  plans: { name: string } | null;
  deuna_merchant_id: string | null;
  deuna_phone_linked: string | null;
}

function getInitials(name: string | null, email: string | null): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.trim().slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '??';
}

export default function OwnerProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, loading: sessionLoading } = useSession();

  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const hasFetched = useRef(false);

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editingDeuna, setEditingDeuna] = useState(false);
  const [merchantIdInput, setMerchantIdInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [savingDeuna, setSavingDeuna] = useState(false);
  const [deunaError, setDeunaError] = useState<string | null>(null);

  async function fetchProfile() {
    if (!user) return;
    setError(null);
    try {
      const [{ data: userData, error: userErr }, { data: ownerData }] = await Promise.all([
        supabase.from('users').select('id, name, email, avatar').eq('id', user.id).single(),
        supabase
          .from('owner_profiles')
          .select('cancellation_count, plan_id, plans(name), deuna_merchant_id, deuna_phone_linked')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (userErr) throw userErr;

      setProfile({
        id: userData.id,
        name: userData.name,
        email: userData.email,
        avatar: userData.avatar,
        cancellation_count: ownerData?.cancellation_count ?? 0,
        plan_id: ownerData?.plan_id ?? null,
        plans: (ownerData?.plans as { name: string } | null) ?? null,
        deuna_merchant_id: ownerData?.deuna_merchant_id ?? null,
        deuna_phone_linked: ownerData?.deuna_phone_linked ?? null,
      });
    } catch {
      setError('No se pudo cargar el perfil. Intenta de nuevo.');
    }
  }

  async function loadData() {
    setLoading(true);
    await fetchProfile();
    setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      if (!sessionLoading && !hasFetched.current) {
        hasFetched.current = true;
        loadData();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionLoading, user?.id])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function startEditing() {
    setNameInput(profile?.name ?? '');
    setSaveError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSaveError(null);
  }

  async function saveName() {
    if (!user) return;
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setSaveError('El nombre no puede estar vacío.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const { error: err } = await supabase
        .from('users')
        .update({ name: trimmed })
        .eq('id', user.id);
      if (err) throw err;
      setProfile((prev) => prev ? { ...prev, name: trimmed } : prev);
      setEditing(false);
    } catch {
      setSaveError('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function startEditingDeuna() {
    setMerchantIdInput(profile?.deuna_merchant_id ?? '');
    setPhoneInput(profile?.deuna_phone_linked ?? '');
    setDeunaError(null);
    setEditingDeuna(true);
  }

  function cancelEditingDeuna() {
    setEditingDeuna(false);
    setDeunaError(null);
  }

  async function saveDeuna() {
    if (!user) return;
    const merchantId = merchantIdInput.trim();
    const phone = phoneInput.trim();
    if (!merchantId || !phone) {
      setDeunaError('Ambos campos son obligatorios para activar De Una.');
      return;
    }
    setSavingDeuna(true);
    setDeunaError(null);
    try {
      const { error: err } = await supabase
        .from('owner_profiles')
        .update({ deuna_merchant_id: merchantId, deuna_phone_linked: phone })
        .eq('user_id', user.id);
      if (err) throw err;
      setProfile((prev) =>
        prev ? { ...prev, deuna_merchant_id: merchantId, deuna_phone_linked: phone } : prev
      );
      setEditingDeuna(false);
    } catch {
      setDeunaError('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSavingDeuna(false);
    }
  }

  async function pickAndUploadAvatar() {
    if (!user) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const storagePath = `${user.id}/avatar.${ext}`;

      const arrayBuffer = await fetch(asset.uri).then((r) => r.arrayBuffer());

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(storagePath, arrayBuffer, { contentType: mimeType, upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(storagePath);

      const { error: updateErr } = await supabase
        .from('users')
        .update({ avatar: publicUrl })
        .eq('id', user.id);

      if (updateErr) throw updateErr;

      setProfile((prev) => prev ? { ...prev, avatar: publicUrl } : prev);
    } catch {
      // silently ignore — user stays with current avatar
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/');
    } catch {
      // sign-out failed; leave spinner cleared so user can retry
    } finally {
      setSigningOut(false);
    }
  }

  if (loading || sessionLoading) {
    return (
      <View style={styles.centered}>
        <CanchaLoader variant="full" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Sesión no iniciada</Text>
      </View>
    );
  }

  const displayName = profile?.name ?? user.email ?? '—';
  const displayEmail = profile?.email ?? user.email ?? '—';
  const initials = getInitials(profile?.name ?? null, displayEmail);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 16 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[styles.screenHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.screenTag}>Panel del propietario</Text>
          <Text style={styles.screenTitle}>
            Perfil<Text style={styles.screenTitleDot}>.</Text>
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadData} style={styles.retryButton}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Avatar + identity */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={pickAndUploadAvatar}
            disabled={uploadingAvatar}
            activeOpacity={0.8}
          >
            {profile?.avatar ? (
              <Image source={{ uri: profile.avatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            {uploadingAvatar ? (
              <View style={styles.avatarOverlay}>
                <CanchaLoader variant="button" />
              </View>
            ) : (
              <View style={styles.avatarEditBadge}>
                <Ionicons name="pencil" size={13} color={colors.accentFg} />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.nameBlock}>
            <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.displayEmail} numberOfLines={1}>{displayEmail}</Text>
          </View>
        </View>

        {/* Owner stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{profile?.plans?.name ?? 'Sin plan'}</Text>
            <Text style={styles.statLabel}>Plan activo</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{profile?.cancellation_count ?? 0}</Text>
            <Text style={styles.statLabel}>Cancelaciones</Text>
          </View>
        </View>

        {/* Edit name */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>Datos personales</Text>
        </View>

        <View style={styles.menuCard}>
          {editing ? (
            <View style={styles.editSection}>
              <Text style={styles.editLabel}>Nombre</Text>
              <TextInput
                style={styles.textInput}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Tu nombre completo"
                placeholderTextColor={colors.dim}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveName}
              />
              {saveError ? (
                <Text style={styles.saveError}>{saveError}</Text>
              ) : null}
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={cancelEditing}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={saveName}
                  disabled={saving}
                >
                  {saving ? (
                    <CanchaLoader variant="button" />
                  ) : (
                    <Text style={styles.saveButtonText}>Guardar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.menuRow} onPress={startEditing} activeOpacity={0.7}>
              <View style={styles.menuRowLeft}>
                <Text style={styles.menuRowLabel}>Nombre</Text>
                <Text style={styles.menuRowValue}>{displayName}</Text>
              </View>
              <Text style={styles.editChevron}>Editar</Text>
            </TouchableOpacity>
          )}
          <View style={styles.menuDivider} />
          <View style={styles.menuRow}>
            <View style={styles.menuRowLeft}>
              <Text style={styles.menuRowLabel}>Correo</Text>
              <Text style={styles.menuRowValue}>{displayEmail}</Text>
            </View>
          </View>
          <View style={styles.menuDivider} />
          <View style={styles.menuRow}>
            <View style={styles.menuRowLeft}>
              <Text style={styles.menuRowLabel}>Miembro desde</Text>
              <Text style={styles.menuRowValue}>
                {user.created_at
                  ? new Date(user.created_at).toLocaleDateString('es-EC', {
                      month: 'long',
                      year: 'numeric',
                    })
                  : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* De Una Negocios */}
        <View style={styles.sectionLabel}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabelText}>De Una Negocios</Text>
            {profile?.deuna_merchant_id && profile?.deuna_phone_linked ? (
              <View style={styles.deunaActiveBadge}>
                <Text style={styles.deunaActiveBadgeText}>Activo</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.sectionHint}>
            Tus jugadores podrán pagarte directamente con De Una.
          </Text>
        </View>

        <View style={styles.menuCard}>
          {editingDeuna ? (
            <View style={styles.editSection}>
              <Text style={styles.editLabel}>ID de comercio De Una</Text>
              <TextInput
                style={styles.textInput}
                value={merchantIdInput}
                onChangeText={setMerchantIdInput}
                placeholder="merchant_xxxxxxxxx"
                placeholderTextColor={colors.dim}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.editLabel, { marginTop: spacing.sm }]}>Teléfono De Una</Text>
              <TextInput
                style={styles.textInput}
                value={phoneInput}
                onChangeText={setPhoneInput}
                placeholder="+593991234567"
                placeholderTextColor={colors.dim}
                keyboardType="phone-pad"
              />
              {deunaError ? (
                <Text style={styles.saveError}>{deunaError}</Text>
              ) : null}
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={cancelEditingDeuna}
                  disabled={savingDeuna}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, savingDeuna && styles.saveButtonDisabled]}
                  onPress={saveDeuna}
                  disabled={savingDeuna}
                >
                  {savingDeuna ? (
                    <CanchaLoader variant="button" />
                  ) : (
                    <Text style={styles.saveButtonText}>Guardar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.menuRow} onPress={startEditingDeuna} activeOpacity={0.7}>
                <View style={styles.menuRowLeft}>
                  <Text style={styles.menuRowLabel}>ID de comercio</Text>
                  <Text style={styles.menuRowValue}>
                    {profile?.deuna_merchant_id ?? 'No configurado'}
                  </Text>
                </View>
                <Text style={styles.editChevron}>Editar</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <View style={styles.menuRow}>
                <View style={styles.menuRowLeft}>
                  <Text style={styles.menuRowLabel}>Teléfono</Text>
                  <Text style={styles.menuRowValue}>
                    {profile?.deuna_phone_linked ?? '—'}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Sign out */}
        <TouchableOpacity
          style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.75}
        >
          {signingOut ? (
            <CanchaLoader variant="button" />
          ) : (
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
  },
  screenHeader: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  screenTag: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '700',
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.6,
  },
  screenTitleDot: {
    color: colors.accent,
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    gap: spacing.lg,
  },
  avatarWrapper: {
    width: 72,
    height: 72,
    flexShrink: 0,
    position: 'relative',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.accentFg,
    letterSpacing: -0.5,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  nameBlock: {
    flex: 1,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  displayEmail: {
    fontSize: 13,
    color: colors.mute,
  },
  statsCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.lg,
  },
  sectionLabel: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xxl,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  menuRowLeft: {
    flex: 1,
    gap: 2,
  },
  menuRowLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  menuRowValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
    marginTop: 2,
  },
  editChevron: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
    marginLeft: spacing.md,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
  editSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  editLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  textInput: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  saveError: {
    fontSize: 12,
    color: colors.error,
    fontWeight: '500',
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.card2,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mute,
  },
  saveButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentFg,
  },
  signOutButton: {
    marginHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  signOutButtonDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.error,
    letterSpacing: -0.2,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.dim,
    lineHeight: 16,
  },
  deunaActiveBadge: {
    backgroundColor: colors.deunaBrand,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  deunaActiveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  errorBox: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: radius.card,
    padding: spacing.lg,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.badge,
  },
  retryText: {
    color: colors.accentFg,
    fontSize: 14,
    fontWeight: '700',
  },
});
