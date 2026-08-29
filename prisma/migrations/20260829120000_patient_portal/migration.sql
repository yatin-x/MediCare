-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "userId" TEXT;
ALTER TABLE "Patient" ALTER COLUMN "doctorId" DROP NOT NULL;
CREATE UNIQUE INDEX "Patient_userId_key" ON "Patient"("userId");
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN "patientSummary" TEXT;
