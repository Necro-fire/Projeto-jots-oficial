import { supabase } from '@/integrations/supabase/client';

/**
 * For private buckets (like nfe-files), extract the file path from a stored public URL
 * and generate a signed URL for authenticated download.
 */
export async function getSignedUrl(storedUrl: string, bucket: string, expiresIn = 3600): Promise<string | null> {
  if (!storedUrl) return null;
  
  // Extract path after /object/public/{bucket}/
  const marker = `/object/public/${bucket}/`;
  const idx = storedUrl.indexOf(marker);
  if (idx === -1) return storedUrl; // fallback if not a supabase URL
  
  const filePath = storedUrl.substring(idx + marker.length);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Upload to a private bucket and return the file path (not a public URL).
 */
export async function uploadToPrivateBucket(file: File, bucket: string, folder: string): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${folder}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) throw error;
  // Store the constructed public URL pattern so existing code stays compatible
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
