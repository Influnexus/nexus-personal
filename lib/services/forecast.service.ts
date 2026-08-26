// Sprint P1: forecastCash() was moved VERBATIM to the shared Financial Intelligence Core
// (lib/core/finance/forecast.ts). This module remains as a compatibility re-export so every
// existing Enterprise import path keeps working unchanged.
export { forecastCash } from '@/lib/core/finance/forecast';
export type { ForecastDriver, ForecastDay, ForecastResult } from '@/lib/core/finance/types';
