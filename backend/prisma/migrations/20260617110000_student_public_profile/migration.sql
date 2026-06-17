ALTER TABLE "users"
ADD COLUMN "profile_bio" TEXT,
ADD COLUMN "profile_instrument" VARCHAR(128),
ADD COLUMN "profile_interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "profile_public" BOOLEAN NOT NULL DEFAULT false;
