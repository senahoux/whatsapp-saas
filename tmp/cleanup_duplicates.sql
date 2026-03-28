DELETE FROM "appointments" 
WHERE id NOT IN (
  SELECT MIN(id) 
  FROM "appointments" 
  GROUP BY "clinicId", "date", "time"
);
