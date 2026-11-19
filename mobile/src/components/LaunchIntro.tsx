import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { BAR_RATIOS, useColors } from "../theme";

/**
 * Açılış animasyonu (kullanıcı isteği 2026-11, ikinci hali).
 *
 * Yerel açılış ekranı artık logosuz (yalnız koyu zemin): "açılır açılmaz sabit sarı
 * logo, sonra animasyon" sırası kullanıcıya kopuk geldi. JS ilk çizimde bu kaplamayı
 * koyar ve sistem ekranını hemen kapatır:
 *   1. tema ayarı yüklenince çubuklar sırayla sıfırdan büyür (kullanıcının vurgu
 *      renginde — kullanıcı tercihi: altından vurguya geçişi değil, baştan tema rengini
 *      istedi; o yüzden renk belli olana kadar yalnız zemin görünür),
 *   2. uygulama hazırlanırken dalgalanır,
 *   3. hazır olunca "RESONANCE" harf harf belirir,
 *   4. işaret büyüyerek saydamlaşır, uygulama altından görünür.
 * Dokununca (hazırsa) atlanır. Soğuk açılışta bir kez.
 *
 * ⚠️ Her animasyonda `ReduceMotion.Never`: Xiaomi'de "geçiş animasyonu ölçeği = 0"
 * Reanimated'a "hareketi azalt" olarak geliyor ve her şey ANINDA bitiyordu (ölçüldü).
 */
const MARK_HEIGHT = 64;
const BAR_WIDTH = 7;
const BAR_GAP = 5;
const STAGGER_MS = 55;
const GROW_MS = 380;
const WAVE_MS = 300;
const SETTLE_MS = 260;
const LETTER_STAGGER_MS = 40;
const LETTER_MS = 320;
const HOLD_MS = 260;
const EXIT_MS = 420;
const WORD = "RESONANCE";
const NEVER = ReduceMotion.Never;
const ENTRANCE_MS = STAGGER_MS * (BAR_RATIOS.length - 1) + GROW_MS;
const LETTERS_MS = LETTER_STAGGER_MS * (WORD.length - 1) + LETTER_MS;

let played = false;

export function LaunchIntro({ themeReady, ready }: { themeReady: boolean; ready: boolean }) {
  const c = useColors();
  const [visible, setVisible] = useState(!played);
  const [entered, setEntered] = useState(false);
  const exit = useSharedValue(0);
  const reveal = useSharedValue(0);
  const exiting = useRef(false);

  useEffect(() => {
    if (!visible || !themeReady) return;
    played = true;
    const id = setTimeout(() => setEntered(true), ENTRANCE_MS);
    return () => clearTimeout(id);
  }, [visible, themeReady]);

  // Hazır + giriş bitti → renk, harfler, çıkış.
  useEffect(() => {
    if (!visible || !ready || !entered || exiting.current) return;
    exiting.current = true;
    const finish = () => setVisible(false);
    reveal.value = withTiming(1, { duration: LETTERS_MS, easing: Easing.linear, reduceMotion: NEVER });
    exit.value = withDelay(
      LETTERS_MS + HOLD_MS,
      withTiming(1, { duration: EXIT_MS, easing: Easing.in(Easing.cubic), reduceMotion: NEVER }, (done) => {
        if (done) runOnJS(finish)();
      }),
      NEVER
    );
    // Güvenlik ağı: geri çağrı gelmese bile kaplama kalıcı kalmasın.
    const fallback = setTimeout(finish, LETTERS_MS + HOLD_MS + EXIT_MS + 600);
    return () => clearTimeout(fallback);
  }, [visible, ready, entered, exit, reveal]);

  const backdrop = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const mark = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + exit.value * 5 }],
    opacity: 1 - exit.value,
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, zIndex: 2000 }, backdrop]}>
      <Pressable
        style={styles.center}
        onPress={() => ready && setVisible(false)}
        accessibilityRole="image"
        accessibilityLabel="Resonance"
      >
        <Animated.View style={[styles.mark, mark]}>
          {themeReady
            ? BAR_RATIOS.map((ratio, i) => (
                <WaveBar key={i} index={i} height={MARK_HEIGHT * ratio} color={c.accent} settle={entered && ready} />
              ))
            : null}
        </Animated.View>
        <View style={styles.word}>
          {WORD.split("").map((ch, i) => (
            <Letter key={i} ch={ch} index={i} reveal={reveal} exit={exit} color={c.text} />
          ))}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function WaveBar({ index, height, color, settle }: { index: number; height: number; color: string; settle: boolean }) {
  const scale = useSharedValue(0);

  // Giriş: sıfırdan büyü, sonra hazır olana dek dalgalan.
  useEffect(() => {
    scale.value = withDelay(
      index * STAGGER_MS,
      withSequence(
        NEVER,
        withTiming(1, { duration: GROW_MS, easing: Easing.out(Easing.back(1.6)), reduceMotion: NEVER }),
        withRepeat(
          withSequence(
            NEVER,
            withTiming(1.4, { duration: WAVE_MS, easing: Easing.inOut(Easing.quad), reduceMotion: NEVER }),
            withTiming(0.8, { duration: WAVE_MS, easing: Easing.inOut(Easing.quad), reduceMotion: NEVER })
          ),
          -1,
          true,
          undefined,
          NEVER
        )
      ),
      NEVER
    );
  }, [index, scale]);

  // Hazır: dalga yumuşakça logonun duruşuna otursun.
  useEffect(() => {
    if (!settle) return;
    cancelAnimation(scale);
    scale.value = withTiming(1, { duration: SETTLE_MS, easing: Easing.out(Easing.cubic), reduceMotion: NEVER });
  }, [settle, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return <Animated.View style={[{ width: BAR_WIDTH, height, borderRadius: BAR_WIDTH / 2, backgroundColor: color }, style]} />;
}

function Letter({
  ch,
  index,
  reveal,
  exit,
  color,
}: {
  ch: string;
  index: number;
  reveal: SharedValue<number>;
  exit: SharedValue<number>;
  color: string;
}) {
  const start = (index * LETTER_STAGGER_MS) / LETTERS_MS;
  const span = LETTER_MS / LETTERS_MS;
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (reveal.value - start) / span));
    const eased = 1 - (1 - p) * (1 - p);
    return {
      opacity: eased * (1 - Math.min(1, exit.value * 2)),
      transform: [{ translateY: (1 - eased) * 8 }],
    };
  });
  return <Animated.Text style={[styles.letter, { color }, style]}>{ch}</Animated.Text>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  mark: { height: MARK_HEIGHT * 1.5, flexDirection: "row", alignItems: "center", gap: BAR_GAP },
  word: { flexDirection: "row", marginTop: 20, height: 20 },
  letter: { fontSize: 14, letterSpacing: 4, fontFamily: "Archivo_800ExtraBold" },
});
