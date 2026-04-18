-- CreateTable
CREATE TABLE "DailyMeals" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "breakfast" TEXT NOT NULL DEFAULT '',
    "lunch" TEXT NOT NULL DEFAULT '',
    "dinner" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyMeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyMeals_date_key" ON "DailyMeals"("date");
