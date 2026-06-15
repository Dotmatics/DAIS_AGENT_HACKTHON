SELECT
  address_stateOrRegion                   AS state,
  organization_type,
  COUNT(*)                                AS facility_count,
  COUNT(CASE WHEN numberDoctors IS NOT NULL AND numberDoctors != '' THEN 1 END) AS with_doctors
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
WHERE address_country = 'India' OR address_countryCode = 'IN'
GROUP BY address_stateOrRegion, organization_type
ORDER BY facility_count DESC
LIMIT 200
