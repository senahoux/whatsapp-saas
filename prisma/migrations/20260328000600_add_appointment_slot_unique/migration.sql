-- CreateIndex
CREATE UNIQUE INDEX "appointments_clinicId_date_time_key" ON "appointments"("clinicId", "date", "time");
