ALTER TABLE "Screen" ADD COLUMN "screenNumber" INTEGER;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "Screen"
)
UPDATE "Screen" s
SET "screenNumber" = n.rn
FROM numbered n
WHERE s.id = n.id;

ALTER TABLE "Screen" ALTER COLUMN "screenNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Screen_screenNumber_key" ON "Screen"("screenNumber");