-- @param min_facilities INT
SELECT
  p.statename AS state,
  p.district AS district,
  COUNT(DISTINCT f.unique_id) AS facility_count
FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory p
LEFT JOIN databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  ON f.address_stateOrRegion = p.statename
  AND f.organization_type = 'facility'
GROUP BY p.statename, p.district
HAVING COUNT(DISTINCT f.unique_id) < :min_facilities
ORDER BY facility_count ASC
LIMIT 25
