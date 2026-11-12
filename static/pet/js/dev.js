// ============================================================================
// dev.js — switches for developing the app. Turn everything off before release.
// ----------------------------------------------------------------------------
// unlimitedCoins: the wallet is kept at DEV_COINS, so shop items, adoptions and
// vet bills never run out. Your real balance is put aside when this turns on
// and given back when it turns off.
// unlimitedPets: no limit on how many pets your home holds (normally 4).
// ============================================================================
export const DEV = {
  unlimitedCoins: true,
  unlimitedPets: true,
};
export const DEV_COINS = 999999;
