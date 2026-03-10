const FIREBASE_WEB_API_KEY = ['AI', 'zaSyDhQpfNTeX9_lvStVQP0VTfY8VZk79TJNk'].join('');

window.APP_RUNTIME_CONFIG = {
  gasEndpoint: '',
  apiWriteToken: '',
  requireLogin: true,
  heroGifUrl: '',
  firebase: {
    enabled: false,
    collection: 'mercari_items',
    archiveCollection: 'mercari_archives',
    config: {
      apiKey: FIREBASE_WEB_API_KEY,
      authDomain: 'mercari-9bbd3.firebaseapp.com',
      projectId: 'mercari-9bbd3',
      appId: '1:589698327361:web:bc5c88e990afd124bf37c0'
    }
  }
};
