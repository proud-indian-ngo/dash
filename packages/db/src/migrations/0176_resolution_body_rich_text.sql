-- Resolution bodies become rich text (Plate JSON, `@pi-dash/shared/rich-text`).
-- Every body so far is plain text: one paragraph per blank-line-separated
-- block, single line breaks joined by a space, as the circular PDF printed it
-- (`plainTextToRichText`). Empty text becomes one empty paragraph. Whitespace
-- is ASCII only ([ \t\n\r\f\v], VT written \013), the set the JavaScript
-- helper uses, so both give the same paragraphs.
UPDATE "resolution" AS r
SET "body" = converted.body
FROM (
  SELECT
    res.id,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'type', 'p',
            'children', jsonb_build_array(jsonb_build_object('text', block.text))
          )
          ORDER BY block.ord
        )
        FROM (
          SELECT
            regexp_replace(
              regexp_replace(part, E'[ \t\n\r\f\013]*\n[ \t\n\r\f\013]*', ' ', 'g'),
              E'^[ \t\n\r\f\013]+|[ \t\n\r\f\013]+$', '', 'g'
            ) AS text,
            ord
          FROM regexp_split_to_table(res.body, E'\n[ \t\n\r\f\013]*\n') WITH ORDINALITY AS t(part, ord)
        ) AS block
        WHERE block.text <> ''
      ),
      '[{"type": "p", "children": [{"text": ""}]}]'::jsonb
    )::text AS body
  FROM "resolution" AS res
) AS converted
WHERE r.id = converted.id;
