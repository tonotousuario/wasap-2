const {withAppBuildGradle} = require('expo/config-plugins');

// Signs Android release builds with a keystore kept outside the repository. The build only
// receives its location and password as Gradle properties, for example through
// ORG_GRADLE_PROJECT_wasapReleaseStoreFile. Without them, release keeps Expo's debug signing.
const SIGNING = `
        if (findProperty('wasapReleaseStoreFile')) {
            release {
                storeFile file(findProperty('wasapReleaseStoreFile'))
                storePassword findProperty('wasapReleaseStorePassword')
                keyAlias findProperty('wasapReleaseKeyAlias')
                keyPassword findProperty('wasapReleaseStorePassword')
            }
        }`;

function addReleaseSigning(gradle) {
  if (gradle.includes("findProperty('wasapReleaseStoreFile')")) return gradle;
  const configs = 'signingConfigs {';
  const release = /(release \{\n(?:\s*\/\/[^\n]*\n)*)(\s*)signingConfig signingConfigs\.debug/;
  if (!gradle.includes(configs) || !release.test(gradle)) {
    throw new Error('Unexpected android/app/build.gradle: cannot configure WASAP release signing');
  }
  return gradle
    .replace(configs, configs + SIGNING)
    .replace(
      release,
      "$1$2signingConfig findProperty('wasapReleaseStoreFile') ? signingConfigs.release : signingConfigs.debug",
    );
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, mod => {
    mod.modResults.contents = addReleaseSigning(mod.modResults.contents);
    return mod;
  });
};
module.exports.addReleaseSigning = addReleaseSigning;
