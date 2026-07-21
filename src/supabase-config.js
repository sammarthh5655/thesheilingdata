// TheSheilingData — Supabase config
export const supabaseConfig = {
  url: 'https://eqiwghwqsrapyozvjpyu.supabase.co',
  anonKey: 'sb_publishable_m4zsGSZP_RD0ML1G7yolvQ_OiV2ZJFD',
}

export const isSupabaseConfigured = () =>
  !!supabaseConfig.url && !!supabaseConfig.anonKey
