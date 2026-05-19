import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { useSession } from '../../../hooks/useSession';
import { colors, radius, spacing } from '../../../lib/theme';

interface Field {
  id: string;
  name: string;
  address: string;
  images: string[];
}

const THUMB_SIZE = (Dimensions.get('window').width - spacing.xl * 2 - spacing.md) / 2;

function storagePathFromUrl(url: string): string | null {
  const marker = '/object/public/field-images/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

export default function FieldDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [field, setField] = useState<Field | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadField() {
    if (!id || !user) return;
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('fields')
        .select('id, name, address, images')
        .eq('id', id)
        .eq('owner_id', user.id)
        .single();

      if (err) throw err;
      setField(data as Field);
    } catch {
      setError('No se pudo cargar la cancha.');
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadField().finally(() => setLoading(false));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, user?.id])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadField();
    setRefreshing(false);
  }

  async function pickAndUpload() {
    if (!field || !user) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    try {
      const newUrls: string[] = [];

      for (const asset of result.assets) {
        const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const storagePath = `${field.id}/${safeName}`;

        const arrayBuffer = await fetch(asset.uri).then((r) => r.arrayBuffer());

        const { error: uploadErr } = await supabase.storage
          .from('field-images')
          .upload(storagePath, arrayBuffer, { contentType: mimeType, upsert: false });

        if (uploadErr) continue;

        const { data: { publicUrl } } = supabase.storage
          .from('field-images')
          .getPublicUrl(storagePath);

        newUrls.push(publicUrl);
      }

      if (newUrls.length > 0) {
        const updatedImages = [...(field.images ?? []), ...newUrls];
        const { error: updateErr } = await supabase
          .from('fields')
          .update({ images: updatedImages })
          .eq('id', field.id);

        if (!updateErr) {
          setField((prev) => prev ? { ...prev, images: updatedImages } : prev);
        }
      }
    } catch {
      Alert.alert('Error', 'No se pudieron subir las fotos. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  function confirmDelete(imageUrl: string) {
    Alert.alert(
      'Eliminar foto',
      '¿Eliminar esta foto de la cancha?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => deleteImage(imageUrl) },
      ]
    );
  }

  async function deleteImage(imageUrl: string) {
    if (!field) return;
    setDeletingUrl(imageUrl);
    try {
      const storagePath = storagePathFromUrl(imageUrl);
      if (storagePath) {
        await supabase.storage.from('field-images').remove([storagePath]);
      }

      const updatedImages = field.images.filter((u) => u !== imageUrl);
      const { error: updateErr } = await supabase
        .from('fields')
        .update({ images: updatedImages })
        .eq('id', field.id);

      if (!updateErr) {
        setField((prev) => prev ? { ...prev, images: updatedImages } : prev);
      }
    } catch {
      Alert.alert('Error', 'No se pudo eliminar la foto. Intenta de nuevo.');
    } finally {
      setDeletingUrl(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!field) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorLabel}>{error ?? 'Cancha no encontrada.'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity style={styles.backChevron} onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backChevronText}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTag}>Gestionar cancha</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{field.name}</Text>
            <Text style={styles.headerAddress} numberOfLines={1}>{field.address}</Text>
          </View>
        </View>

        {/* Upload button */}
        <View style={styles.uploadRow}>
          <Text style={styles.sectionLabel}>
            Fotos · {field.images.length}
          </Text>
          <TouchableOpacity
            style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
            onPress={pickAndUpload}
            disabled={uploading}
            activeOpacity={0.8}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={colors.accentFg} />
            ) : (
              <Text style={styles.uploadButtonText}>+ Agregar fotos</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Image grid */}
        {field.images.length === 0 ? (
          <View style={styles.emptyImages}>
            <Text style={styles.emptyImagesText}>
              Sin fotos. Agrega imágenes para que los jugadores puedan ver tu cancha.
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {field.images.map((url, index) => {
              const isDeleting = deletingUrl === url;
              return (
                <TouchableOpacity
                  key={`${url}-${index}`}
                  style={styles.thumb}
                  onLongPress={() => confirmDelete(url)}
                  activeOpacity={0.85}
                  disabled={isDeleting}
                >
                  <Image source={{ uri: url }} style={styles.thumbImage} resizeMode="cover" />
                  {isDeleting ? (
                    <View style={styles.thumbOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => confirmDelete(url)}
                      hitSlop={8}
                    >
                      <Text style={styles.deleteButtonText}>✕</Text>
                    </TouchableOpacity>
                  )}
                  {index === 0 && (
                    <View style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText}>Portada</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={styles.hint}>Mantén presionada una foto para eliminarla.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  backChevron: {
    marginTop: 24,
    width: 36,
    height: 36,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  backChevronText: {
    fontSize: 18,
    color: colors.text,
    lineHeight: 20,
  },
  headerText: {
    flex: 1,
    marginTop: 20,
  },
  headerTag: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  headerAddress: {
    fontSize: 13,
    color: colors.mute,
    marginTop: 2,
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  uploadButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.badge,
    minWidth: 44,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    color: colors.accentFg,
    fontWeight: '700',
    fontSize: 13,
  },
  emptyImages: {
    backgroundColor: colors.card,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyImagesText: {
    fontSize: 14,
    color: colors.mute,
    textAlign: 'center',
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.card2,
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
  coverBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  coverBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accentFg,
    letterSpacing: 0.2,
  },
  hint: {
    fontSize: 12,
    color: colors.dim,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  errorLabel: {
    fontSize: 15,
    color: colors.error,
    textAlign: 'center',
    fontWeight: '500',
  },
  backButton: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  backButtonText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
});
