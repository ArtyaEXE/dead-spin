-- Чистка ghost-данных от deprecated-уровней (L4..L15 — бывший CERES-filler).
-- См. коммит cbfd4fb (PALLAS world): уровни 4..15 переехали в _deprecated/,
-- но их строки в progress-таблицах остались. summaryStars показывал
-- «20⭐» при реальном максимуме 9 (CERES) + 0 (PALLAS не пройдена).
--
-- Валидный список уровней: CERES 1..3 + PALLAS 16..30. Для будущих миров
-- (JUNO 31..45 etc.) добавить миграцию с расширенным списком.
DELETE FROM progress_levels
WHERE level NOT IN (1, 2, 3, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30);
--> statement-breakpoint
DELETE FROM group_progress_levels
WHERE level NOT IN (1, 2, 3, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30);
--> statement-breakpoint
-- Пересчитываем summaryStars из оставшихся валидных строк.
UPDATE progresses
SET summary_stars = COALESCE(
  (SELECT SUM(stars)::int FROM progress_levels WHERE user_id = progresses.user_id),
  0
),
updated_at = now();
