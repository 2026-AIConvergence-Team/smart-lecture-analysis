from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_sqlite_schema_compatibility(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    with engine.begin() as connection:
        if "courses" in table_names:
            course_columns = {
                column["name"]
                for column in inspector.get_columns("courses")
            }
            if "user_id" not in course_columns:
                connection.execute(text("ALTER TABLE courses ADD COLUMN user_id INTEGER"))
                if "professor_id" in course_columns:
                    connection.execute(
                        text(
                            """
                            UPDATE courses
                            SET user_id = professor_id
                            WHERE user_id IS NULL
                            """
                        )
                    )

        if "lectures" in table_names:
            lecture_columns = {
                column["name"]
                for column in inspector.get_columns("lectures")
            }
            if "course_id" not in lecture_columns:
                connection.execute(text("ALTER TABLE lectures ADD COLUMN course_id INTEGER"))

            if "status" not in lecture_columns:
                connection.execute(
                    text(
                        "ALTER TABLE lectures ADD COLUMN status VARCHAR NOT NULL DEFAULT 'ACTIVE'"
                    )
                )

<<<<<<< HEAD
        if "concepts" in table_names:
            concept_columns = {
                column["name"]
                for column in inspector.get_columns("concepts")
            }
            if "image_path" not in concept_columns:
                connection.execute(text("ALTER TABLE concepts ADD COLUMN image_path VARCHAR"))
            if "image_description" not in concept_columns:
                connection.execute(text("ALTER TABLE concepts ADD COLUMN image_description TEXT"))
            if "image_paths" not in concept_columns:
                connection.execute(text("ALTER TABLE concepts ADD COLUMN image_paths TEXT"))
            if "image_descriptions" not in concept_columns:
                connection.execute(text("ALTER TABLE concepts ADD COLUMN image_descriptions TEXT"))

        if "page_contents" in table_names:
            page_content_columns = {
                column["name"]
                for column in inspector.get_columns("page_contents")
            }
            if "image_paths" not in page_content_columns:
                connection.execute(text("ALTER TABLE page_contents ADD COLUMN image_paths TEXT"))
=======
        if "anonymous_questions" in table_names:
            anonymous_question_columns = {
                column["name"]
                for column in inspector.get_columns("anonymous_questions")
            }
            if "user_id" not in anonymous_question_columns:
                connection.execute(text("ALTER TABLE anonymous_questions ADD COLUMN user_id INTEGER"))
>>>>>>> origin/main

        if "quizzes" not in table_names:
            return

        quiz_columns = {
            column["name"]
            for column in inspector.get_columns("quizzes")
        }

        if "set_id" not in quiz_columns:
            connection.execute(text("ALTER TABLE quizzes ADD COLUMN set_id INTEGER"))

        if "sets" not in table_names:
            return

        refreshed_quiz_columns = {
            column["name"]
            for column in inspect(connection).get_columns("quizzes")
        }

        if "generation_job_id" not in refreshed_quiz_columns:
            return

        jobs_without_sets = connection.execute(
            text(
                """
                SELECT j.id, j.lecture_id, j.page_start, j.page_end
                FROM quiz_generation_jobs AS j
                LEFT JOIN sets AS s ON s.generation_job_id = j.id
                WHERE s.id IS NULL
                ORDER BY j.created_at ASC, j.id ASC
                """
            )
        ).mappings().all()

        for job in jobs_without_sets:
            next_set_number = connection.execute(
                text(
                    """
                    SELECT COALESCE(MAX(set_number), 0) + 1
                    FROM sets
                    WHERE lecture_id = :lecture_id
                    """
                ),
                {"lecture_id": job["lecture_id"]},
            ).scalar_one()

            result = connection.execute(
                text(
                    """
                    INSERT INTO sets (
                        lecture_id,
                        generation_job_id,
                        set_number,
                        page_start,
                        page_end,
                        status,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        :lecture_id,
                        :generation_job_id,
                        :set_number,
                        :page_start,
                        :page_end,
                        'DRAFT',
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    """
                ),
                {
                    "lecture_id": job["lecture_id"],
                    "generation_job_id": job["id"],
                    "set_number": next_set_number,
                    "page_start": job["page_start"],
                    "page_end": job["page_end"],
                },
            )

            connection.execute(
                text(
                    """
                    UPDATE quizzes
                    SET set_id = :set_id
                    WHERE generation_job_id = :generation_job_id
                    AND set_id IS NULL
                    """
                ),
                {
                    "set_id": result.lastrowid,
                    "generation_job_id": job["id"],
                },
            )