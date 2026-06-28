import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mercadopg.movil',
  appName: 'MercadoPGMovil',
  webDir: 'src/mobile',
  server: {
    cleartext: true
  }
};

export default config;
