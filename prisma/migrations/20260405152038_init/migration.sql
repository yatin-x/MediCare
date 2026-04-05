-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "doctorName" TEXT,
    "patientName" TEXT,
    "transcript" TEXT,
    "cleanText" TEXT,
    "symptoms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "medicines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "advice" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duration" TEXT,
    "urgency" TEXT,
    "confidence" DOUBLE PRECISION,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Visit_roomId_key" ON "Visit"("roomId");
