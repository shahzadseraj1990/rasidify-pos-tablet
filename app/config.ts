const Config = {
  // Dashboard API — only what hasn't moved to the POS API: live table actions
  // (/table/...), same split as Web POS. See services/tableService.ts.
  API_URL: 'https://api.rasidify.com/api',
  // Standalone RASIDIFY-POS-API — auth, session bootstrap, catalog, customers,
  // orders, payments, shifts.
  POS_API_URL: 'https://pos-api.rasidify.com/api',
  API_TIMEOUT: 15000,
};

export default Config;
