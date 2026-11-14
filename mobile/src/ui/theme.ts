import {Platform, useColorScheme} from 'react-native';

// Verde WASAP: la familia del mensajero que parodia, con valores propios.
const light = {
  primary: '#0A7C5A',
  onPrimary: '#FFFFFF',
  primarySoft: '#DDF3E9',
  onPrimarySoft: '#07513B',
  brand: '#1FCB6B',
  bar: Platform.OS === 'android' ? '#0A7C5A' : '#FFFFFF',
  onBar: Platform.OS === 'android' ? '#FFFFFF' : '#111B17',
  onBarSoft: Platform.OS === 'android' ? '#E6F5EE' : '#54645D',
  bg: '#FFFFFF',
  bgAlt: '#F2F5F3',
  chatBg: '#EEE9DF',
  surface: '#FFFFFF',
  line: '#E1E7E3',
  outline: '#74837C',
  onBrand: '#04130D',
  text: '#111B17',
  textSoft: '#54645D',
  bubbleOwn: '#D7F8CF',
  bubbleOther: '#FFFFFF',
  onBubbleSoft: '#4C5E55',
  danger: '#B3261E',
  dangerSoft: '#FCE9E7',
  onDangerSoft: '#7A1A14',
  warnSoft: '#FFF0C7',
  onWarnSoft: '#5C3B00',
  neutralSoft: '#E7ECE9',
};
const dark: typeof light = {
  primary: '#2BC48E',
  onPrimary: '#04130D',
  primarySoft: '#123A2D',
  onPrimarySoft: '#A6EBCB',
  brand: '#1FCB6B',
  bar: '#17211E',
  onBar: '#E7EEEA',
  onBarSoft: '#A3B3AB',
  bg: '#0E1614',
  bgAlt: '#0A110F',
  chatBg: '#0A110F',
  surface: '#17211E',
  line: '#26332E',
  outline: '#6F8078',
  onBrand: '#04130D',
  text: '#E7EEEA',
  textSoft: '#A3B3AB',
  bubbleOwn: '#0B5A44',
  bubbleOther: '#1B2723',
  onBubbleSoft: '#B4C6BD',
  danger: '#FFB4AB',
  dangerSoft: '#3A1512',
  onDangerSoft: '#FFDAD5',
  warnSoft: '#3A2C08',
  onWarnSoft: '#FFDF9E',
  neutralSoft: '#1F2B27',
};

export type Colors = typeof light;
export const android = Platform.OS === 'android';

// Escala tipográfica única. Los tamaños siguen el ajuste de fuente del sistema.
export const type = {
  display: {fontSize: 34, lineHeight: 40, fontWeight: '700'},
  title: {fontSize: 22, lineHeight: 28, fontWeight: android ? '500' : '700'},
  heading: {fontSize: 17, lineHeight: 24, fontWeight: '600'},
  body: {fontSize: 16, lineHeight: 23, fontWeight: '400'},
  label: {fontSize: 15, lineHeight: 20, fontWeight: '600'},
  small: {fontSize: 14, lineHeight: 20, fontWeight: '400'},
  caption: {fontSize: 13, lineHeight: 18, fontWeight: '400'},
} as const;

export const space = {xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32} as const;
export const radius = {field: android ? 8 : 10, button: android ? 24 : 12, block: 16, bubble: 14} as const;
export const TOUCH = 48;

export function useTheme() {
  const isDark = useColorScheme() === 'dark';
  return {c: isDark ? dark : light, isDark};
}
