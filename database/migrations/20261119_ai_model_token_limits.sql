-- Non-destructive migration for per-model token limits
ALTER TABLE "AiModel"
  ADD COLUMN IF NOT EXISTS "maxInputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "maxOutputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "dailyTokenLimit" INTEGER;
