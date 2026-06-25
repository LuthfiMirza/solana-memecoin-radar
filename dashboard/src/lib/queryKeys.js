export const queryKeys = {
  health: ['health'],
  dashboard: ['dashboard'],
  tokens: {
    all: ['tokens'],
    list: (filters = {}) => ['tokens', 'list', filters],
    detail: (address) => ['tokens', 'detail', address]
  },
  portfolio: {
    all: ['portfolio'],
    list: (filters = {}) => ['portfolio', 'list', filters]
  },
  signals: {
    all: ['signals'],
    list: (filters = {}) => ['signals', 'list', filters]
  }
};
