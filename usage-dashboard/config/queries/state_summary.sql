SELECT
  state_ut,
  COUNT(*)                                                        AS district_count,
  ROUND(AVG(institutional_birth_5y_pct), 1)                      AS avg_institutional_births_pct,
  ROUND(AVG(hh_improved_water_pct), 1)                           AS avg_improved_water_pct,
  ROUND(AVG(hh_use_improved_sanitation_pct), 1)                  AS avg_improved_sanitation_pct,
  ROUND(AVG(hh_member_covered_health_insurance_pct), 1)          AS avg_health_insurance_pct,
  ROUND(AVG(households_using_clean_fuel_for_cooking_pct), 1)     AS avg_clean_fuel_pct,
  ROUND(AVG(women_age_15_49_who_are_literate_pct), 1)            AS avg_women_literacy_pct
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators
GROUP BY state_ut
ORDER BY state_ut
