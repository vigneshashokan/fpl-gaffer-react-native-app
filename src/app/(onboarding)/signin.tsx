import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/auth/google';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Icon } from '@/components/ui/Icon';
import { Field } from '@/components/forms/Field';
import { SocialBtn } from '@/components/forms/SocialBtn';

const COMING_SOON = () =>
  Alert.alert('Coming soon', 'This sign-in option is in a future update.');

export default function SignIn() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const onGoogle = async () => {
    setGoogleError(null);
    setGoogleSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (result.ok) return;
      if (result.error === 'cancel' || result.error === 'dismiss') return;
      setGoogleError('Google sign-in failed. Please try again.');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>

        <Text style={[styles.title, { color: t.text }]}>Welcome, Gaffer!</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          Sign in to manage your squad
        </Text>

        <View style={{ gap: 11 }}>
          <SocialBtn provider="google" onPress={onGoogle} />
          <SocialBtn provider="apple" onPress={COMING_SOON} />
        </View>
        {googleSubmitting && (
          <View style={styles.spinnerWrap}>
            <ActivityIndicator color={t.accent} />
          </View>
        )}
        {googleError && (
          <Text style={[styles.error, { color: '#FF3B5C' }]}>{googleError}</Text>
        )}

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: t.line }]} />
          <Text style={[styles.dividerText, { color: t.textFaint }]}>OR</Text>
          <View style={[styles.dividerLine, { backgroundColor: t.line }]} />
        </View>

        <View style={{ gap: 11 }}>
          <Field
            icon="mail"
            placeholder="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          <Field
            icon="lock"
            placeholder="Password"
            value={pw}
            onChangeText={setPw}
            secureTextEntry
            autoComplete="password"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
        </View>

        <View style={styles.forgotWrap}>
          <Pressable onPress={COMING_SOON} hitSlop={8}>
            <Text style={[styles.forgot, { color: t.accent }]}>Forgot password?</Text>
          </Pressable>
        </View>

        <PillBtn
          variant="accent"
          onPress={COMING_SOON}
          accentInk={t.accentInk}
          style={styles.signInBtn}
        >
          Sign in
        </PillBtn>

        <View style={styles.faceWrap}>
          <Pressable
            onPress={COMING_SOON}
            style={({ pressed }) => [
              styles.faceBtn,
              { backgroundColor: t.surfaceAlt, borderColor: t.line },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
          >
            <Icon name="faceid" color={t.accent} size={32} />
          </Pressable>
          <Text style={[styles.faceLabel, { color: t.textMuted }]}>
            Sign in with Face ID
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 26,
    paddingTop: 64,
    paddingBottom: 32,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 26,
  },
  title: {
    fontFamily: 'Archivo_900Black',
    fontSize: 30,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15.5,
    textAlign: 'center',
    marginBottom: 26,
  },
  spinnerWrap: {
    marginTop: 10,
    alignItems: 'center',
  },
  error: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 22,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12.5,
    letterSpacing: 1.25,
  },
  forgotWrap: {
    alignItems: 'flex-end',
    marginTop: 12,
    marginBottom: 18,
  },
  forgot: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
  },
  signInBtn: {
    width: '100%',
    height: 54,
  },
  faceWrap: {
    alignItems: 'center',
    gap: 9,
    marginTop: 22,
  },
  faceBtn: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceLabel: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13.5,
  },
});
