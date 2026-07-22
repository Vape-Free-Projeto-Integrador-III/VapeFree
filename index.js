import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent chama AppRegistry.registerComponent('main', () => App)
// e garante que o ambiente seja configurado corretamente tanto no Expo Go
// quanto num build nativo.
registerRootComponent(App);
