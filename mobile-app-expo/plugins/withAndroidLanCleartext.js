const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const NETWORK_SECURITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

function withAndroidLanCleartext(config) {
  const withManifest = withAndroidManifest(config, (configInner) => {
    const app = configInner.modResults?.manifest?.application?.[0];
    if (!app) {
      return configInner;
    }

    app.$ = app.$ || {};
    app.$['android:usesCleartextTraffic'] = 'true';
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return configInner;
  });

  return withDangerousMod(withManifest, [
    'android',
    async (configInner) => {
      const projectRoot = configInner.modRequest.platformProjectRoot;
      const xmlDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'xml');
      const xmlPath = path.join(xmlDir, 'network_security_config.xml');

      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(xmlPath, NETWORK_SECURITY_XML, 'utf8');

      return configInner;
    }
  ]);
}

module.exports = withAndroidLanCleartext;