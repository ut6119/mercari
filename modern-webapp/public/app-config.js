const FIREBASE_WEB_API_KEY = ['AI', 'zaSyDhQpfNTeX9_lvStVQP0VTfY8VZk79TJNk'].join('');

window.APP_RUNTIME_CONFIG = {
  gasEndpoint: '',
  apiWriteToken: ['cfef1157e29cbc2ef2ffb01d32811a7dbd7ea47ea405439e'].join(''),
  requireLogin: true,
  heroGifUrl: '',
  guestMode: {
    enabled: false
  },
  firebase: {
    enabled: true,
    collection: 'mercari_items',
    archiveCollection: 'mercari_archives',
    usageCollection: 'mercari_usage',
    usageUsersCollection: 'mercari_usage_users',
    transportLedgerDoc: 'transport_ledger',
    transportLedgerSubcollection: 'items',
    config: {
      apiKey: FIREBASE_WEB_API_KEY,
      authDomain: 'mercari-9bbd3.firebaseapp.com',
      projectId: 'mercari-9bbd3',
      appId: '1:589698327361:web:bc5c88e990afd124bf37c0'
    },
    appCheck: {
      enabled: false,
      siteKey: '',
      debugToken: ''
    }
  }
};
