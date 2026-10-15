// Outdoor-air cooling load from moist-air enthalpy. Load only counts when outdoor enthalpy exceeds indoor.

const ATMOSPHERIC_PA = 101325;

export function saturationPressurePa(temperatureC) {
  return 610.94 * Math.exp(17.625 * temperatureC / (temperatureC + 243.04));
}

export function humidityRatio(temperatureC, humidityPct) {
  const vapour = Math.min(1, Math.max(0, humidityPct / 100)) * saturationPressurePa(temperatureC);
  return 0.622 * vapour / (ATMOSPHERIC_PA - vapour);
}

// kJ per kg of dry air.
export function enthalpy(temperatureC, humidityPct) {
  const w = humidityRatio(temperatureC, humidityPct);
  return 1.006 * temperatureC + w * (2501 + 1.86 * temperatureC);
}

export function enthalpyDifference(outdoor, indoor) {
  return Math.max(0, enthalpy(outdoor.temperatureC, outdoor.humidityPct) - enthalpy(indoor.temperatureC, indoor.humidityPct));
}

export function outdoorAirCoolingKw(lps, outdoor, indoor, config) {
  return config.energy.airDensityKgM3 * Math.max(0, lps) / 1000 * enthalpyDifference(outdoor, indoor);
}

// Savings of the recommended airflow against the baseline over an interval (negative when it supplies more).
export function intervalSavings({ baselineLps, recommendedLps, seconds, outdoor, indoor, config }) {
  const deltaLps = baselineLps - recommendedLps;
  const coolingKwh = config.energy.airDensityKgM3 * deltaLps / 1000 * enthalpyDifference(outdoor, indoor) * seconds / 3600;
  return {
    airM3: deltaLps * seconds / 1000,
    coolingKwh,
    electricKwh: coolingKwh / config.energy.plantCop,
  };
}

export function addSavings(total, item) {
  return {
    airM3: (total?.airM3 || 0) + item.airM3,
    coolingKwh: (total?.coolingKwh || 0) + item.coolingKwh,
    electricKwh: (total?.electricKwh || 0) + item.electricKwh,
  };
}
