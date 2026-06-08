import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function signInWithGoogle(): Promise<SignInResult> {
  const redirectTo = makeRedirectUri({ scheme: 'fplgafferreactnativeapp' });

  // skipBrowserRedirect=true returns the OAuth URL to us instead of trying
  // to redirect via window.location (a web API that doesn't exist in RN).
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    return { ok: false, error: error?.message ?? 'oauth_url_unavailable' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    return { ok: false, error: result.type };
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
  if (exchangeError) {
    return { ok: false, error: exchangeError.message };
  }

  return { ok: true };
}
