import { TurboModule, TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // The host functions js/bootstrap.js builds the Intl constructors on.
  install(hostLocale: string): Object;
}

export default TurboModuleRegistry.get<Spec>('NativeHermesIntl');
