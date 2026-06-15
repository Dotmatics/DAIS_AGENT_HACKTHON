-- @param state_ut string
SELECT
  district_name,
  state_ut,
  ROUND(institutional_birth_5y_pct, 1)                   AS institutional_births_pct,
  ROUND(hh_improved_water_pct, 1)                        AS improved_water_pct,
  ROUND(hh_use_improved_sanitation_pct, 1)               AS improved_sanitation_pct,
  ROUND(hh_electricity_pct, 1)                           AS electricity_pct,
  ROUND(hh_member_covered_health_insurance_pct, 1)       AS health_insurance_pct,
  ROUND(households_using_clean_fuel_for_cooking_pct, 1)  AS clean_fuel_pct,
  ROUND(women_age_15_49_who_are_literate_pct, 1)         AS women_literacy_pct,
  ROUND(fp_cm_w15_49_any_method_pct, 1)                  AS family_planning_pct,
  households_surveyed
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators
WHERE
  (:state_ut = '' OR state_ut = :state_ut)
ORDER BY state_ut, district_name
