// Helper para leer el perfil del usuario desde Supabase y convertirlo al
// formato UserProfile que espera el servicio de recomendación (FastAPI).
import { supabase } from './supabase'
import type { UserProfile } from './api'

export interface ProfileRow {
  user_id: string
  full_name: string | null
  age: number | null
  education_level: string | null
  employment_status: string | null
  learning_goal?: string | null
  knowledge_level: string | null
  interests: Record<string, number> | null
  format_pref: Record<string, number> | null
  risk: number | null
  activity: number | null
  big_three?: number[] | null
}

// Lee el perfil guardado en Supabase (tabla profiles) para un usuario.
export async function getProfileFromSupabase(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Error al leer el perfil de Supabase:', error.message)
    return null
  }
  return data as ProfileRow | null
}

// Lee los conceptos dominados del usuario (tabla mastered_concepts).
export async function getMasteredConcepts(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('mastered_concepts')
    .select('concept_id')
    .eq('user_id', userId)

  if (error) {
    console.error('Error al leer conceptos dominados:', error.message)
    return []
  }
  return (data ?? []).map((r) => r.concept_id)
}

// Lee los contenidos ya vistos/completados (tabla progress).
export async function getProgress(userId: string): Promise<{
  seen: string[]
  completed: string[]
}> {
  const { data, error } = await supabase
    .from('progress')
    .select('content_id, completed')
    .eq('user_id', userId)

  if (error) {
    console.error('Error al leer progreso:', error.message)
    return { seen: [], completed: [] }
  }
  const seen = (data ?? []).map((r) => r.content_id)
  const completed = (data ?? []).filter((r) => r.completed).map((r) => r.content_id)
  return { seen, completed }
}

// Construye el UserProfile completo para el servicio IA, combinando el perfil
// guardado con el progreso y los conceptos dominados.
export async function buildUserProfile(userId: string): Promise<UserProfile> {
  const [profile, mastered, progress] = await Promise.all([
    getProfileFromSupabase(userId),
    getMasteredConcepts(userId),
    getProgress(userId),
  ])

  return {
    user_id: userId,
    full_name: profile?.full_name ?? null,
    age: profile?.age ?? null,
    education_level: profile?.education_level ?? null,
    employment_status: profile?.employment_status ?? null,
    learning_goal: profile?.learning_goal ?? null,
    knowledge_level: profile?.knowledge_level ?? null,
    interests: profile?.interests ?? {},
    format_pref: profile?.format_pref ?? {},
    risk: profile?.risk ?? null,
    activity: profile?.activity ?? null,
    mastered_concepts: mastered,
    seen_content_ids: progress.seen,
    completed_content_ids: progress.completed,
  }
}
